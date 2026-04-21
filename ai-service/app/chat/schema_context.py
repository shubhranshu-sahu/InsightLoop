"""
InsightLoop AI Service — Schema Context Builder (Stub)
======================================================
Builds a natural-language description of the form's question structure
by reading from the MySQL questions table.

This context is injected into the chat LLM's system prompt on every
/query request so the LLM knows exactly what questions this form has
and what fields are available in the responses.

Output example:
    Form: "Dining Experience Feedback"
    Total analyzed responses: 142

    Questions in this form:
      [uuid-q1] RATING (1-5): "How was your overall experience?"
      [uuid-q2] RATING (1-5): "Rate the food quality"
      [uuid-q4] TEXT (open-ended): "What could we do better?"
      [uuid-q6] YES/NO: "Would you recommend us?"

    AI-derived fields available per response:
      - overall_sentiment: "positive" | "neutral" | "negative"
      - urgency: "low" | "medium" | "high"
      - is_complaint: true | false
      - dominant_topic: string
"""


async def build_schema_context(form_id: str) -> str:
    """
    Build the form schema context string for injection into LLM system prompt.

    Reads from MySQL: feedback_forms (title) + questions (type, text, order)
    Reads from MongoDB: count of fully analyzed responses

    Args:
        form_id (str): The form to build context for.

    Returns:
        str: Multi-line schema description ready for LLM system prompt.

    TODO: Implement after MySQL connection is working.
    """
    raise NotImplementedError("Schema context builder not yet implemented.")
