import os
import asyncio
import httpx

COHERE_EMBED_URL   = "https://api.cohere.com/v2/embed"
COHERE_RERANK_URL  = "https://api.cohere.com/v2/rerank"
EMBED_MODEL        = "embed-multilingual-v3.0"
RERANK_MODEL       = "rerank-multilingual-v3.0"
EMBED_DIM          = 1024

CHUNK_TOKEN_SIZE   = 400
CHUNK_TOKEN_OVERLAP = 40

# Stage 1 — retrieve: how many chunks to fetch per document from Upstash.
# Intentionally high so rerank has a large candidate pool to work with.
CHUNKS_PER_DOC_RETRIEVE = 5

# Stage 2 — rerank: how many chunks to keep after reranking across all docs.
TOP_N_AFTER_RERANK = 6

# Minimum rerank relevance score to include a chunk (0.0–1.0).
# Filters out chunks that are clearly off-topic even if nothing better exists.
RERANK_SCORE_THRESHOLD = 0.1


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


# ── Embedding ─────────────────────────────────────────────────────────────────

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


# ── Reranking ─────────────────────────────────────────────────────────────────

async def rerank_chunks(
    query: str,
    chunks: list[dict],
    top_n: int = TOP_N_AFTER_RERANK,
) -> list[dict]:
    """
    Re-score a list of candidate chunks using Cohere Rerank.

    Rerank uses a cross-encoder model that reads the query and each document
    together — much more accurate than cosine similarity alone because it
    captures query-document interaction rather than comparing independent vectors.

    Args:
        query:  The user's question.
        chunks: Candidate list of { text, doc_id, score } dicts.
        top_n:  How many to return after reranking.

    Returns the same dict format with score replaced by the rerank relevance score.
    Falls back to the original cosine-similarity ranking if the API call fails.
    """
    if not chunks:
        return []

    # Cohere Rerank accepts up to 1000 documents per call
    documents = [c["text"] for c in chunks]

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                COHERE_RERANK_URL,
                headers=_cohere_headers(),
                json={
                    "model": RERANK_MODEL,
                    "query": query,
                    "documents": documents,
                    "top_n": top_n,
                    "return_documents": False,  # we already have the texts
                },
            )
            resp.raise_for_status()
            results = resp.json().get("results", [])

        reranked = []
        for r in results:
            relevance = r.get("relevance_score", 0)
            if relevance < RERANK_SCORE_THRESHOLD:
                continue
            original = chunks[r["index"]]
            reranked.append({
                "text":            original["text"],
                "doc_id":          original["doc_id"],
                "embed_score":     original["score"],    # original cosine score
                "relevance_score": relevance,            # rerank score (more reliable)
                "score":           relevance,            # unified field used downstream
            })

        # If all chunks were filtered by threshold, keep the best one anyway
        if not reranked and results:
            best = results[0]
            original = chunks[best["index"]]
            reranked = [{
                "text":            original["text"],
                "doc_id":          original["doc_id"],
                "embed_score":     original["score"],
                "relevance_score": best.get("relevance_score", 0),
                "score":           best.get("relevance_score", 0),
            }]

        return reranked

    except Exception as e:
        # Graceful fallback: rerank failed, return top_n by cosine score
        print(f"[rerank] Warning — Cohere Rerank failed, falling back: {e}")
        return chunks[:top_n]


# ── Upstash operations ────────────────────────────────────────────────────────

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


# ── Main search pipeline ──────────────────────────────────────────────────────

async def search_similar(
    session_id: str,
    query: str,
    doc_ids: list[str],
) -> list[dict]:
    """
    Two-stage retrieval pipeline: embed → retrieve → rerank.

    Stage 1 — Retrieve (Upstash Vector, cosine similarity):
        Query each document separately to guarantee representation,
        fetching CHUNKS_PER_DOC_RETRIEVE candidates per doc.

    Stage 2 — Rerank (Cohere Rerank cross-encoder):
        Score all candidates jointly against the query.
        Returns TOP_N_AFTER_RERANK chunks ordered by true relevance.

    The two-stage approach gives us:
    - Recall: per-doc retrieval ensures no document is ignored.
    - Precision: rerank filters out chunks that merely share vocabulary
      with the query but aren't actually relevant.

    Returns list of { text, doc_id, score, embed_score, relevance_score }.
    """
    if not doc_ids:
        return []

    # ── Stage 1: embed query + retrieve candidates concurrently ──
    query_emb = await embed_query(query)

    async def query_doc(doc_id: str) -> list[dict]:
        results = await _query_upstash(
            query_emb,
            filter_str=f'session_id = "{session_id}" AND doc_id = "{doc_id}"',
            top_k=CHUNKS_PER_DOC_RETRIEVE,
        )
        return [
            {
                "text":   r["metadata"]["text"],
                "doc_id": r["metadata"].get("doc_id", doc_id),
                "score":  r.get("score", 0),
            }
            for r in results
            if r.get("metadata") and "text" in r["metadata"]
        ]

    per_doc_results = await asyncio.gather(*[query_doc(doc_id) for doc_id in doc_ids])

    # Flatten + deduplicate by text
    seen: set[str] = set()
    candidates: list[dict] = []
    for doc_chunks in per_doc_results:
        for chunk in doc_chunks:
            if chunk["text"] not in seen:
                seen.add(chunk["text"])
                candidates.append(chunk)

    if not candidates:
        return []

    # ── Stage 2: rerank all candidates against the query ──
    reranked = await rerank_chunks(query, candidates, top_n=TOP_N_AFTER_RERANK)

    return reranked
