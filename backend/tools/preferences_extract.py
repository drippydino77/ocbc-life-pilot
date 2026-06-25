"""
Preference extraction — pure function, no files.

Given a user message, returns a DELTA of newly-learned preferences (or {}). The
client merges + persists it (localStorage for guests, Supabase for signed-in).
Only extracts things with a direct financial-advice implication.
"""

import json

_FIELDS = {"communication_style", "financial_anxiety_level", "risk_attitude",
           "savings_commitment", "life_notes"}

EXTRACTION_PROMPT = """You are extracting user preferences from a chat message to help a financial AI remember how to assist this person better in future sessions.

Only extract something if it would DIRECTLY change how financial advice is given. If in doubt, do not extract.

Fields you may extract:
  communication_style (string): one of: casual, formal, brief — only if explicitly stated or clearly frustrated by current style.
  financial_anxiety_level (string): one of: low, medium, high — "high" if worry/panic/avoidance about money; "low" if relaxed/confident.
  risk_attitude (string): one of: conservative, moderate, aggressive — only if clearly stated.
  savings_commitment (string): one of: disciplined, moderate, tends_to_slip — only if they describe their own savings behaviour.
  life_notes (list of strings): short facts with a clear financial implication.
    Good: "supports parents monthly", "has freelance income", "planning a wedding in 2027"
    Bad: "likes coffee", "had a stressful day"
    Each under 12 words. Max 2 new notes.

Return ONLY a valid JSON object with the fields you found. Return {{}} if nothing qualifies.
Do NOT guess. Do NOT save anything without a direct financial implication.

User message: {message}

JSON:"""


def extract(message: str, llm) -> dict:
    """Return a delta dict of newly-learned preferences (empty if nothing)."""
    if llm is None or not message:
        return {}
    try:
        from langchain_core.messages import HumanMessage
        raw = llm.invoke([HumanMessage(content=EXTRACTION_PROMPT.format(message=message))]).content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        data = json.loads(raw)
        if not isinstance(data, dict):
            return {}
        return {k: v for k, v in data.items() if k in _FIELDS and v}
    except Exception:
        return {}
