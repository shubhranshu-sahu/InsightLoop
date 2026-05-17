import asyncio
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from app.config import settings

async def test():
    llm = ChatGoogleGenerativeAI(
        model=settings.GEMINI_LLM_MODEL,
        google_api_key=settings.GEMINI_API_KEY,
    )
    
    # We bypass tools entirely for Phase 3!
    fake_history = [
        HumanMessage(content="What are the complaints?"),
        HumanMessage(content="System implicitly searched the database and found:\nThe food was cold.")
    ]
    
    try:
        resp = await llm.ainvoke(fake_history)
        print("Success! Response:")
        print(resp.content)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(test())
