"""
InsightLoop AI Service — Node: Summarize (Stub)
===============================================
LangGraph node that generates a 1-2 sentence human-readable summary
of the entire feedback response using the Gemini LLM.

This is the second (and final) LLM call in the pipeline.

TODO: Implement after pipeline node design is finalized.
"""

from app.pipeline.state import FeedbackState


async def summarize_node(state: FeedbackState) -> FeedbackState:
    """
    Node 3 (or TBD): LLM-based summary generation.

    Takes all ratings, text answers, and derived overall fields,
    builds a compact context, and generates a 1-2 sentence summary.

    Prompt rules: factual, specific, no starting with "The customer".

    Args:
        state (FeedbackState): State with all derived fields populated.

    Returns:
        FeedbackState: State updated with state["summary"].

    TODO: Implement once node design is decided.
    """
    raise NotImplementedError("summarize_node not yet implemented.")
