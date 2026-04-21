"""
InsightLoop AI Service — Node: Derive Overall (Stub)
=====================================================
LangGraph node that computes overall-level fields from ratings and text analysis.
No LLM call — pure Python logic. Fast.

Derives: overall_sentiment, sentiment_score, urgency, is_complaint, dominant_topic

TODO: Implement after pipeline node design is finalized.
"""

from app.pipeline.state import FeedbackState


def derive_overall_node(state: FeedbackState) -> FeedbackState:
    """
    Node 2 (or TBD): Rule-based overall field derivation.

    Logic:
        overall_sentiment: avg_rating < 2.5 OR neg_count > pos_count → negative
        urgency: negative + complaint + avg_rating <= 2 → high
        is_complaint: any text answer has intent = "complaint"
        dominant_topic: Counter on all topics → most_common(1)

    Args:
        state (FeedbackState): State with per_text_analysis populated.

    Returns:
        FeedbackState: State updated with overall fields.

    TODO: Implement once node design is decided.
    """
    raise NotImplementedError("derive_overall_node not yet implemented.")
