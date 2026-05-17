import asyncio
from qdrant_client import QdrantClient
from qdrant_client.http.models import PayloadSchemaType, VectorParams, Distance
from app.config import settings

def test():
    client = QdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY,
    )
    
    if not client.collection_exists(settings.QDRANT_COLLECTION_NAME):
        client.create_collection(
            collection_name=settings.QDRANT_COLLECTION_NAME,
            vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )
        
    client.create_payload_index(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        field_name="business_id",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        field_name="form_id",
        field_schema=PayloadSchemaType.KEYWORD,
    )
    print("Success")

if __name__ == "__main__":
    test()
