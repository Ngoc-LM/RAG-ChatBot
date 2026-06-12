import os
import httpx

COHERE_EMBED_URL = "https://api.cohere.com/v2/embed"
EMBED_MODEL = "embed-multilingual-v3.0"
EMBED_DIM = 1024

CHUNK_TOKEN_SIZE = 400
CHUNK_TOKEN_OVERLAP = 40


def _upstash_url() -> str:
    return os.getenv("UPSTASH_VECTOR_REST_URL", "")


def _upstash_headers() -> dict:
    return {
        "Authorization": f"Bearer {os.getenv('UPSTASH_VECTOR_REST_TOKEN', '')}",
        "Content-Type": "application/json",
    }


def _cohere_headers() -> dict:
    return {
        "Authorization": f"Bearer {os.getenv('COHERE_API_KEY', '')}",
        "Content-Type": "application/json",
    }


def _vector_id(session_id: str, doc_id: str, index: int) -> str:
    """Unique vector ID scoped to session and document."""
    return f"{session_id}__{doc_id}__{index}"


async def embed_texts(texts: list[str]) -> list[list[float]]:
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
        return resp.json()["embeddings"]["float"]


async def embed_query(query: str) -> list[float]:
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
        return resp.json()["embeddings"]["float"][0]


async def upsert_chunks(session_id: str, doc_id: str, chunks: list[str]) -> int:
    """Embed and upsert chunks with session-scoped vector IDs."""
    embeddings = await embed_texts(chunks)

    vectors = [
        {
            "id": _vector_id(session_id, doc_id, i),
            "vector": emb,
            "metadata": {
                "session_id": session_id,
                "doc_id": doc_id,
                "chunk_index": i,
                "text": chunk,
            },
        }
        for i, (chunk, emb) in enumerate(zip(chunks, embeddings))
    ]

    async with httpx.AsyncClient(timeout=60) as client:
        for i in range(0, len(vectors), 100):
            batch = vectors[i : i + 100]
            resp = await client.post(
                f"{_upstash_url()}/upsert",
                headers=_upstash_headers(),
                json=batch,
            )
            resp.raise_for_status()

    return len(vectors)


async def delete_doc_vectors(session_id: str, doc_id: str, chunk_count: int):
    """Delete all vectors for a document using deterministic IDs."""
    ids = [_vector_id(session_id, doc_id, i) for i in range(chunk_count)]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(
            f"{_upstash_url()}/delete",
            headers=_upstash_headers(),
            json=ids,
        )
        resp.raise_for_status()


async def search_similar(session_id: str, query: str, top_k: int = 5) -> list[str]:
    """Search for similar chunks, filtered to the current session only."""
    query_emb = await embed_query(query)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{_upstash_url()}/query",
            headers=_upstash_headers(),
            json={
                "vector": query_emb,
                "topK": top_k,
                "includeMetadata": True,
                # Filter ensures users never see each other's documents
                "filter": f'session_id = "{session_id}"',
            },
        )
        resp.raise_for_status()
        results = resp.json().get("result", [])

    return [
        r["metadata"]["text"]
        for r in results
        if r.get("metadata") and "text" in r["metadata"]
    ]
