"""
InsightLoop AI Service — Chat Context Manager
==============================================
Manages what chat history gets sent to the LLM and when to trigger
conversation summarization.

The core problem: infinite chat, finite context window
  Every LLM has a maximum "context window" — the total amount of text
  (measured in tokens) it can consider at once. Gemini's context window is
  large, but it's still finite. More importantly, longer prompts are:
    - Slower (more tokens = more processing time)
    - More expensive (billed by token)
    - Noisy (old irrelevant history dilutes the signal of recent messages)

  We can't send all 200 historical messages to the LLM. We also can't
  just cut old messages off — the LLM would lose important context from
  earlier in the conversation.

The solution: sliding window + lazy summarization
  1. Always send the last CONTEXT_WINDOW_SIZE messages in full (the "window")
  2. When total messages exceed SUMMARY_THRESHOLD, summarize the oldest N
     messages into a short paragraph and store it in the thread document.
     The summary is prepended to the LLM context — providing older context
     without the full token cost of every original message.
  3. Summarization is LAZY — only happens when the threshold is crossed,
     not on every turn. Most conversations never even reach the threshold.

MongoDB thread document structure (relevant fields):
  {
    messages:        [...],         ← current sliding window (raw messages)
    context_summary: "...",         ← compressed summary of older messages
    message_count:   42,            ← total ever sent (inc. summarized ones)
  }
"""

from datetime import datetime, timezone

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings


# ── System prompt template ────────────────────────────────────────────────────
# {schema_context} is filled by schema_context.py
# {summary_block}  is filled by build_context_messages() — empty if no summary yet

SYSTEM_PROMPT_TEMPLATE = """You are an AI analytics assistant for InsightLoop.
You help business owners understand their customer feedback data.

FORM CONTEXT:
{schema_context}
{summary_block}
RULES:
- Answer only about this specific form's feedback data.
- If you don't have enough data to answer accurately, say so clearly.
- Do not make up numbers, trends, or customer quotes.
- Be specific, concise, and actionable.
- Do not answer questions unrelated to this business's feedback data.
- If asked something outside your scope (personal questions, unrelated business advice,
  competitor analysis), politely redirect to feedback analysis."""


# ── Public functions ──────────────────────────────────────────────────────────


def build_context_messages(thread_doc: dict, schema_str: str) -> list[BaseMessage]:
    """
    Build the LangChain message list to send to the LLM for one chat turn.

    This function assembles the complete conversation context the LLM will
    see, in the correct order:
      [SystemMessage]         ← role + form schema + rules (always present)
      [HumanMessage summary]  ← compressed older history (only if it exists)
      [HumanMessage, ...]     ← raw recent messages from the sliding window
      [AIMessage, ...]

    Note: The current user message is NOT included here. The caller (engine.py)
    appends it as the last message before calling the LLM.

    Args:
        thread_doc: The MongoDB chat_threads document dict.
        schema_str: Form schema string from schema_context.get_form_schema().

    Returns:
        list[BaseMessage]: LangChain message objects ready to pass to llm.astream().
                           Types: SystemMessage, HumanMessage, AIMessage.

    How LangChain messages work:
        LangChain uses typed message objects instead of plain dicts.
        The LLM wrapper converts these to the correct API format automatically.
        We use:
          SystemMessage  — the "meta-instruction" to the LLM (role + rules)
          HumanMessage   — messages from the user
          AIMessage      — messages from the assistant
    """
    messages: list[BaseMessage] = []

    # ── 1. System prompt ──────────────────────────────────────────────────────
    # The context_summary block is only included if a summary exists.
    # An empty summary block means the LLM sees no summary section at all.
    context_summary = thread_doc.get("context_summary", "")
    if context_summary:
        summary_block = (
            f"\nCONVERSATION HISTORY SUMMARY (earlier messages, compressed):\n"
            f"{context_summary}\n"
        )
    else:
        summary_block = ""

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        schema_context=schema_str,
        summary_block=summary_block,
    )
    messages.append(SystemMessage(content=system_prompt))

    # ── 2. Recent raw messages (sliding window) ───────────────────────────────
    # Take only the last CONTEXT_WINDOW_SIZE messages from the array.
    # MongoDB stores them in chronological order — we slice from the end.
    raw_messages = thread_doc.get("messages", [])
    window = raw_messages[-settings.CONTEXT_WINDOW_SIZE:]

    for msg in window:
        role    = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    return messages


