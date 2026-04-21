"""
InsightLoop AI Service — Quantitative Data Tool (Stub)
======================================================
Phase 3 chat tool. Fetches processed responses from MongoDB,
flattens them into a pandas DataFrame, and returns aggregated stats.

Usage (Phase 3): Given as a LangChain tool to the chat agent.
The LLM calls this when the question requires numbers, averages,
counts, or trends — NOT for what customers wrote (use RAG for that).

Examples of questions it handles:
    - "What is the average food quality rating?"
    - "How many complaints did we get this month?"
    - "Are sentiment scores improving over time?"
"""

# TODO: Implement Phase 3 data tool
# import pandas as pd
# from langchain.tools import tool
# from app.db.mongo import get_db


# @tool
# async def query_feedback_data(question: str, form_id: str, business_id: str) -> str:
#     """
#     Use for questions requiring numbers, averages, counts, or trends.
#     Do NOT use for questions about what customers wrote — use retrieve_feedback instead.
#     """
#     db = await get_db()
#     docs = await db.responses.find(
#         {"form_id": form_id, "business_id": business_id, "ai_analysis.status": "done"},
#         {"_id": 0, "answers": 1, "ai_analysis": 1, "submitted_at": 1}
#     ).to_list(length=1000)
#     # ... flatten to DataFrame and return stats
