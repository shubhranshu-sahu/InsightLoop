"""
InsightLoop AI Service — Chat Routes
=====================================
All /chat/* endpoints. Five endpoints total:

  POST   /chat/thread                        — get or create a chat thread
  POST   /chat/message                       — send message, receive SSE stream
  GET    /chat/threads/{business_id}         — list all threads (sidebar)
  GET    /chat/thread/{business_id}/{form_id}— get full thread with messages
  DELETE /chat/thread/{business_id}/{form_id}— clear thread history

All routes require X-Internal-Secret header (enforced by middleware in main.py).
Node backend is always the caller — frontend never calls FastAPI directly.

Key concept — StreamingResponse:
  POST /chat/message returns a StreamingResponse instead of a regular JSON
  response. This means FastAPI doesn't wait for the full response to be ready
  — it keeps the HTTP connection open and sends chunks as they arrive.

  The client (Node backend) receives an open stream and must pipe it through
  to the frontend. See the roadmap for Node's piping code.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pymongo import ReturnDocument

from app.chat.engine import run_chat_stream
from app.db.mongo import get_db
from app.schemas.query import (
    ClearThreadResponse,
    MessageRequest,
    ThreadListResponse,
    ThreadRequest,
    ThreadResponse,
    ThreadSummary,
)

router = APIRouter()


# ─────────────────────────────────────────────────────────────────────────────
# POST /chat/thread — get or create a chat thread
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/thread",
    response_model=ThreadResponse,
    summary="Get or Create Chat Thread",
    description="""
Called when a business owner opens the chat page and selects a form.

- If a thread already exists for `(business_id, form_id)`: returns it with full messages.
- If no thread exists: creates one with empty messages, returns with `is_new: true`.

Uses MongoDB `findOneAndUpdate` with `upsert=true` — this is **atomic** (race-condition safe).
Even if two requests arrive at the same time for the same form, only one thread is created.
    """,
)
async def get_or_create_thread(body: ThreadRequest) -> ThreadResponse:
    """
    Atomically get or create a chat thread for the given (business_id, form_id) pair.

    Uses MongoDB's $setOnInsert operator which only applies the fields on INSERT,
    not on UPDATE. This means: if the thread exists, nothing changes. If it's
    new, all fields are initialized.

    Args:
        body: ThreadRequest with business_id, form_id, form_title.

    Returns:
        ThreadResponse with full thread details and is_new flag.
    """
    db  = await get_db()
    now = datetime.now(timezone.utc).isoformat()

    import uuid  # noqa: PLC0415 — local import to avoid top-level uuid dep

    # $setOnInsert only runs when a new document is INSERTED (upsert).
    # If the document already exists, the update is a no-op.
    result = await db.chat_threads.find_one_and_update(
        # Filter: find by (business_id, form_id)
        {"business_id": body.business_id, "form_id": body.form_id},
        # Update: only set these fields if inserting (not updating existing)
        {"$setOnInsert": {
            "thread_id":       str(uuid.uuid4()),
            "business_id":     body.business_id,
            "form_id":         body.form_id,
            "form_title":      body.form_title,
            "messages":        [],
            "context_summary": "",
            "message_count":   0,
            "created_at":      now,
            "updated_at":      now,
        }},
        upsert=True,                         # Create if not found
        return_document=ReturnDocument.AFTER, # Return the doc AFTER the operation
    )

    # If result is None (shouldn't happen with upsert=True, but guard anyway)
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to get or create thread.")

    # Determine if this was a new creation by checking created_at vs now
    # A doc created "now" (within 1 second) is new.
    created_at = result.get("created_at", "")
    is_new = created_at == now  # Both set to the same `now` only on insert

    # Build ChatMessage objects from raw dicts in the messages array
    messages = _parse_messages(result.get("messages", []))

    return ThreadResponse(
        thread_id=     result["thread_id"],
        business_id=   result["business_id"],
        form_id=       result["form_id"],
        form_title=    result.get("form_title", ""),
        is_new=        is_new,
        message_count= result.get("message_count", 0),
        messages=      messages,
        created_at=    result.get("created_at", now),
        updated_at=    result.get("updated_at", now),
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /chat/message — send message, receive SSE stream
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/message",
    summary="Send Chat Message (Streaming)",
    description="""
