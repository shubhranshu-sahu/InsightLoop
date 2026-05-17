"""
InsightLoop AI Service — Chat Node 4: Save
============================================
Persists the assistant's response to MongoDB and triggers lazy summarization.

This node always runs — even if there was an error — but only saves
if full_response is non-empty (i.e., stream_node actually produced output).

On MongoDB failure: logs the error but does NOT raise. The response has
already been streamed to the user — we can't un-stream it.

async: YES — all MongoDB operations
"""

from datetime import datetime, timezone

from app.chat.nodes.stream_llm import get_llm
from app.chat.state import ChatState
from app.chat.utils.context_manager import run_summarization, should_summarize
from app.db.mongo import get_db


async def save_node(state: ChatState) -> dict:
    """
    Persist the assistant's response to MongoDB and trigger summarization.

    Two MongoDB operations:
        1. $push the assistant message to the messages array
        2. If should_summarize() → run_summarization() → $set context_summary
    """
    if not state.get("full_response"):
        # No response to save (error case or guardrail)
        return {"message_count": state["thread_doc"].get("message_count", 0)}

    now = datetime.now(timezone.utc).isoformat()
    db  = await get_db()

    try:
        # ── Save assistant message ─────────────────────────────────────────────
        assistant_msg = {
            "role":      "assistant",
            "content":   state["full_response"],
            "timestamp": now,
            "sources":   state.get("sources", []),  # RAG citations from vector search
        }

        result = await db.chat_threads.find_one_and_update(
            {"thread_id": state["thread_id"]},
            {
                "$push": {"messages": assistant_msg},
                "$inc":  {"message_count": 1},
                "$set":  {"updated_at": now},
            },
            return_document=True,  # Return the UPDATED document
        )

        updated_thread = dict(result) if result else {}
        updated_thread.pop("_id", None)
        new_message_count = updated_thread.get("message_count", 0)

        # ── Lazy summarization ─────────────────────────────────────────────────
        # Check using the UPDATED thread_doc (with the new message_count)
        if should_summarize(updated_thread):
            try:
                new_summary, trimmed_messages = await run_summarization(
                    thread_doc=updated_thread,
                    llm=get_llm(),
                )
                # Save summarization result to MongoDB
                await db.chat_threads.update_one(
                    {"thread_id": state["thread_id"]},
                    {
                        "$set": {
                            "context_summary": new_summary,
                            "messages":        trimmed_messages,
                            "updated_at":      datetime.now(timezone.utc).isoformat(),
                        }
                    },
                )
            except Exception as summ_err:
                # Summarization failure is non-fatal — log and continue.
                print(
                    f"[save_node] Summarization failed for thread "
                    f"{state['thread_id']}: {summ_err}"
                )

        return {"message_count": new_message_count}

    except Exception as e:
        # MongoDB save failed after streaming. Log clearly.
        print(
            f"[save_node] CRITICAL: Failed to save assistant message for "
            f"thread {state['thread_id']}: {e}"
        )
        return {"message_count": state["thread_doc"].get("message_count", 0)}
