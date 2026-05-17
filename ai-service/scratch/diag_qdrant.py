"""
Quick diagnostic: check what's actually in Qdrant
and test a search without score filtering.
"""
import asyncio
from app.config import settings

def test():
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue

    client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
    
    # 1. Collection info
    info = client.get_collection(settings.QDRANT_COLLECTION_NAME)
    print(f"Collection: {settings.QDRANT_COLLECTION_NAME}")
    print(f"Total vectors: {info.points_count}")
    print(f"Indexed vectors: {info.indexed_vectors_count}")
    print()

    # 2. Scroll a few points to see what metadata looks like
    points, _ = client.scroll(
        collection_name=settings.QDRANT_COLLECTION_NAME,
        limit=3,
        with_payload=True,
        with_vectors=False
    )
    
    print("=== Sample points in Qdrant ===")
    for p in points:
        payload = p.payload
        print(f"  business_id: {payload.get('metadata', {}).get('business_id', 'NOT IN metadata') or payload.get('business_id', 'NOT FOUND')}")
        print(f"  form_id:     {payload.get('metadata', {}).get('form_id', 'NOT IN metadata') or payload.get('form_id', 'NOT FOUND')}")
        print(f"  response_id: {payload.get('metadata', {}).get('response_id', '?') or payload.get('response_id', '?')}")
        print(f"  Full payload keys: {list(payload.keys())}")
        print()

    # 3. Raw search without any filter to see scores
    from app.vector.store import get_vector_store, get_embedder
    store = get_vector_store()
    
    print("=== Search test: 'bad customer service staff' (NO filter, NO score cutoff) ===")
    results = store.similarity_search_with_relevance_scores(
        "bad customer service staff behavior assault",
        k=5,
    )
    for doc, score in results:
        print(f"  Score: {score:.4f} | business: {doc.metadata.get('business_id','?')[:8]}... | content: {doc.page_content[:80]}")

if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, ".")
    test()
