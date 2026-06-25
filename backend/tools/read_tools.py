"""
Read-only financial tools — Lumi uses these to fetch user data
before giving advice.

MVP: Returns mock data. In production, these would call OCBC's APIs.
"""

import os
import json
import calendar
import httpx
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


@tool
def calculate_date(days: int = 0, weeks: int = 0, months: int = 0, years: int = 0, end_of_month: bool = False) -> str:
    """Calculate a future (or past) date by adding an offset to today's date.

    ALWAYS use this tool when the user mentions any relative date — you cannot
    reliably do calendar arithmetic yourself (month lengths vary, leap years, etc).

    Args:
        days:         days to add (e.g. "in 5 days" → days=5)
        weeks:        weeks to add (e.g. "in 2 weeks" → weeks=2)
        months:       months to add (e.g. "next month" → months=1, "in 3 months" → months=3)
        years:        years to add (e.g. "next year" → years=1)
        end_of_month: if True, snap to the last day of the resulting month
                      (use for "end of next month", "end of the year", etc.)

    All args default to 0 — pass only the ones you need.

    Examples:
        "next month"           → months=1
        "in 2 weeks"           → weeks=2
        "in 3 months"          → months=3
        "in 1 year and 5 days" → years=1, days=5
        "end of next month"    → months=1, end_of_month=True
        "in 6 weeks"           → weeks=6
    """
    today = datetime.now()

    # Add years and months with correct calendar arithmetic
    total_months = today.month - 1 + months + years * 12
    new_year = today.year + total_months // 12
    new_month = total_months % 12 + 1

    # Clamp day to last valid day in the target month (handles Feb 28/29, etc.)
    max_day = calendar.monthrange(new_year, new_month)[1]
    new_day = min(today.day, max_day)
    result = datetime(new_year, new_month, new_day)

    # Add days and weeks after month arithmetic
    result += timedelta(days=days + weeks * 7)

    # Snap to end of month if requested
    if end_of_month:
        max_day = calendar.monthrange(result.year, result.month)[1]
        result = result.replace(day=max_day)

    return json.dumps({
        "result_date": result.strftime("%Y-%m-%d"),
        "day_of_week": result.strftime("%A"),
        "days_from_today": (result - today.replace(hour=0, minute=0, second=0, microsecond=0)).days,
    })


@tool
def fetch_url(url: str) -> str:
    """Fetch and read the content of any webpage or product URL.

    Use this when the user sends a link (e.g. a Shopee, Lazada, Amazon, or any
    other product page). Returns the page content as clean text so you can extract
    the product name, price, and description to give financial advice.

    Args:
        url: The full URL to fetch (must start with http:// or https://)
    """
    if not url.startswith(("http://", "https://")):
        return json.dumps({"error": "Invalid URL — must start with http:// or https://"})
    jina_url = f"https://r.jina.ai/{url}"
    try:
        resp = httpx.get(jina_url, timeout=15, headers={"Accept": "text/plain"})
        resp.raise_for_status()
        # Trim to 3000 chars — enough for product info, won't blow the context window
        text = resp.text.strip()[:3000]
        return json.dumps({"url": url, "content": text})
    except Exception as e:
        return json.dumps({"error": f"Could not fetch URL: {e}"})


@tool
def search_web(query: str) -> str:
    """Search the web for current information, prices, or product comparisons.

    Use this for open-ended questions like "how much does X cost in Singapore?",
    "is this a good deal?", or "what's the average price of Y?". Returns a
    summary of the top search results.

    Args:
        query: The search query (be specific — include location like "Singapore" if relevant)
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        return json.dumps({"error": "TAVILY_API_KEY not configured"})
    try:
        from tavily import TavilyClient
        client = TavilyClient(api_key=api_key)
        results = client.search(query, max_results=4, search_depth="basic")
        snippets = [
            {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:300]}
            for r in results.get("results", [])
        ]
        return json.dumps({"query": query, "results": snippets})
    except Exception as e:
        return json.dumps({"error": f"Search failed: {e}"})


# List of all read tools for easy import
READ_TOOLS = [get_goals, get_recent_transactions, get_balance, get_spending_summary, get_today, calculate_date, fetch_url, search_web]