def should_summarize(thread_doc: dict) -> bool:
    """
    Check whether the thread has grown long enough to need summarization.

    Summarization is triggered when total message_count exceeds SUMMARY_THRESHOLD.
    Note: message_count is the total ever sent, not just what's in the array.

    Args:
        thread_doc: The MongoDB chat_threads document.

    Returns:
        bool: True if summarization should run after this turn.
    """
    count = thread_doc.get("message_count", 0)
    return count > settings.SUMMARY_THRESHOLD


async def run_summarization(
    thread_doc: dict,
    llm,  # ChatGoogleGenerativeAI instance — typed as Any to avoid circular import
) -> tuple[str, list[dict]]:
    """
    Summarize the oldest messages and return the updated state.

    This function:
      1. Takes the oldest messages from the thread (those to be trimmed)
      2. Makes one LLM call to compress them into a short summary paragraph
      3. Appends (not overwrites!) the new summary to any existing summary
      4. Returns the updated summary and the trimmed messages list

    The caller (save_node in engine.py) writes these to MongoDB.

    Why append instead of replace?
      If we always replaced the summary, we'd lose context from very old
      messages (those that were summarized in a previous summarization pass).
      Appending accumulates all summaries, preserving long-term context
      while keeping total token cost under control.

    How many messages to trim?
      We trim half of the CONTEXT_WINDOW_SIZE (10 by default). These are
      the oldest messages currently in the window — they've been in the
      "raw" section long enough. The newest messages stay raw for now.

    Args:
        thread_doc: The MongoDB chat_threads document.
        llm:        The initialized ChatGoogleGenerativeAI LLM instance.

    Returns:
        tuple[str, list[dict]]:
          - updated_summary: New context_summary string to save to MongoDB.
          - remaining_messages: Trimmed messages list to replace thread_doc["messages"].
    """
    messages = thread_doc.get("messages", [])

    # We summarize the OLDEST messages for LLM context compression, but we
    # NEVER physically trim the messages array from MongoDB. The messages array
    # is the source of truth for frontend chat history display (GET /chat/thread).
    # The LLM context window is already handled in build_context_messages() via
    # raw_messages[-CONTEXT_WINDOW_SIZE:] — no trimming needed here.
    #
    # For summarization: only process the oldest CONTEXT_WINDOW_SIZE//2 messages
    # to build the summary text. Return the full original messages list unchanged.
    trim_count = max(settings.CONTEXT_WINDOW_SIZE // 2, 5)
    
    # Guard: only summarize if we have enough messages to make it worthwhile
    if len(messages) <= trim_count:
        return thread_doc.get("context_summary", ""), messages
    
    messages_to_summarize = messages[:trim_count]
    # remaining_messages is the FULL list — we return it untouched
    remaining_messages = messages

    if not messages_to_summarize:
        # Nothing to summarize — return unchanged
        return thread_doc.get("context_summary", ""), messages

    # ── Build the summarization prompt ────────────────────────────────────────
    # Convert the messages to be summarized into a readable transcript format
    transcript_lines = []
    for msg in messages_to_summarize:
        role    = "User" if msg.get("role") == "user" else "Assistant"
        content = msg.get("content", "")
        transcript_lines.append(f"{role}: {content}")
    transcript = "\n".join(transcript_lines)

    summarization_prompt = [
        SystemMessage(content=(
            "You are a conversation summarizer. Summarize the following chat "
            "transcript in 3–5 concise sentences. Preserve key facts, numbers, "
            "and topics discussed. Write in past tense as a factual record."
        )),
        HumanMessage(content=f"Conversation transcript:\n\n{transcript}"),
    ]

    # ── LLM call with retry ───────────────────────────────────────────────────
    # We retry up to 3 times with exponential backoff in case of transient errors.
    # This is a non-streaming call — we need the full response at once.
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def _invoke():
        return await llm.ainvoke(summarization_prompt)

    response = await _invoke()
    new_summary_text = response.content.strip()

    # ── Append to existing summary ────────────────────────────────────────────
    existing_summary = thread_doc.get("context_summary", "")
    if existing_summary:
        updated_summary = f"{existing_summary}\n\n{new_summary_text}"
    else:
        updated_summary = new_summary_text

    return updated_summary, remaining_messages
