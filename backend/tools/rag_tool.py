"""
RAG tool — allows Lumi to search the OCBC knowledge base.

This tool is registered alongside the financial tools and can be called
by the agent when users ask about OCBC products, services, or promotions.
"""

from langchain_core.tools import tool


@tool
def search_ocbc_info(query: str) -> str:
    """Search OCBC's knowledge base for information about products, services, promotions, and banking details.
    
    Use this tool whenever the user asks about:
    - OCBC savings accounts, credit cards, loans, or insurance
    - Interest rates, fees, or eligibility requirements
    - Current promotions, sign-up bonuses, or referral rewards
    - Digital banking features (OCBC app, PayNow, card controls)
    - Investment products or rewards programs
    - Any general OCBC banking question
    
    Args:
        query: A clear search query describing what information you need.
               Be specific — e.g. "OCBC 360 account interest rates" or "credit card cashback comparison"
    
    Returns relevant information from OCBC's product documentation.
    Always cite the source document when using this information in your response.
    """
    from rag import search_ocbc_knowledge
    return search_ocbc_knowledge(query)


RAG_TOOLS = [search_ocbc_info]
