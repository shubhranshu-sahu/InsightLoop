"""
InsightLoop AI Service — RAG Retrieval Tool (Stub)
===================================================
Phase 2 chat tool. Performs semantic similarity search against ChromaDB
to retrieve relevant customer feedback for qualitative questions.

Usage (Phase 2): Given as a LangChain tool to the chat agent.
The LLM calls this when the question is about what customers said,
specific complaints, compliments, or themes.
"""

# TODO: Implement Phase 2 RAG tool
# from langchain.tools import tool
# from app.vector.store import similarity_search_filtered


# @tool
# def retrieve_feedback(query: str, form_id: str, business_id: str, k: int = 8) -> str:
#     """
#     Retrieve semantically relevant customer feedback responses.
#     Use when the question is about what customers said, specific complaints,
#     compliments, topics, or themes in their written responses.
#     """
#     results = similarity_search_filtered(query, business_id, form_id, k)
#     if not results:
#         return "No relevant feedback found."
#     lines = [f"[{doc.metadata['submitted_at'][:10]}] {doc.page_content[:300]}" for doc in results]
#     return "\n\n---\n\n".join(lines)
