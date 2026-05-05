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

    llm = get_llm()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def _stream_with_retry() -> str:
        """
        Inner function with retry decorator applied.
        Calls llm.astream() and accumulates all token chunks into a string.
        """
        full = ""
        async for chunk in llm.astream(state["lc_messages"]):
            if chunk.content:
                full += chunk.content
        return full

    full_response = await _stream_with_retry()
    return {"full_response": full_response}
