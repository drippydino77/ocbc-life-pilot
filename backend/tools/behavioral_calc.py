"""
Pure behavioral analysis — computed from a transactions list, no files.

Transactions are the client format: {amount, category, merchant, date, source}.
Everything here is derived (not stored): given the same transactions you get the
same insights, so there's nothing to persist.
"""

from datetime import datetime, timedelta
from collections import defaultdict


def _cutoff(days: int) -> str:
    return (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")


def recent(transactions: list, days: int) -> list:
    c = _cutoff(days)
    return [t for t in transactions if str(t.get("date", ""))[:10] >= c]


def spending_by_category(transactions: list, days: int = 30) -> dict:
    out = defaultdict(float)
    for t in recent(transactions, days):
        out[t.get("category") or "Others"] += float(t.get("amount") or 0)
    return dict(sorted(out.items(), key=lambda x: x[1], reverse=True))


def total_spending(transactions: list, days: int = 30) -> float:
    return sum(float(t.get("amount") or 0) for t in recent(transactions, days))


def summary_for_prompt(transactions: list, income: float | None = None) -> str:
    """Concise alerts/insights string for system-prompt injection."""
    if not transactions:
        return "No spending data yet."

    spend_30 = spending_by_category(transactions, 30)
    total_30 = sum(spend_30.values())
    total_7 = total_spending(transactions, 7)

    alerts, insights = [], []

    if spend_30:
        top_cat = next(iter(spend_30))
        top_amt = spend_30[top_cat]
        pct = (top_amt / total_30 * 100) if total_30 else 0
        insights.append(f"Biggest category this month: {top_cat} at ${top_amt:,.0f} ({pct:.0f}% of spend).")
        if pct > 40:
            alerts.append(f"{top_cat} is {pct:.0f}% of spending — quite concentrated.")

    if total_30:
        weekly_avg = total_30 / 4.3
        if total_7 > weekly_avg * 1.2:
            alerts.append(f"Spent ${total_7:,.0f} this week — {((total_7/weekly_avg)-1)*100:.0f}% above the weekly average.")
        elif 0 < total_7 < weekly_avg * 0.8:
            insights.append(f"Good week — ${total_7:,.0f} spent, below the weekly average.")

    if income:
        rate = ((income - total_30) / income) * 100
        if rate < 20:
            alerts.append(f"Estimated savings rate is {rate:.0f}% (aim for 20%+).")
        elif rate >= 30:
            insights.append(f"Estimated savings rate is {rate:.0f}% — strong.")

    parts = []
    if alerts:
        parts.append("ALERTS:\n" + "\n".join(f"  ⚠️ {a}" for a in alerts))
    if insights:
        parts.append("INSIGHTS:\n" + "\n".join(f"  📊 {i}" for i in insights))
    parts.append(f"\nTotal spend — 30d: ${total_30:,.0f}, 7d: ${total_7:,.0f}")
    return "\n".join(parts)
