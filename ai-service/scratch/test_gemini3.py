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
    
    print("Invoking...")
    final_message = await llm_with_tools.ainvoke([HumanMessage(content="Call dummy_tool with 'hello'")])
            
    print("additional_kwargs:")
    print(json.dumps(final_message.additional_kwargs, indent=2))
    
    print("\nTrying to invoke again with ToolMessage...")
    tool_msg = ToolMessage(content="Dummy data", tool_call_id=final_message.tool_calls[0]["id"], name=final_message.tool_calls[0]["name"])
    messages = [HumanMessage(content="Call dummy_tool with 'hello'"), final_message, tool_msg]
    try:
        await llm.ainvoke(messages)
        print("Success with ainvoke!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
