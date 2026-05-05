"""
InsightLoop AI Service — Chat Node 2: Build Context
=====================================================
Builds the LangChain message list for the LLM call.

Steps:
    1. Fetch form schema string (MySQL or MongoDB fallback, cached 5 min)
    2. Build LangChain message list: [SystemMessage] + [history window]
    3. Append the current user message as the final HumanMessage

async: YES — calls await get_form_schema() which may hit MySQL/MongoDB
"""

from langchain_core.messages import BaseMessage, HumanMessage

from app.chat.schema_context import get_form_schema
from app.chat.state import ChatState
from app.chat.utils.context_manager import build_context_messages


async def build_context_node(state: ChatState) -> dict:
    """
    Build the LangChain message list for the LLM call.

    Skips if a previous node set an error.

    The appended user message must be LAST in the list — this is how the LLM
    knows which message it's currently responding to.
    """
    if state.get("error"):
        return {}

    # Step 1: Get form schema context
    schema_str = await get_form_schema(
        form_id=state["form_id"],
        business_id=state["business_id"],
    )

    # Step 2: Build history messages from thread document
    base_messages: list[BaseMessage] = build_context_messages(
        thread_doc=state["thread_doc"],
        schema_str=schema_str,
    )

    # Step 3: Append current user message as the final turn
    base_messages.append(HumanMessage(content=state["user_message"]))

    return {
        "schema_context": schema_str,
        "lc_messages":    base_messages,
    }
