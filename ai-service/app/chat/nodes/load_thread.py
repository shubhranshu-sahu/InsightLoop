"""
InsightLoop AI Service — Chat Node 1: Load Thread
===================================================
Loads the chat thread document from MongoDB by thread_id.

Why load inside the graph?
    The thread document contains the message history and context summary
    needed by build_context_node. Loading it here keeps the graph self-contained
    and makes testing easier (we can pass a mock thread_doc in tests).

async: YES — calls await get_db() and await db.chat_threads.find_one()
"""

from app.chat.state import ChatState
from app.db.mongo import get_db


async def load_thread_node(state: ChatState) -> dict:
    """
    Load the chat thread document from MongoDB.

    On success: returns {"thread_doc": {...}} to update state.
    On failure: returns {"error": "Thread not found"} — downstream nodes check
                this and skip gracefully.
    """
    db = await get_db()
    thread_doc = await db.chat_threads.find_one({"thread_id": state["thread_id"]})

    if thread_doc is None:
        return {"error": f"Thread not found: {state['thread_id']}", "thread_doc": {}}

    # Remove MongoDB's _id field — it's not JSON-serializable and we don't need it
    thread_doc.pop("_id", None)
    return {"thread_doc": thread_doc}
