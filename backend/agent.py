"""
Lumi Agent — stateless, client-authoritative.

The browser owns all user state and sends a snapshot (profile, goals,
transactions, preferences, recent history) with each request. The agent works
off that request-scoped context — never files or per-session memory. A single
shared instance holds only the compiled LangGraph.

Provider: OpenRouter (OpenAI-compatible API).
"""

import os
import json
import asyncio
from typing import Annotated, TypedDict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "xiaomi/mimo-v2.5-pro")
OPENROUTER_VISION_MODEL = os.getenv("OPENROUTER_VISION_MODEL", "xiaomi/mimo-v2.5")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

from personality import build_system_prompt
from tools.read_tools import READ_TOOLS
from tools.rag_tool import RAG_TOOLS
from tools import request_ctx, behavioral_calc, preferences_extract

# Write tools are NOT registered: Lumi proposes writes via __ACTION__ markers and
# the client executes them. The server only reads + generates language.
ALL_TOOLS = READ_TOOLS + RAG_TOOLS


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


def should_continue(state: AgentState) -> str:
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END


def _llm(temperature: float = 0.7, vision: bool = False):
    return ChatOpenAI(
        model=OPENROUTER_VISION_MODEL if vision else OPENROUTER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
        temperature=temperature,
    )


def _preferences_summary(prefs: dict) -> str:
    if not prefs:
        return ""
    parts = []
    if prefs.get("communication_style"):
        parts.append(f"Preferred communication style: {prefs['communication_style']}")
    if prefs.get("financial_anxiety_level"):
        parts.append(f"Financial anxiety level: {prefs['financial_anxiety_level']}")
    if prefs.get("risk_attitude"):
        parts.append(f"Risk attitude: {prefs['risk_attitude']}")
    if prefs.get("savings_commitment"):
        parts.append(f"Savings commitment: {prefs['savings_commitment']}")
    if prefs.get("life_notes"):
        parts.append("Life context: " + "; ".join(prefs["life_notes"]))
    return "\n".join(parts)


def _self_guidance(feedback: dict) -> str:
    """Turn the user's confirm/cancel history into behavioural guidance for Lumi.

    This is the self-improvement signal: Lumi adjusts how it proposes actions based
    on how its OWN past proposals fared (distinct from preferences about the user).
    """
    if not feedback:
        return ""
    confirmed = feedback.get("confirmed", {}) or {}
    cancelled = feedback.get("cancelled", {}) or {}
    recent = feedback.get("recentCancels", []) or []

    lines = []
    for tool, c in cancelled.items():
        conf = confirmed.get(tool, 0)
        if c >= 2 and c >= conf:
            lines.append(
                f"You've proposed '{tool}' {c} time(s) and the user CANCELLED most of them "
                f"(confirmed only {conf}). Be more cautious — only propose it when they clearly ask."
            )
    if recent:
        rejected = "; ".join(r.get("display", r.get("tool", "")) for r in recent[-5:])
        lines.append(f"Recently cancelled proposals (don't re-propose unless asked again): {rejected}.")
    return "\n".join(lines)


def _history_text(history: list) -> str:
    lines = []
    for m in (history or [])[-10:]:
        role = "User" if m.get("role") == "user" else "Lumi"
        lines.append(f"{role}: {m.get('content', '')}")
    return "\n".join(lines)


def _build_prompt() -> str:
    """Build the system prompt from the current request context (contextvar)."""
    profile = request_ctx.get_profile()
    try:
        income = float(profile["income"]) if profile.get("income") else None
    except (ValueError, TypeError):
        income = None

    behavioral = behavioral_calc.summary_for_prompt(request_ctx.get_transactions(), income)
    prefs = _preferences_summary(request_ctx.get_preferences())

    prompt = build_system_prompt(
        supabase_profile=profile,
        preferences_summary=prefs,
        behavioral_summary=behavioral,
    )

    guidance = _self_guidance(request_ctx.get_feedback())
    if guidance:
        prompt += f"\n\n═══ LEARNED FROM YOUR CONFIRM/CANCEL HISTORY ═══\n{guidance}"

    hist = _history_text(request_ctx.get_history())
    if hist:
        prompt += f"\n\n═══ RECENT CONVERSATION ═══\n{hist}"
    return prompt


