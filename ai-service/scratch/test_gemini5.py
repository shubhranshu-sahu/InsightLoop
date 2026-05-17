import asyncio
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from app.config import settings
import json

@tool
def dummy_tool(query: str):
    """Dummy tool"""
    return "Dummy data"

async def test():
    llm = ChatGoogleGenerativeAI(
        model=settings.GEMINI_LLM_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
    )
    llm_with_tools = llm.bind_tools([dummy_tool])
    
    print("Invoking Phase 1...")
    final_message = await llm_with_tools.ainvoke([HumanMessage(content="Call dummy_tool with 'hello'")])
    
    print("\nInvoking Phase 3 (Plain LLM)...")
    tool_msg = ToolMessage(content="Dummy data", tool_call_id=final_message.tool_calls[0]["id"], name=final_message.tool_calls[0]["name"])
    messages = [HumanMessage(content="Call dummy_tool with 'hello'"), final_message, tool_msg]
    
    try:
        # Notice we are using plain 'llm', NOT 'llm_with_tools'
        resp = await llm.ainvoke(messages)
        print("Success! Response:")
        print(resp.content)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
