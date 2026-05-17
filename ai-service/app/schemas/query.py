"""
InsightLoop AI Service — Chat System Pydantic Schemas
=====================================================
All Pydantic models used by the /chat/* endpoints.

Why Pydantic for everything?
  Pydantic validates that incoming JSON has the right shape and types before
  any code touches the data. If something is wrong (e.g. missing field, wrong
  type), FastAPI returns a 422 automatically with a clear error message — no
  manual validation code needed.

Model groups in this file:
  1. Thread models      — create/read/list chat threads
  2. Messaging models   — send a message, receive SSE stream events
  3. SSE event models   — token, done, error events in the stream
"""

from typing import Literal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# 1.  Shared primitive
# ─────────────────────────────────────────────────────────────────────────────


class Source(BaseModel):
    """
    A retrieved feedback response used as a citation.

    Stored in MongoDB chat_threads.messages[].sources as a plain dict.
    Fields come from Qdrant document metadata (set during embed_store_node).

    All fields except response_id are optional because:
    - Old documents stored before RAG was enabled have fewer fields.
    - _parse_messages uses Source(**s) so it must tolerate missing fields.
    """

    model_config = {"extra": "ignore"}  # Silently drop unknown fields like _id, _collection_name

    response_id:       str  = Field(...,  description="UUID of the MongoDB responses document.")
    submitted_at:      str  = Field("",   description="ISO 8601 timestamp of the original response.")
    snippet:           str  = Field("",   description="Relevant excerpt from the feedback text (populated by frontend or future update).")
    overall_sentiment: str  = Field("",   description="positive | neutral | negative")
    urgency:           str  = Field("",   description="low | medium | high")
    dominant_topic:    str  = Field("",   description="Main topic detected in this feedback.")
    is_complaint:      str  = Field("",   description="'true' or 'false' string.")
    form_id:           str  = Field("",   description="Form this response belongs to.")
    business_id:       str  = Field("",   description="Business this response belongs to.")


