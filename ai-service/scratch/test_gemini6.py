import asyncio
from langchain_core.messages import HumanMessage, ToolMessage, SystemMessage
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
    
    print("\nExecuting Tool...")
    tool_msg = ToolMessage(content="The database found: Dummy data!", tool_call_id=final_message.tool_calls[0]["id"], name=final_message.tool_calls[0]["name"])
    
    print("\nReplacing tool history with SystemMessage...")
    # Instead of sending final_message and tool_msg, we summarize it:
    fake_history = [
        HumanMessage(content="Call dummy_tool with 'hello'"),
        SystemMessage(content=f"System implicitly ran dummy_tool and got this result:\n{tool_msg.content}")
    ]
    
    try:
        resp = await llm.ainvoke(fake_history)
        print("Success! Response:")
        print(resp.content)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