The main chat endpoint. Sends the user's message to the AI and streams the response
back as **Server-Sent Events (SSE)**.

**Why StreamingResponse and not JSON?**
JSON responses wait for the full response before sending anything.
SSE keeps the connection open and sends text chunks as the LLM produces them —
the user sees words appearing in real-time, like ChatGPT.

**SSE event format** (each line sent over the stream):
```
data: {"type": "token", "token": "Hello"}\\n\\n
data: {"type": "token", "token": " world"}\\n\\n
data: {"type": "done",  "sources": [], "message_count": 6}\\n\\n
```

**On error** (before or after streaming starts):
```
data: {"type": "error", "message": "AI service temporarily unavailable..."}\\n\\n
```

**Note:** This endpoint has no `response_model` because StreamingResponse is not
a JSON response — Pydantic validation doesn't apply here.
    """,
)
async def send_message(body: MessageRequest) -> StreamingResponse:
    """
    Stream the AI response to the user's message via SSE.

    Does NOT directly call the LLM — delegates entirely to run_chat_stream()
    in engine.py, which manages the full pipeline: guardrails → graph → stream.

    Args:
        body: MessageRequest with thread_id, business_id, form_id, message.

    Returns:
        StreamingResponse: An open HTTP response that yields SSE events.
            The client must read this as a stream (not buffer to JSON).
    """
    # run_chat_stream is an async generator — it yields SSE strings one at a time.
    # StreamingResponse wraps it and sends each yielded string over the connection.
    #
    # Headers explained:
    #   X-Accel-Buffering: no  — tells nginx/reverse proxy NOT to buffer the response.
    #                            Without this, nginx buffers everything and the
    #                            client sees no output until the stream ends.
    #   Cache-Control: no-cache — tells the client (and any proxy) not to cache
    #                             this response. SSE responses should never be cached.
    return StreamingResponse(
        run_chat_stream(
            thread_id=   body.thread_id,
            business_id= body.business_id,
            form_id=     body.form_id,
            message=     body.message,
        ),
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control":     "no-cache",
            "Connection":        "keep-alive",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /chat/threads/{business_id} — list all threads for sidebar
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/threads/{business_id}",
    response_model=ThreadListResponse,
    summary="List All Chat Threads",
    description="""
Returns all chat threads for a business, sorted by most recently active first.

Used by the frontend to render the sidebar list of forms with chat history.
Each item shows: form title, message count, and a preview of the last message.

Note: Purvi can also query MongoDB chat_threads directly for this — no need
to call FastAPI for read-only list views if she prefers.
    """,
)
async def list_threads(business_id: str) -> ThreadListResponse:
    """
    List all chat threads for the given business, sorted newest first.

    Args:
        business_id: Business UUID from the URL path.

    Returns:
        ThreadListResponse with a list of ThreadSummary objects.
    """
    db = await get_db()

    cursor = db.chat_threads.find(
        {"business_id": business_id},
        # Projection: only fetch the fields we need for the summary
        # (avoids sending the entire messages array over the wire)
        {
            "thread_id":     1,
            "form_id":       1,
            "form_title":    1,
            "message_count": 1,
            "messages":      {"$slice": -1},  # Only last 1 message (for preview)
            "updated_at":    1,
        },
    ).sort("updated_at", -1)  # -1 = descending = newest first

    raw_threads = await cursor.to_list(length=100)  # Max 100 threads per business

    threads = []
    for doc in raw_threads:
        # Extract the last message content for the preview
        messages = doc.get("messages", [])
        last_message = messages[-1].get("content", "") if messages else None

        threads.append(ThreadSummary(
            thread_id=     doc["thread_id"],
            form_id=       doc["form_id"],
            form_title=    doc.get("form_title", ""),
            message_count= doc.get("message_count", 0),
            last_message=  last_message,
            updated_at=    doc.get("updated_at", ""),
        ))

    return ThreadListResponse(threads=threads)


# ─────────────────────────────────────────────────────────────────────────────
# GET /chat/thread/{business_id}/{form_id} — get full thread
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/thread/{business_id}/{form_id}",
    response_model=ThreadResponse,
    summary="Get Full Chat Thread",
    description="""
