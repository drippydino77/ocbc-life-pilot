"""
Read-only financial tools — Lumi uses these to fetch user data
before giving advice.

MVP: Returns mock data. In production, these would call OCBC's APIs.
"""

import json
from datetime import datetime, timedelta
from langchain_core.tools import tool
from tools import request_ctx, behavioral_calc


@tool
def get_goals() -> str:
    """Get all the user's financial goals with progress.

    Returns a list of goals including: name, target amount, current amount,
    deadline, and status. Use this to understand what the user is saving for
    before giving financial advice.
    """
    return json.dumps(request_ctx.get_goals(), indent=2)


@tool
def get_recent_transactions(num_days: int = 7) -> str:
    """Get the user's recent transactions from the last N days.

    Args:
        num_days: Number of days to look back (default 7, max 90)

    Returns a list of transactions with date, category, merchant, and amount.
    Use this to understand recent spending behavior.
    """
    num_days = min(max(num_days, 1), 90)  # Clamp between 1 and 90

    transactions = behavioral_calc.recent(request_ctx.get_transactions(), num_days)[:50]

    return json.dumps({
        "period_days": num_days,
        "total_transactions": len(transactions),
        "transactions": transactions,
    }, indent=2)


@tool
def get_balance() -> str:
    """Get the user's current account balance and summary.
    
    Returns balance information across all accounts. Use this to check
    the user's financial position before making recommendations.
    """
    # MVP: Mock balance data
    # In production, this would call OCBC's account API
    balance_data = {
        "accounts": [
            {
                "account_name": "OCBC 360 Account",
                "account_type": "savings",
                "balance": 12350.75,
                "currency": "SGD",
                "interest_rate": "3.85%",
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
            },
            {
                "account_name": "OCBC Bonus+ Account",
                "account_type": "savings",
                "balance": 3200.00,
                "currency": "SGD",
                "interest_rate": "1.20%",
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
            },
            {
                "account_name": "OCBC Credit Card",
                "account_type": "credit",
                "balance": -850.50,
                "credit_limit": 5000,
                "currency": "SGD",
                "payment_due": (datetime.now() + timedelta(days=12)).strftime("%Y-%m-%d"),
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
            },
        ],
        "total_savings": 15550.75,
        "total_debt": 850.50,
        "net_worth": 14700.25,
    }
    
    return json.dumps(balance_data, indent=2)


@tool
def get_spending_summary(period: str = "monthly") -> str:
    """Get a spending summary broken down by category.
    
    Args:
        period: 'weekly' for last 7 days, 'monthly' for last 30 days
    
    Returns category-wise spending totals and percentages.
    Use this to understand where the user's money is going.
    """
    days = 7 if period == "weekly" else 30
    spending = behavioral_calc.spending_by_category(request_ctx.get_transactions(), days)
    total = sum(spending.values())
    
    breakdown = []
    for category, amount in spending.items():
        pct = (amount / total * 100) if total > 0 else 0
        breakdown.append({
            "category": category,
            "amount": round(amount, 2),
            "percentage": round(pct, 1),
        })
    
    return json.dumps({
        "period": period,
        "total_spending": round(total, 2),
        "breakdown": breakdown,
    }, indent=2)


@tool
def get_today() -> str:
    """Get today's date. Use this whenever the user refers to a relative date
    such as 'next month', '3 months from now', 'end of year', 'by Christmas',
    or any deadline that requires knowing the current date to calculate.
    """
    today = datetime.now()
    return json.dumps({
        "today": today.strftime("%Y-%m-%d"),
        "day_of_week": today.strftime("%A"),
        "month": today.strftime("%B"),
        "year": today.year,
    })


# List of all read tools for easy import
READ_TOOLS = [get_goals, get_recent_transactions, get_balance, get_spending_summary, get_today]
