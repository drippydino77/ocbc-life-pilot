"""
Request-scoped context — the client's state snapshot for one chat request.

In the client-authoritative model the server is stateless: the browser sends its
current state (profile, goals, transactions, preferences, recent history) with
each request, and the agent + read tools work off THIS, not files.

Uses a contextvar so it propagates across asyncio await points and into the
executor threads LangGraph uses to run nodes during streaming.
"""

import contextvars

_ctx = contextvars.ContextVar("lumi_request_ctx", default=None)


def set_context(context: dict | None):
    _ctx.set(context or {})


def get_context() -> dict:
    return _ctx.get() or {}


def get_goals() -> list:
    return get_context().get("goals", []) or []


def get_transactions() -> list:
    return get_context().get("transactions", []) or []


def get_profile() -> dict:
    return get_context().get("profile", {}) or {}


def get_preferences() -> dict:
    return get_context().get("preferences", {}) or {}


def get_history() -> list:
    return get_context().get("history", []) or []


def get_feedback() -> dict:
    # {confirmed:{tool:n}, cancelled:{tool:n}, recentCancels:[{tool,display}]}
    return get_context().get("feedback", {}) or {}
