import os
import httpx

COHERE_API_KEY = os.getenv("COHERE_API_KEY")
UPSTASH_URL = os.getenv("UPSTASH_VECTOR_REST_URL")
UPSTASH_TOKEN = os.getenv("UPSTASH_VECTOR_REST_TOKEN")

COHERE_EMBED_URL = "https://api.cohere.com/v2/embed"
EMBED_MODEL = "embed-multilingual-v3.0"
EMBED_DIM = 1024

# Max tokens Cohere supports per text is 512.
# ~350 words is safe for mixed VI/EN text (Vietnamese is token-denser).
CHUNK_WORD_LIMIT = 350


def _upstash_headers() -> dict:
    """Build headers lazily so env vars are always resolved at call time."""
    return {
        "Authorization": f"Bearer {os.getenv('UPSTASH_VECTOR_REST_TOKEN', '')}",
        "Content-Type": "application/json",
    }


def _cohere_headers() -> dict:
    return {
        "Authorization": f"Bearer {os.getenv('COHERE_API_KEY', '')}",
        "Content-Type": "application/json",
    }


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Call Cohere to embed a list of texts (search_document input type)."""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            COHERE_EMBED_URL,
            headers=_cohere_headers(),
            json={
                "model": EMBED_MODEL,
                "input_type": "search_document",
                "embedding_types": ["float"],
                "texts": texts,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"]["float"]


async def embed_query(query: str) -> list[float]:
    """Embed a single query string (search_query input type)."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            COHERE_EMBED_URL,
            headers=_cohere_headers(),
            json={
                "model": EMBED_MODEL,
                "input_type": "search_query",
                "embedding_types": ["float"],
                "texts": [query],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["embeddings"]["float"][0]


async def upsert_chunks(doc_id: str, chunks: list[str]) -> int:
    """Embed and upsert chunks into Upstash Vector via REST API."""
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
    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i : i + batch_size]
            resp = await client.post(
                f"{os.getenv('UPSTASH_VECTOR_REST_URL', '')}/upsert",
                headers=_upstash_headers(),
                json=batch,
            )
            resp.raise_for_status()

    return len(vectors)


async def delete_doc_vectors(doc_id: str, chunk_count: int):
    """
    Delete all vectors for a document by constructing IDs directly.

    Previously used a dummy-zero-vector query which is unreliable with
    cosine distance (zero vector has undefined direction). Since chunk IDs
    follow the pattern '{doc_id}_{i}', we build the list explicitly.
    """
    ids = [f"{doc_id}_{i}" for i in range(chunk_count)]

    # Upstash REST delete accepts a JSON array of IDs
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(
            f"{os.getenv('UPSTASH_VECTOR_REST_URL', '')}/delete",
            headers=_upstash_headers(),
            json=ids,
        )
        resp.raise_for_status()


async def search_similar(query: str, top_k: int = 5) -> list[str]:
    """Search for similar chunks given a query via Upstash REST API."""
    query_emb = await embed_query(query)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{os.getenv('UPSTASH_VECTOR_REST_URL', '')}/query",
            headers=_upstash_headers(),
            json={
                "vector": query_emb,
                "topK": top_k,
                "includeMetadata": True,
            },
        )
        resp.raise_for_status()
        results = resp.json().get("result", [])

    return [
        r["metadata"]["text"]
        for r in results
        if r.get("metadata") and "text" in r["metadata"]
    ]