# ─────────────────────────────────────────────────────────────────────────────
# 2.  Thread models
# ─────────────────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    """
    One message in a chat thread (either user or assistant turn).

    Stored in MongoDB chat_threads.messages array as a plain dict.
    FastAPI converts to/from this model when reading/writing MongoDB.

    Fields:
        role:      "user" = business owner, "assistant" = AI response.
        content:   Full text of the message.
        timestamp: ISO 8601 — when this message was created.
        sources:   Citation sources (Phase 1: always [], Phase 2: filled by RAG).
    """

    role:      Literal["user", "assistant"] = Field(
        ...,
        description="'user' for business owner messages, 'assistant' for AI responses.",
    )
    content:   str  = Field(..., description="Full text content of the message.")
    timestamp: str  = Field(..., description="ISO 8601 timestamp when this message was created.")
    sources:   list[Source] = Field(
        default_factory=list,
        description="RAG source citations (empty in Phase 1).",
    )


class ThreadRequest(BaseModel):
    """
    Request body for POST /chat/thread (get or create a thread).

    Node backend calls this when the business owner opens the chat page
    and selects a form. Node fetches form_title from MySQL before calling
    FastAPI, so FastAPI can store it denormalized in the thread document
    (avoids FastAPI needing to query MySQL just for the title).

    Fields:
        business_id: UUID of the business (from JWT decoded by Node).
        form_id:     UUID of the feedback form being discussed.
        form_title:  Human-readable form name (e.g. "Dining Experience Feedback").
    """

    business_id: str = Field(..., description="Business UUID from JWT.")
    form_id:     str = Field(..., description="Feedback form UUID.")
    form_title:  str = Field(..., description="Human-readable form title (from MySQL).")

    model_config = {
        "json_schema_extra": {
            "example": {
                "business_id": "biz-spice-garden-xyz",
                "form_id":     "form-dining-abc123",
                "form_title":  "Dining Experience Feedback",
            }
        }
    }


class ThreadResponse(BaseModel):
    """
    Response body for POST /chat/thread and GET /chat/thread/{bid}/{fid}.

    Returns the full thread including all messages so the frontend can
    render the complete chat history immediately on load.

    Fields:
        thread_id:     UUID of this thread document.
        is_new:        True if the thread was just created, False if it already existed.
        message_count: Total messages ever sent (including ones summarized out of the array).
        messages:      The current messages array (last CONTEXT_WINDOW_SIZE messages).
    """

    thread_id:     str = Field(..., description="UUID of the chat thread document.")
    business_id:   str
    form_id:       str
    form_title:    str
    is_new:        bool = Field(..., description="True if thread was just created.")
    message_count: int  = Field(..., description="Total messages ever (including summarized).")
    messages:      list[ChatMessage] = Field(default_factory=list)
    created_at:    str
    updated_at:    str


class ThreadSummary(BaseModel):
    """
    Compact thread info used in the sidebar list.

    Shown in the list of all chat threads for a business — each entry
    shows the form name, how many messages it has, and a preview of the
    last message sent.
    """

    thread_id:     str
    form_id:       str
    form_title:    str
    message_count: int
    last_message:  str | None = Field(
        default=None,
        description="Preview text of the last message (for sidebar display).",
    )
    updated_at: str


class ThreadListResponse(BaseModel):
    """Response body for GET /chat/threads/{business_id}."""

    threads: list[ThreadSummary] = Field(default_factory=list)


class ClearThreadResponse(BaseModel):
    """Response body for DELETE /chat/thread/{business_id}/{form_id}."""

    message:   str
    thread_id: str


# ─────────────────────────────────────────────────────────────────────────────
# 3.  Messaging models
# ─────────────────────────────────────────────────────────────────────────────


class MessageRequest(BaseModel):
    """
    Request body for POST /chat/message (the main streaming endpoint).

    Node backend builds this from the JWT (business_id) + frontend payload
    (thread_id, form_id, message) and forwards to FastAPI.

    Why include business_id and form_id when we already have thread_id?
      - Extra validation: FastAPI verifies the thread belongs to this business.
      - Needed for building the form schema context for the system prompt.

    Field constraints:
        message: min_length=1 ensures empty strings are rejected.
                 max_length=1000 prevents extremely long prompts from
                 inflating token costs and response latency.
    """

    thread_id:   str = Field(..., description="UUID of the existing chat thread.")
    business_id: str = Field(..., description="Business UUID (for tenant verification).")
    form_id:     str = Field(..., description="Form UUID (for schema context building).")
    message:     str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="The business owner's question or message (1–1000 characters).",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "thread_id":   "thread-uuid-here",
                "business_id": "biz-spice-garden-xyz",
                "form_id":     "form-dining-abc123",
                "message":     "What are the most common complaints this month?",
            }
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4.  SSE event models
# ─────────────────────────────────────────────────────────────────────────────
#
# Server-Sent Events (SSE) is a protocol where the server keeps an HTTP
# connection open and pushes chunks of data to the client as they become ready.
# Each "event" is a JSON string sent as:
#   data: {"type": "token", "token": "Hello"}\n\n
#
# The double newline \n\n is required — it signals the end of one event.
# The client reads events one at a time as they arrive.
#
# We have three event types:
#   token  — one chunk of text from the LLM. Frontend appends to the chat bubble.
#   done   — stream is complete. Frontend finalises the message, shows sources.
#   error  — something went wrong. Frontend shows an error bubble.


class TokenEvent(BaseModel):
    """
    Sent once per LLM output chunk during streaming.

    The LLM generates text token-by-token (or small groups of tokens).
    Each chunk is sent immediately as it arrives — the user sees text
    appearing in real time, just like ChatGPT.

    Fields:
        type:  Always "token" — frontend uses this to identify the event type.
        token: The text chunk. Could be a word, part of a word, or punctuation.
    """

    type:  Literal["token"] = "token"
    token: str


class DoneEvent(BaseModel):
    """
    Sent once when the LLM has finished generating the complete response.

    This is the final event in every stream. The frontend uses it to:
      - Mark the assistant message as complete
      - Render source citation chips (Phase 2)
      - Update the message count display

    Fields:
        type:          Always "done".
        sources:       Citation sources (Phase 1: always []).
        message_count: Updated total message count after this turn.
    """

    type:          Literal["done"] = "done"
    sources:       list[Source] = Field(default_factory=list)
    message_count: int = Field(default=0)


class ErrorEvent(BaseModel):
    """
    Sent if something goes wrong during stream generation.

    Two scenarios:
      1. Error before any tokens sent: full error message shown.
      2. Error mid-stream (some tokens already sent):
         message says the partial response may be incomplete.

    The frontend shows this as an error bubble. In both cases,
    the incomplete message is NOT saved to MongoDB.

    Fields:
        type:    Always "error".
        message: Human-readable error description for the user.
    """

    type:    Literal["error"] = "error"
    message: str
