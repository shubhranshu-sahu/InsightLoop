"""
InsightLoop AI Service — Chat Engine (Entry Point)
====================================================
The single entry point for the chat system. Called by routes/query.py.

This file used to contain everything (nodes, graph, streaming). After the
modular restructure, it only contains run_chat_stream() — the async generator
that orchestrates: sanitize → guardrails → save user msg → run graph → stream.

All heavy logic is now in:
    app/chat/nodes/       — LangGraph node functions
    app/chat/graph.py     — compiled LangGraph graph
    app/chat/utils/       — context_manager, guardrails

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STREAMING + LANGGRAPH — HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The flow in one picture:
  LLM produces token
    → stream_node receives it via llm.astream()
      → LangGraph emits "on_chat_model_stream" event via astream_events()
        → run_chat_stream() picks up the event, formats it as SSE
          → StreamingResponse sends it over HTTP to Node
            → Node pipes it to the frontend
              → Frontend appends it to the chat bubble

Guardrails are checked OUTSIDE the graph (here, before the graph starts).
The user message is also saved to MongoDB OUTSIDE the graph, before it runs.
"""

import json
from datetime import datetime, timezone
from typing import AsyncGenerator

from app.chat.graph import chat_graph
from app.chat.state import ChatState
from app.chat.utils.guardrails import check_guardrails, sanitize_message
from app.db.mongo import get_db
from app.schemas.query import DoneEvent, ErrorEvent, TokenEvent


async def run_chat_stream(
    thread_id:   str,
    business_id: str,
    form_id:     str,
    message:     str,
) -> AsyncGenerator[str, None]:
    """
    Main entry point for the chat engine. Called by POST /chat/message.

    This is an ASYNC GENERATOR — it yields SSE event strings one at a time.
    The route wraps it in StreamingResponse.

    Args:
        thread_id:   UUID of the existing chat thread.
        business_id: Business UUID.
        form_id:     Form UUID.
        message:     Raw user message text (before sanitization).

    Yields:
        str: SSE-formatted event strings.
    """
    # ── Step 1: Sanitize the message ──────────────────────────────────────────
    clean_message = sanitize_message(message)

    # ── Step 2: Check guardrails ──────────────────────────────────────────────
    # If a guardrail fires, stream the canned response and return early.
    canned_reply = check_guardrails(clean_message)
    if canned_reply:
        db = await get_db()
        now = datetime.now(timezone.utc).isoformat()

        # Stream canned reply word-by-word to match LLM streaming behavior
        for word in canned_reply.split():
            yield f"data: {TokenEvent(token=word + ' ').model_dump_json()}\n\n"

        # Save canned reply as assistant message to MongoDB
        try:
            result = await db.chat_threads.find_one_and_update(
                {"thread_id": thread_id},
                {
                    "$push": {"messages": {
                        "role":      "assistant",
                        "content":   canned_reply,
                        "timestamp": now,
                        "sources":   [],
                    }},
                    "$inc":  {"message_count": 1},
                    "$set":  {"updated_at": now},
                },
                return_document=True,
            )
            new_count = result.get("message_count", 0) if result else 0
        except Exception:
            new_count = 0

        yield f"data: {DoneEvent(sources=[], message_count=new_count).model_dump_json()}\n\n"
        return

    # ── Step 3: Save user message to MongoDB ─────────────────────────────────
    # Saved BEFORE running the graph — if the LLM fails, user message is safe.
    db  = await get_db()
    now = datetime.now(timezone.utc).isoformat()

    try:
        await db.chat_threads.update_one(
            {"thread_id": thread_id},
            {
                "$push": {"messages": {
                    "role":      "user",
                    "content":   clean_message,
                    "timestamp": now,
                    "sources":   [],
                }},
                "$inc":  {"message_count": 1},
                "$set":  {"updated_at": now},
            },
        )
    except Exception as e:
        yield f"data: {ErrorEvent(message='Failed to save your message. Please try again.').model_dump_json()}\n\n"
        return

    # ── Step 4: Build initial LangGraph state ─────────────────────────────────
    initial_state: ChatState = {
        "thread_id":    thread_id,
        "business_id":  business_id,
        "form_id":      form_id,
        "user_message": clean_message,
        "thread_doc":   {},
        "schema_context": "",
        "lc_messages":  [],
        "full_response": "",
        "message_count": 0,
        "error":        None,
    }

    # ── Step 5: Run the graph and intercept streaming events ──────────────────
    streaming_started = False
    final_message_count = 0

    try:
        async for event in chat_graph.astream_events(initial_state, version="v2"):

            event_type = event["event"]

            # ── Token chunk from LLM ──────────────────────────────────────────
            if event_type == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    streaming_started = True
                    yield f"data: {TokenEvent(token=chunk.content).model_dump_json()}\n\n"

            # ── Graph completed — get final state ────────────────────────────
            elif event_type == "on_chain_end" and event.get("name") == "LangGraph":
                output = event["data"].get("output", {})
                final_message_count = output.get("message_count", 0)

                # Check if any node set an error
                if output.get("error"):
                    err_msg = (
                        "Response generation interrupted. The partial response may be incomplete."
                        if streaming_started
                        else "Failed to process your message. Please try again."
                    )
                    yield f"data: {ErrorEvent(message=err_msg).model_dump_json()}\n\n"
                    return

    except Exception as exc:
        print(f"[engine] Unhandled error in chat stream for thread {thread_id}: {exc}")
        err_msg = (
            "Response generation interrupted. The partial response above may be incomplete."
            if streaming_started
            else "AI service temporarily unavailable. Please try again."
        )
        yield f"data: {ErrorEvent(message=err_msg).model_dump_json()}\n\n"
        return

    # ── Step 6: Send done event ───────────────────────────────────────────────
    yield f"data: {DoneEvent(sources=[], message_count=final_message_count).model_dump_json()}\n\n"
