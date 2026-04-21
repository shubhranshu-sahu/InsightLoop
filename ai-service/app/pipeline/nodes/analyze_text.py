"""
InsightLoop AI Service — Node: Text Analysis (Stub)
====================================================
LangGraph node responsible for analyzing text-type answers using the Gemini LLM.

Processes ALL text answers in a single LLM call to minimize latency and cost.
Ratings and yes/no answers are skipped — they are handled rule-based in derive_overall.

TODO: Implement after pipeline node design is finalized.
"""

from app.pipeline.state import FeedbackState

# TODO: Import Gemini LLM from app.vector.embedder or a shared llm module
# from langchain_google_genai import ChatGoogleGenerativeAI
# from langchain.schema import SystemMessage, HumanMessage


async def analyze_text_node(state: FeedbackState) -> FeedbackState:
    """
    Node 1 (or TBD): LLM-based text analysis.

    Extracts: sentiment, sentiment_score, topics, key_phrases, intent, emotions
    for each text-type answer. Results stored in state["per_text_analysis"].

    Skips LLM call entirely if form has no text answers.

    Args:
        state (FeedbackState): Current pipeline state with raw answers.

    Returns:
        FeedbackState: State updated with per_text_analysis.

    TODO: Implement once node design is decided.
    """
    raise NotImplementedError("analyze_text_node not yet implemented.")
