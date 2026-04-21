"""
InsightLoop AI Service — FeedbackState TypedDict
=================================================
Defines the state object that flows through every node of the LangGraph pipeline.

The graph is invoked with an initial state (input fields populated).
Each node receives the full state dict, populates its own output fields,
and returns the updated state. The final state after all nodes is used
to build the AnalyzeResponse.

Modifying the pipeline:
    Adding a node  → add its output fields here and in graph.py
    Removing a node → remove its fields and unlink it in graph.py
    The contract is: nodes only READ fields set before them, only WRITE their own fields.
"""

from typing import Optional, TypedDict


class FeedbackState(TypedDict):
    """
    State object for the LangGraph feedback analysis pipeline.

    Passed into the graph via:
        final_state = await feedback_graph.ainvoke(initial_state)

    Field groups:
        Input       — set before graph.ainvoke(), never modified by nodes
        Node 1 out  — set by analyze_text_node
        Node 2 out  — set by derive_overall_node
        Node 3 out  — set by summarize_node
        Node 4 out  — set by embed_store_node
        Error       — set by any node on failure
    """

    # ── Input — set once before graph invocation ─────────────────────────────
    response_id: str
    """UUID of the feedback response. Used to update MongoDB."""

    form_id: str
    """UUID of the form. Used for vector store filtering and MongoDB update."""

    business_id: str
    """UUID of the business (tenant). Used for data isolation."""

    submitted_at: str
    """ISO 8601 timestamp of when the customer submitted this response."""

    answers: dict
    """
    Map of question_id → {label: str, type: str, value: bool|int|str}.
    Same structure as the MongoDB answers map and the AnalyzeRequest.answers field.
    Nodes read from this but never modify it.
    """

    # ── Set by Node 1: analyze_text_node ─────────────────────────────────────
    per_text_analysis: dict
    """
    Map of question_id → analysis dict for text-type answers.
    Each value has: label, raw_answer, sentiment, sentiment_score,
    topics, key_phrases, intent, emotions.
    Empty dict if the form has no text questions.
    """

    # ── Set by Node 2: derive_overall_node ───────────────────────────────────
    overall_sentiment: str
    """
    Derived from ratings + text sentiments.
    One of: "positive" | "neutral" | "negative"
    """

    sentiment_score: float
    """Confidence score for overall_sentiment. 0.0 to 1.0."""

    urgency: str
    """
    Derived from sentiment + intent + ratings.
    One of: "low" | "medium" | "high"
    high = negative + complaint intent + avg_rating <= 2
    """

    is_complaint: bool
    """True if any text answer has intent = "complaint"."""

    dominant_topic: str
    """Most frequently mentioned topic across all text answers. "General" if none."""

    # ── Set by Node 3: summarize_node ────────────────────────────────────────
    summary: str
    """1–2 sentence human-readable LLM-generated summary of the full response."""

    # ── Set by Node 4: embed_store_node ──────────────────────────────────────
    embedding_stored: bool
    """
    True if the document was successfully embedded and stored in ChromaDB.
    False in dev mode (DB calls skipped).
    Set to False by default in the initial state; node 4 updates it.
    """

    # ── Error tracking ────────────────────────────────────────────────────────
    error: Optional[str]
    """
    Set by any node if it catches an exception.
    None when everything succeeds.
    Surfaced in the AnalyzeResponse when status = "failed".
    """
