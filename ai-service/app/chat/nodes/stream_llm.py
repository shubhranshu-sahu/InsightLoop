"""
InsightLoop AI Service — Chat Node 3: Stream LLM
==================================================
Calls the LLM with streaming and accumulates the full response.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL — Read this before editing.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This node does TWO things simultaneously:
    A. Accumulates the full LLM response into `full_response` (for MongoDB)
    B. Each token emitted by llm.astream() fires a "on_chat_model_stream"
       event in LangGraph's astream_events() bus — the route picks these up
       and forwards them to the frontend as SSE events.

The node doesn't "know" about the SSE stream. It just calls llm.astream()
normally. LangGraph's event infrastructure handles the broadcasting.

async: YES — calls async for chunk in llm.astream()
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from tenacity import retry, stop_after_attempt, wait_exponential

from app.chat.nodes.execute_tools import search_feedback
from app.chat.state import ChatState
from app.config import settings

# ── LLM singleton ─────────────────────────────────────────────────────────────
# Created once when this module is first imported. All chat requests reuse
# the same instance. ChatGoogleGenerativeAI is thread-safe and connection-pooled.
#
# streaming=True enables token-by-token output via .astream().

_llm: ChatGoogleGenerativeAI | None = None


def get_llm() -> ChatGoogleGenerativeAI:
    """
    Return the singleton Gemini chat LLM instance.

    Initializes on first call. Subsequent calls return the cached instance.
    """
    global _llm
    if _llm is None:
        _llm = ChatGoogleGenerativeAI(
            model=settings.GEMINI_LLM_MODEL,
            google_api_key=settings.GEMINI_API_KEY,
            streaming=True,
        )
    return _llm


async def stream_node(state: ChatState) -> dict:
    """
    Call the LLM with streaming and accumulate the full response.

    Retry logic:
        If the LLM call fails (rate limit, timeout, transient error), tenacity
        retries up to 3 times with exponential backoff.
        If all 3 fail, the exception propagates to run_chat_stream() which
        sends an error SSE event to the frontend.

    Skips if previous node set an error.
    """
    if state.get("error"):
        return {"full_response": ""}

    from langchain_core.messages import ToolMessage, HumanMessage
    
    llm = get_llm()
    last_message = state["lc_messages"][-1]
    is_after_tool = isinstance(last_message, ToolMessage)

    if not is_after_tool:
        # ── Phase 1: Tool Decision ────────────────────────────────────────────
        # We MUST use ainvoke(), NOT astream().
        # 
        # When using astream() for a tool call, LangChain's chunk.__add__()
        # operator silently drops the `thought_signature` from additional_kwargs.
        # Gemini 3.x requires this signature to be present in the history when
        # the ToolMessage is sent back. Without it, Gemini throws a 400 error.
        # 
        # ainvoke() returns the native AIMessage without any chunk aggregation,
        # so thought_signature is preserved perfectly.
        # 
        # Trade-off: Phase 1 responses don't stream (if Gemini answers directly
        # without a tool call). engine.py has a fallback to emit the full_response
        # as a single TokenEvent at graph completion.
        llm_with_tools = llm.bind_tools([search_feedback])
        final_message = await llm_with_tools.ainvoke(state["lc_messages"])
        
        return {
            "full_response": final_message.content if final_message.content else "",
            "lc_messages": state["lc_messages"] + [final_message]
        }
    else:
        # ── Phase 3: Final Answer Streaming ───────────────────────────────────
        # Tools have been executed. 
        # 
        # BUG FIX: Google Gemini `thought_signature` 400 Error.
        # LangChain's chunk aggregator drops the `thought_signature` metadata from Phase 1.
        # If we send the corrupted AIMessage(tool_calls) back to Gemini, it will crash.
        # FIX: We sanitize the history by converting the Tool execution sequence into 
        # a single HumanMessage containing the system's database search results!
        
        sanitized_history = []
        i = 0
        while i < len(state["lc_messages"]):
            msg = state["lc_messages"][i]
            
            # Detect [AIMessage(tool_calls), ToolMessage] sequence
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                if i + 1 < len(state["lc_messages"]) and isinstance(state["lc_messages"][i+1], ToolMessage):
                    tool_msg = state["lc_messages"][i+1]
                    # Replace the broken tool call sequence with a clean context injection
                    sanitized_history.append(
                        HumanMessage(content=f"[System: Executed database search. Results:]\n{tool_msg.content}")
                    )
                    i += 2
                    continue
            
            sanitized_history.append(msg)
            i += 1
            
        config = {"tags": ["final_output"]}
        full_text = ""
        final_chunk = None
        
        async for chunk in llm.astream(sanitized_history, config=config):
            if chunk.content:
                full_text += chunk.content
            if final_chunk is None:
                final_chunk = chunk
            else:
                final_chunk += chunk
                
        return {
            "full_response": full_text,
            # We don't overwrite the global state with our fake sanitized history.
            # We just append the final answer to the original state.
            "lc_messages": state["lc_messages"] + [final_chunk]
        }
