"""
InsightLoop AI Service — Schemas for POST /query
=================================================
Pydantic models for the AI chat/query endpoint.

Key design point: FastAPI is stateless for chat. Node backend manages the
`chat_sessions` MongoDB document and sends the FULL chat history on every
request. FastAPI does not store or retrieve history itself.
"""

from typing import Literal
from pydantic import BaseModel, Field


# ── Request Models ────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    """
    A single message in the conversation history.

    Node backend constructs this list from the `chat_sessions.messages`
    MongoDB document and sends it on every query request.
    """

    role: Literal["user", "assistant"] = Field(
        ...,
        description="'user' for business owner messages, 'assistant' for AI responses.",
    )
    content: str = Field(
        ...,
        description="Full text content of the message.",
    )


class QueryRequest(BaseModel):
    """
    Request body for POST /query.

    Sent by Node backend when a business owner submits a message in the
    AI Chat UI. Includes the full conversation history so FastAPI can
    maintain context across turns without storing state itself.

    Scoping: Every query is scoped to a single form_id. Cross-form
    queries are not supported — the LLM only sees data for this form.
    """

    query: str = Field(
        ...,
        description="The business owner's current question or message.",
    )
    business_id: str = Field(
        ...,
        description="Business UUID. Used for tenant isolation in vector search.",
    )
    form_id: str = Field(
        ...,
        description=(
            "Form UUID. All RAG retrieval and aggregations are scoped to this form. "
            "The LLM also receives schema context specific to this form's questions."
        ),
    )
    session_id: str = Field(
        ...,
        description="Session UUID. Used to log this query to MongoDB ai_queries collection.",
    )
    chat_history: list[ChatMessage] = Field(
        default_factory=list,
        description=(
            "Full conversation history (all previous turns). "
            "Empty list for the first message in a new session. "
            "FastAPI converts these to LangChain HumanMessage/AIMessage objects."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "query": "What are the most common complaints this month?",
                "business_id": "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                "form_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                "session_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
                "chat_history": [
                    {
                        "role": "user",
                        "content": "How many responses did we get this week?",
                    },
                    {
                        "role": "assistant",
                        "content": "You received 47 responses this week for this form.",
                    },
                ],
            }
        }
    }


# ── Response Models ───────────────────────────────────────────────────────────


class Source(BaseModel):
    """
    A retrieved feedback response used as a source for the AI's answer.

    Returned alongside the answer so the frontend can render citation pills.
    Business owner can click a source to see the full original response.
    This prevents hallucination — every claim in the answer is backed by real data.
    """

    response_id: str = Field(
        ...,
        description="UUID of the source feedback response. Links to MongoDB responses collection.",
    )
    submitted_at: str = Field(
        ...,
        description="ISO 8601 timestamp of when this feedback was submitted.",
    )
    snippet: str = Field(
        ...,
        description=(
            "A short, relevant excerpt from the feedback text — the part that was "
            "most relevant to the query. Used as the citation preview in the UI."
        ),
    )


class QueryResponse(BaseModel):
    """
    Response body for POST /query.

    The `query_type` field tells the frontend how the answer was generated:
        - 'qualitative'  → Retrieved via RAG (semantic search of feedback text)
                           `sources` will be non-empty.
        - 'quantitative' → Answered via data aggregation (counts, averages, trends)
                           `sources` will typically be empty.

    The frontend may use `query_type` to decide how to style the response
    (e.g., show source pills only for qualitative answers).
    """

    answer: str = Field(
        ...,
        description="The AI-generated answer to the business owner's question.",
    )
    sources: list[Source] = Field(
        default_factory=list,
        description=(
            "Feedback responses retrieved by RAG that supported the answer. "
            "Shown as citation pills in the chat UI. "
            "Empty for quantitative queries."
        ),
    )
    query_type: Literal["qualitative", "quantitative"] = Field(
        ...,
        description=(
            "'qualitative' if answered via RAG (semantic retrieval), "
            "'quantitative' if answered via data aggregation."
        ),
    )
    tokens_used: int = Field(
        default=0,
        description=(
            "Total tokens consumed by the LLM for this query "
            "(prompt + completion). Used for cost tracking in ai_queries log."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "answer": "The most common complaints this month are about food temperature (14 responses) and slow service during peak hours (9 responses).",
                "sources": [
                    {
                        "response_id": "550e8400-e29b-41d4-a716-446655440000",
                        "submitted_at": "2026-04-12T18:30:00Z",
                        "snippet": "biryani arrived cold and we waited almost 40 minutes",
                    },
                    {
                        "response_id": "550e8400-e29b-41d4-a716-446655440001",
                        "submitted_at": "2026-04-11T13:00:00Z",
                        "snippet": "food was cold by the time it reached our table",
                    },
                ],
                "query_type": "qualitative",
                "tokens_used": 1152,
            }
        }
    }
