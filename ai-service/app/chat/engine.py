"""
InsightLoop AI Service — Chat Engine (Stub)
===========================================
Handles natural language queries from business owners about their feedback data.

Built in three phases (each adds capability without breaking the previous):

    Phase 1: Basic LLM chat
        - Form schema context from MySQL questions table
        - Full chat history passed as LangChain messages
        - No retrieval — LLM reasons from schema description alone

    Phase 2: + RAG Tool
        - ChromaDB similarity search scoped to business_id + form_id
        - Returns sources (response_id, snippet, submitted_at) with answer

    Phase 3: + Quantitative Data Tool
        - MongoDB → pandas DataFrame aggregations
        - Powers: average ratings, complaint counts, sentiment trends

Currently: Stub only. Phase 1 to be implemented after /analyze is complete.
"""


async def run_chat(
    query: str,
    business_id: str,
    form_id: str,
    session_id: str,
    chat_history: list[dict],
) -> dict:
    """
    Run the chat engine for one turn.

    Args:
        query (str): The business owner's current question.
        business_id (str): Tenant isolation — only search this business's data.
        form_id (str): Form scope — only search this form's responses.
        session_id (str): Used for logging to ai_queries collection.
        chat_history (list[dict]): Full conversation history [{role, content}, ...].

    Returns:
        dict: {
            "answer": str,
            "sources": list[Source],
            "query_type": "qualitative" | "quantitative",
            "tokens_used": int
        }

    TODO: Implement Phase 1 first.
    """
    raise NotImplementedError("Chat engine not yet implemented.")
