import asyncio
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
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
        streaming=True
    )
    llm_with_tools = llm.bind_tools([dummy_tool])
    
    final_chunk = None
    async for chunk in llm_with_tools.astream([HumanMessage(content="Call dummy_tool with 'hello'")]):
        if final_chunk is None:
            final_chunk = chunk
        else:
            final_chunk += chunk
            
    # Convert to pure AIMessage without additional_kwargs
    final_message = AIMessage(
        content=final_chunk.content,
        tool_calls=final_chunk.tool_calls
    )
    
    print("\nTrying to invoke with stripped AIMessage...")
    tool_msg = ToolMessage(content="Dummy data", tool_call_id=final_chunk.tool_calls[0]["id"], name=final_chunk.tool_calls[0]["name"])
    messages = [HumanMessage(content="Call dummy_tool with 'hello'"), final_message, tool_msg]
    try:
        await llm.ainvoke(messages)
        print("Success!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
