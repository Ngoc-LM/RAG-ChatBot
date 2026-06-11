import os
import httpx
from upstash_vector import Index

JINA_API_KEY = os.getenv("JINA_API_KEY")
UPSTASH_URL = os.getenv("UPSTASH_VECTOR_REST_URL")
UPSTASH_TOKEN = os.getenv("UPSTASH_VECTOR_REST_TOKEN")

JINA_EMBED_URL = "https://api.jina.ai/v1/embeddings"
EMBED_MODEL = "jina-embeddings-v3"
EMBED_DIM = 1024


def get_index() -> Index:
    return Index(url=UPSTASH_URL, token=UPSTASH_TOKEN)


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Call Jina AI to embed a list of texts."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            JINA_EMBED_URL,
            headers={
                "Authorization": f"Bearer {JINA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": EMBED_MODEL,
                "task": "retrieval.passage",
                "dimensions": EMBED_DIM,
                "input": texts,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return [item["embedding"] for item in data["data"]]


async def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            JINA_EMBED_URL,
            headers={
                "Authorization": f"Bearer {JINA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": EMBED_MODEL,
                "task": "retrieval.query",
                "dimensions": EMBED_DIM,
                "input": [query],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["data"][0]["embedding"]


async def upsert_chunks(doc_id: str, chunks: list[str]) -> int:
    """Embed and upsert chunks into Upstash Vector."""
    index = get_index()
    embeddings = await embed_texts(chunks)

    vectors = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        vectors.append({
            "id": f"{doc_id}_{i}",
            "vector": emb,
            "metadata": {
                "doc_id": doc_id,
                "chunk_index": i,
                "text": chunk,
            },
        })

    # Upsert in batches of 100
    batch_size = 100
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch)

    return len(vectors)


async def delete_doc_vectors(doc_id: str):
    """Delete all vectors associated with a document."""
    index = get_index()
    # Query to find all chunk IDs for this doc
    results = index.query(
        vector=[0.0] * EMBED_DIM,
        top_k=1000,
        filter=f'doc_id = "{doc_id}"',
        include_metadata=True,
    )
    ids = [r.id for r in results]
    if ids:
        index.delete(ids=ids)


async def search_similar(query: str, top_k: int = 5) -> list[str]:
    """Search for similar chunks given a query."""
    index = get_index()
    query_emb = await embed_query(query)
    results = index.query(
        vector=query_emb,
        top_k=top_k,
        include_metadata=True,
    )
    return [r.metadata["text"] for r in results if r.metadata and "text" in r.metadata]
