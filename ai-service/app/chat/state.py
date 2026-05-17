"""
InsightLoop AI Service — Chat LangGraph State
==============================================
TypedDict defining the shape of the state object that flows through
the chat LangGraph graph.

Why a separate file?
    Every node file imports ChatState. If it lived in engine.py,
    node files would import from engine.py while engine.py imports
    from node files → circular import. Keeping state in its own file
    breaks the cycle.

    Import graph (no circles):
        state.py          → imports nothing from app/chat/
        nodes/*.py        → imports state.py
        graph.py          → imports nodes/*.py, state.py
        engine.py         → imports graph.py
"""

from typing import TypedDict


class ChatState(TypedDict):
    """
    Ephemeral state for one chat turn through the LangGraph graph.

    Created per-request, discarded after the stream ends.
    MongoDB is the durable store; this is just the pipeline scratch pad.

    Fields set BEFORE the graph starts (by engine.py):
        thread_id, business_id, form_id, user_message

    Fields set BY nodes during graph execution:
        thread_doc      — by load_thread_node
        schema_context  — by build_context_node
        lc_messages     — by build_context_node
        full_response   — by stream_node
        message_count   — by save_node
        error           — by any node on failure
    """

    # ── Input fields (set before graph starts) ────────────────────────────────
    thread_id:    str    # MongoDB thread document ID
    business_id:  str    # For tenant scoping + MongoDB query
    form_id:      str    # For schema context building
    user_message: str    # The sanitized user input

    # ── Set by load_thread_node ───────────────────────────────────────────────
    thread_doc:   dict   # Full MongoDB thread document

    # ── Set by build_context_node ─────────────────────────────────────────────
    schema_context: str          # Form schema string for system prompt
    lc_messages:    list         # LangChain message objects for LLM

    # ── Set by stream_node ────────────────────────────────────────────────────
    full_response: str   # Complete accumulated LLM response (for MongoDB)
    
    # ── Set by execute_tools_node ─────────────────────────────────────────────
    sources: list[dict]  # Citations from vector search

    # ── Set by save_node ──────────────────────────────────────────────────────
    message_count: int   # Updated total after this turn

    # ── Error propagation ─────────────────────────────────────────────────────
    # If any node sets error, downstream nodes skip their work.
    error: str | None
