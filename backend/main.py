"""
Lumi CLI — minimal stateless dev client.

The agent is stateless (client-authoritative), so this CLI owns the "state":
a small in-memory context (profile, goals, transactions, history). Useful for
testing the agent without the web frontend.

Usage:
    python main.py
"""

import re
import json
import asyncio

from agent import LumiAgent

# In-memory context — this CLI is the "client".
CTX = {
    "profile": {"name": "Dev", "income": 4000, "stage": "Young Adult", "risk": "Balanced"},
    "goals": [{"id": "g1", "name": "Emergency Fund", "target_amount": 6000, "current_amount": 2000}],
    "transactions": [],
    "preferences": {},
    "history": [],
}

agent = LumiAgent()


async def _collect(stream):
    out = ""
    async for ev in stream:
        if "token" in ev:
            out += ev["token"]
    return out


def _apply_action(action: dict):
    """Apply a confirmed __ACTION__ to the in-memory context (the CLI is the client)."""
    tool, p = action.get("tool"), action.get("params", {})
    if tool == "update_transactions":
        CTX["transactions"].insert(0, {
            "amount": float(p.get("amount") or 0), "category": p.get("category", "Others"),
            "merchant": p.get("description", "Unknown"),
            "date": __import__("datetime").date.today().isoformat(),
        })
    elif tool == "create_goal":
        CTX["goals"].append({
            "id": f"g{len(CTX['goals'])+1}", "name": p.get("name", "Goal"),
            "target_amount": float(p.get("target_amount") or 0), "current_amount": 0,
        })
    elif tool == "modify_goal":
        u = p.get("updates", {})
        u = json.loads(u) if isinstance(u, str) else u
        g = next((x for x in CTX["goals"] if x["id"] == p.get("goal_id")), CTX["goals"][0] if CTX["goals"] else None)
        if g:
            g.update({k: v for k, v in u.items() if k in ("name", "target_amount", "current_amount")})


def main():
    print("\n🌸 Lumi CLI (stateless) — type 'quit' to exit\n")
    opener = agent.get_opener(CTX)
    print(f"Lumi: {opener}\n")
    CTX["history"].append({"role": "assistant", "content": opener})

    while True:
        try:
            msg = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nLumi: Take care!")
            break
        if not msg:
            continue
        if msg.lower() == "quit":
            print("Lumi: Take care!")
            break

        CTX["history"].append({"role": "user", "content": msg})
        full = asyncio.run(_collect(agent.achat_stream(msg, CTX)))

        marker = full.find("__ACTION__")
        if marker != -1:
            text = full[:marker].strip()
            print(f"\nLumi: {text}")
            try:
                action = json.loads(full[marker + len("__ACTION__"):].strip())
                if input(f"  → Confirm: {action.get('display','this action')}? [y/N] ").strip().lower() == "y":
                    _apply_action(action)
                    result = {"ok": True}
                    reply = asyncio.run(_collect(agent.aconfirm_message(action, result, CTX)))
                    print(f"Lumi: {reply}\n")
                    CTX["history"].append({"role": "assistant", "content": reply})
                else:
                    print("Lumi: No worries, cancelled.\n")
            except Exception as e:
                print(f"  (bad action: {e})\n")
            if text:
                CTX["history"].append({"role": "assistant", "content": text})
        else:
            print(f"\nLumi: {full}\n")
            CTX["history"].append({"role": "assistant", "content": full})


if __name__ == "__main__":
    main()
