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
        streaming=True
    )
    llm_with_tools = llm.bind_tools([dummy_tool])
    
    print("Phase 1: Streaming with tools...")
    final_chunk = None
    async for chunk in llm_with_tools.astream([HumanMessage(content="Call dummy_tool with 'hello'")]):
        if final_chunk is None:
            final_chunk = chunk
        else:
            final_chunk += chunk
            
    print("Phase 2: Executing tools...")
    tool_msg = ToolMessage(content="The database found: Dummy data!", tool_call_id=final_chunk.tool_calls[0]["id"], name=final_chunk.tool_calls[0]["name"])
    
    lc_messages = [HumanMessage(content="Call dummy_tool with 'hello'"), final_chunk, tool_msg]
    
    print("Phase 3: Sanitizing and Streaming Final Answer...")
    
    sanitized_history = []
    i = 0
    while i < len(lc_messages):
        msg = lc_messages[i]
        if hasattr(msg, "tool_calls") and msg.tool_calls:
            if i + 1 < len(lc_messages) and isinstance(lc_messages[i+1], ToolMessage):
                t_msg = lc_messages[i+1]
                sanitized_history.append(
                    HumanMessage(content=f"[System: Executed database search. Results:]\n{t_msg.content}")
                )
                i += 2
                continue
        sanitized_history.append(msg)
        i += 1
        
    final_resp_chunk = None
    try:
        # Notice we use plain LLM
        async for chunk in llm.astream(sanitized_history):
            if final_resp_chunk is None:
                final_resp_chunk = chunk
            else:
                final_resp_chunk += chunk
        print("Success! Response:")
        print(final_resp_chunk.content)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
