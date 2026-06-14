import os
import asyncio
import httpx

COHERE_EMBED_URL = "https://api.cohere.com/v2/embed"
EMBED_MODEL = "embed-multilingual-v3.0"
EMBED_DIM = 1024

CHUNK_TOKEN_SIZE = 400
CHUNK_TOKEN_OVERLAP = 40

# Max chunks returned per document when doing per-doc retrieval
CHUNKS_PER_DOC = 2
# Global top_k for single-pass retrieval (fallback)
GLOBAL_TOP_K = 10


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
            batch = vectors[i: i + 100]
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


async def _query_upstash(query_emb: list[float], filter_str: str, top_k: int) -> list[dict]:
    """Single Upstash query with a filter."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{_upstash_url()}/query",
            headers=_upstash_headers(),
            json={
                "vector": query_emb,
                "topK": top_k,
                "includeMetadata": True,
                "filter": filter_str,
            },
        )
        resp.raise_for_status()
        return resp.json().get("result", [])


async def search_similar(
    session_id: str,
    query: str,
    doc_ids: list[str],
    top_k: int = GLOBAL_TOP_K,
) -> list[dict]:
    """
    Search for relevant chunks across ALL documents in the session.

    Strategy — Per-document retrieval + merge:
      For each document, fire a separate Upstash query filtered to that doc_id.
      This guarantees every document gets a fair chance to contribute context,
      regardless of how many documents are in the session.

      Results are then ranked by score and deduplicated before returning.

    Returns a list of dicts: [{ text, doc_id, score }, ...]
    """
    if not doc_ids:
        return []

    query_emb = await embed_query(query)

    # Fire one query per document concurrently
    async def query_doc(doc_id: str) -> list[dict]:
        results = await _query_upstash(
            query_emb,
            filter_str=f'session_id = "{session_id}" AND doc_id = "{doc_id}"',
            top_k=CHUNKS_PER_DOC,
        )
        return [
            {
                "text": r["metadata"]["text"],
                "doc_id": r["metadata"].get("doc_id", doc_id),
                "score": r.get("score", 0),
            }
            for r in results
            if r.get("metadata") and "text" in r["metadata"]
        ]

    per_doc_results = await asyncio.gather(*[query_doc(doc_id) for doc_id in doc_ids])

    # Flatten, sort by score descending, deduplicate by text
    all_chunks = [chunk for doc_chunks in per_doc_results for chunk in doc_chunks]
    all_chunks.sort(key=lambda x: x["score"], reverse=True)

    seen_texts: set[str] = set()
    unique_chunks = []
    for chunk in all_chunks:
        if chunk["text"] not in seen_texts:
            seen_texts.add(chunk["text"])
            unique_chunks.append(chunk)

    return unique_chunks