Returns the complete chat thread for a specific form, including all messages.

Called when the user selects a thread in the sidebar — loads the full chat history.
Returns 404 if no thread exists for this (business_id, form_id) combination.
    """,
)
async def get_thread(business_id: str, form_id: str) -> ThreadResponse:
    """
    Fetch the full chat thread document for the given (business_id, form_id).

    Args:
        business_id: Business UUID from URL path.
        form_id:     Form UUID from URL path.

    Returns:
        ThreadResponse with full message history.

    Raises:
        HTTPException 404: If no thread exists for this pair.
    """
    db = await get_db()

    doc = await db.chat_threads.find_one(
        {"business_id": business_id, "form_id": form_id}
    )

    if doc is None:
        raise HTTPException(
            status_code=404,
            detail=f"No chat thread found for form {form_id}.",
        )

    messages = _parse_messages(doc.get("messages", []))

    return ThreadResponse(
        thread_id=     doc["thread_id"],
        business_id=   doc["business_id"],
        form_id=       doc["form_id"],
        form_title=    doc.get("form_title", ""),
        is_new=        False,
        message_count= doc.get("message_count", 0),
        messages=      messages,
        created_at=    doc.get("created_at", ""),
        updated_at=    doc.get("updated_at", ""),
    )


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /chat/thread/{business_id}/{form_id} — clear thread history
# ─────────────────────────────────────────────────────────────────────────────


@router.delete(
    "/thread/{business_id}/{form_id}",
    response_model=ClearThreadResponse,
    summary="Clear Thread History",
    description="""
Clears all messages and the context summary from a thread.

Does NOT delete the thread document — the thread still exists with empty messages.
This preserves the thread_id for the frontend (no need to re-create the thread).

Use case: "Start fresh" button in the chat UI.
    """,
)
async def clear_thread(business_id: str, form_id: str) -> ClearThreadResponse:
    """
    Reset a thread's messages and context summary to empty.

    Args:
        business_id: Business UUID from URL path.
        form_id:     Form UUID from URL path.

    Returns:
        ClearThreadResponse with confirmation message and thread_id.

    Raises:
        HTTPException 404: If no thread exists for this pair.
    """
    db  = await get_db()
    now = datetime.now(timezone.utc).isoformat()

    result = await db.chat_threads.find_one_and_update(
        {"business_id": business_id, "form_id": form_id},
        {
            "$set": {
                "messages":        [],
                "context_summary": "",
                "message_count":   0,
                "updated_at":      now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No chat thread found for form {form_id}.",
        )

    return ClearThreadResponse(
        message=   "Thread history cleared successfully.",
        thread_id= result["thread_id"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Private helper
# ─────────────────────────────────────────────────────────────────────────────


def _parse_messages(raw: list[dict]) -> list:
    """
    Convert raw MongoDB message dicts to ChatMessage Pydantic models.

    Each message in MongoDB is stored as a plain dict. This function validates
    them against the ChatMessage schema and returns typed objects.

    Args:
        raw: List of raw message dicts from MongoDB.

    Returns:
        List of ChatMessage Pydantic model instances.
    """
    from app.schemas.query import ChatMessage, Source  # noqa: PLC0415

    result = []
    for msg in raw:
        sources = [Source(**s) for s in msg.get("sources", [])]
        result.append(ChatMessage(
            role=      msg.get("role", "user"),
            content=   msg.get("content", ""),
            timestamp= msg.get("timestamp", ""),
            sources=   sources,
        ))
    return result