class LumiAgent:
    """Stateless agent. One shared instance; all state arrives per request."""

    def __init__(self):
        self.graph = self._create_graph()
        # Low-temp model for deterministic preference extraction.
        self._extraction_llm = _llm(0.0)

    # === Graph ===

    def _agent_node(self, state: AgentState) -> dict:
        llm = _llm(0.7).bind_tools(ALL_TOOLS)
        messages = [SystemMessage(content=_build_prompt())] + state["messages"]
        return {"messages": [llm.invoke(messages)]}

    def _create_graph(self):
        graph = StateGraph(AgentState)
        graph.add_node("agent", self._agent_node)
        graph.add_node("tools", ToolNode(ALL_TOOLS))
        graph.set_entry_point("agent")
        graph.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
        graph.add_edge("tools", "agent")
        return graph.compile()

    # === Public API (all take the client's context snapshot) ===

    async def achat_stream(self, message: str, context: dict, images: list = None):
        """Stream response events. Yields {"token": str} per token.

        images: optional list of base64 data URLs ("data:image/jpeg;base64,...")
        When present, uses the vision model via a direct stream (no tool loop —
        combining tool-calling + vision is unreliable across providers).
        """
        request_ctx.set_context(context)
        if images:
            content = [{"type": "text", "text": message}] + [
                {"type": "image_url", "image_url": {"url": url}}
                for url in images
                if isinstance(url, str) and url.startswith("data:")
            ]
            system = SystemMessage(content=_build_prompt())
            async for chunk in _llm(0.7, vision=True).astream(
                [system, HumanMessage(content=content)]
            ):
                token = getattr(chunk, "content", "")
                if token:
                    yield {"token": token}
            return

        human_msg = HumanMessage(content=message)
        state = {"messages": [human_msg]}
        tool_pending = False
        async for chunk, meta in self.graph.astream(state, stream_mode="messages"):
            if meta.get("langgraph_node") != "agent":
                continue
            # If this turn is calling a tool, any text it already streamed was a
            # "let me check…" preamble. Tell the client to discard it and stream
            # only the FINAL answer (produced after the tool result). Without this
            # the user sees the preamble AND the answer = a double reply.
            if getattr(chunk, "tool_call_chunks", None):
                if not tool_pending:
                    tool_pending = True
                    yield {"reset": True}
                continue
            content = getattr(chunk, "content", "")
            if content:
                tool_pending = False
                yield {"token": content}

    def learn(self, message: str) -> dict:
        """Extract a learned-preference delta from a message (its own endpoint, so
        the client can fire-and-forget it without blocking the chat response)."""
        return preferences_extract.extract(message, self._extraction_llm)

    def get_opener(self, context: dict) -> str:
        """Proactive greeting — runs through the full agent graph so it can call
        get_goals / get_recent_transactions before speaking. This eliminates
        hallucinated goal names and amounts: the model only sees real tool results."""
        trigger = (
            "Generate your opening greeting for this session. "
            "First call get_goals and get_recent_transactions to see what's actually there. "
            "Then lead with ONE specific observation grounded in that real data "
            "(a goal that's behind, a spending pattern, or a positive insight). "
            "If there's nothing notable, greet warmly and ask what's on their mind. "
            "Under 3 sentences. Casual, human, no headers or bullets. "
            "End with one clear question or suggestion. No __ACTION__ marker."
        )
        result = asyncio.run(self._run_opener_graph(trigger, context))
        return result

    async def _run_opener_graph(self, trigger: str, context: dict) -> str:
        request_ctx.set_context(context)
        state = {"messages": [HumanMessage(content=trigger)]}
        final = ""
        async for chunk, meta in self.graph.astream(state, stream_mode="messages"):
            if meta.get("langgraph_node") != "agent":
                continue
            if getattr(chunk, "tool_call_chunks", None):
                continue
            final += getattr(chunk, "content", "")
        return final.strip()

    async def aconfirm_message(self, actions: list, result: dict, context: dict):
        """Stream a natural confirmation AFTER the client executed the write(s).

        The client already performed every action and knows the real combined
        outcome (result.ok), so Lumi's message is always accurate — no
        hallucination, and the server persisted nothing.
        """
        request_ctx.set_context(context)
        prompt = _build_prompt()
        summary = "; ".join((a or {}).get("display", "an action") for a in (actions or [])) or "that"
        if result.get("ok"):
            trigger = (
                f'You just completed the following for the user: {summary}. They all succeeded. '
                f"Confirm warmly in ONE short sentence (mention all of them naturally). No __ACTION__ marker."
            )
        else:
            trigger = (
                f'You tried the following for the user: {summary}, but at least one FAILED '
                f'(reason: {result.get("reason", "unknown")}). Apologize in ONE short sentence '
                f"and suggest trying again. No __ACTION__ marker."
            )
        async for chunk in _llm(0.6).astream(
            [SystemMessage(content=prompt), HumanMessage(content=trigger)]
        ):
            content = getattr(chunk, "content", "")
            if content:
                yield content
