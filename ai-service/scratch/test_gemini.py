import asyncio
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.tools import tool
from app.config import settings
import json

@tool
def dummy_tool(query: str):
    """Dummy tool"""
    pass

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
            
    print("Chunk additional_kwargs:")
    print(json.dumps(final_chunk.additional_kwargs, indent=2))
    
    print("\nTrying to invoke with chunk...")
    messages = [HumanMessage(content="Call dummy_tool with 'hello'"), final_chunk]
    try:
        await llm.ainvoke(messages)
        print("Success without ToolMessage!")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
