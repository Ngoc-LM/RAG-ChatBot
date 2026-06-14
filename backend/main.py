import uuid
import os
import json
import asyncio
from contextlib import asynccontextmanager
from functools import wraps

import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Annotated

load_dotenv()

from parser import parse_document, chunk_text
from vector_store import upsert_chunks, search_similar, delete_doc_vectors
from storage import upload_file, delete_file
from llm import generate_answer
from rate_limit import rate_limiter, registry_cache, CLEANUP_INTERVAL_SECONDS


ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "csv": "text/csv",
}

_BUCKET = "documents"


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "")


def _supabase_headers(content_type: str = "application/json") -> dict:
    key = os.getenv("SUPABASE_KEY", "")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
    }


# ── Session validation ────────────────────────────────────────────────────────

def _get_session(x_session_id: Annotated[str | None, Header()] = None) -> str:
    if not x_session_id or len(x_session_id) < 8:
        raise HTTPException(status_code=400, detail="Missing or invalid X-Session-ID header.")
    sanitized = "".join(c for c in x_session_id if c.isalnum() or c == "-")
    if len(sanitized) < 8:
        raise HTTPException(status_code=400, detail="Invalid X-Session-ID format.")
    return sanitized[:64]


# ── Rate limiting helper ──────────────────────────────────────────────────────

def check_rate_limit(session_id: str, endpoint: str):
    """Raise 429 if session has exceeded the rate limit for this endpoint."""
    allowed, retry_after = rate_limiter.is_allowed(session_id, endpoint)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Quá nhiều yêu cầu. Vui lòng thử lại sau {retry_after} giây.",
            headers={"Retry-After": str(retry_after)},
        )


# ── Per-session registry (TTL-cached) ────────────────────────────────────────
# Registry files are persisted on Supabase Storage.
# In-memory TTLRegistryCache evicts idle sessions after 30 minutes.

def _registry_path(session_id: str) -> str:
    return f"_registry_{session_id}.json"


async def _load_registry(session_id: str) -> dict[str, dict]:
    """Load session registry — memory first, Supabase fallback."""
    cached = registry_cache.get(session_id)
    if cached is not None:
        return cached

    url = f"{_supabase_url()}/storage/v1/object/{_BUCKET}/{_registry_path(session_id)}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=_supabase_headers())
            if resp.status_code == 200:
                data = resp.json()
                registry_cache.set(session_id, data)
                return data
            if resp.status_code in (400, 404):
                registry_cache.set(session_id, {})
                return {}
            resp.raise_for_status()
    except Exception as e:
        print(f"[registry:{session_id[:8]}] Load warning: {e}")
        registry_cache.set(session_id, {})
    return {}


async def _save_registry(session_id: str, registry: dict[str, dict]):
    """Persist registry to Supabase and update TTL cache."""
    registry_cache.set(session_id, registry)

    content = json.dumps(registry, ensure_ascii=False).encode("utf-8")
    base_url = f"{_supabase_url()}/storage/v1/object"
    path = _registry_path(session_id)

    async with httpx.AsyncClient(timeout=15) as client:
        for method, url in [
            ("patch", f"{base_url}/{_BUCKET}/{path}"),
            ("post",  f"{base_url}/{_BUCKET}/{path}"),
        ]:
            resp = await getattr(client, method)(
                url,
                headers=_supabase_headers("application/json"),
                content=content,
            )
            if resp.status_code in (200, 201):
                return
            if method == "patch" and resp.status_code in (400, 404):
                continue
            resp.raise_for_status()


# ── Background cleanup task ───────────────────────────────────────────────────

async def _cleanup_loop():
    """Periodically evict expired sessions from cache and clean up rate limiter."""
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
        registry_cache.evict_expired()
        rate_limiter.cleanup()
        print(f"[cleanup] Cache size: {registry_cache.size} session(s)")


# ── App setup ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] RAG Chatbot backend started.")
    task = asyncio.create_task(_cleanup_loop())
    yield
    task.cancel()
    print("[shutdown] RAG Chatbot backend stopped.")


app = FastAPI(title="RAG Research Assistant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Session-ID"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[HistoryMessage] = []


class ChatResponse(BaseModel):
    answer: str


class DocumentInfo(BaseModel):
    id: str
    filename: str
    chunk_count: int


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "cache_sessions": registry_cache.size,
    }


@app.post("/upload", response_model=DocumentInfo)
async def upload_document(
    file: UploadFile = File(...),
    x_session_id: Annotated[str | None, Header()] = None,
):
    session_id = _get_session(x_session_id)
    check_rate_limit(session_id, "upload")

    ext = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit.")

    doc_id = str(uuid.uuid4())

    content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
    try:
        await upload_file(session_id, doc_id, file.filename, content, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    try:
        text = parse_document(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse document: {e}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="Document appears to be empty.")

    chunks = chunk_text(text)

    try:
        chunk_count = await upsert_chunks(session_id, doc_id, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector indexing failed: {e}")

    registry = await _load_registry(session_id)
    registry[doc_id] = {"filename": file.filename, "chunk_count": chunk_count}
    try:
        await _save_registry(session_id, registry)
    except Exception as e:
        print(f"[registry] Save warning: {e}")

    return DocumentInfo(id=doc_id, filename=file.filename, chunk_count=chunk_count)


@app.get("/documents", response_model=list[DocumentInfo])
async def list_documents(
    x_session_id: Annotated[str | None, Header()] = None,
):
    session_id = _get_session(x_session_id)
    registry = await _load_registry(session_id)
    return [
        DocumentInfo(id=doc_id, filename=info["filename"], chunk_count=info["chunk_count"])
        for doc_id, info in registry.items()
    ]


@app.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    x_session_id: Annotated[str | None, Header()] = None,
):
    session_id = _get_session(x_session_id)
    check_rate_limit(session_id, "delete")

    registry = await _load_registry(session_id)
    if doc_id not in registry:
        raise HTTPException(status_code=404, detail="Document not found.")

    info = registry[doc_id]

    try:
        await delete_doc_vectors(session_id, doc_id, info["chunk_count"])
    except Exception as e:
        print(f"[delete] Vector delete warning: {e}")

    try:
        await delete_file(session_id, doc_id, info["filename"])
    except Exception as e:
        print(f"[delete] File delete warning: {e}")

    del registry[doc_id]
    try:
        await _save_registry(session_id, registry)
    except Exception as e:
        print(f"[registry] Save warning: {e}")

    return {"message": f"Document '{info['filename']}' deleted."}


@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    x_session_id: Annotated[str | None, Header()] = None,
):
    session_id = _get_session(x_session_id)
    check_rate_limit(session_id, "chat")

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    registry = await _load_registry(session_id)
    if not registry:
        return ChatResponse(
            answer="Vui lòng upload ít nhất một tài liệu trước khi đặt câu hỏi."
        )

    doc_ids = list(registry.keys())

    try:
        chunk_results = await search_similar(session_id, request.message, doc_ids=doc_ids)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    history = [{"role": m.role, "content": m.content} for m in request.history]
    doc_names = {doc_id: info["filename"] for doc_id, info in registry.items()}

    try:
        answer = await generate_answer(
            request.message,
            chunk_results,
            doc_names=doc_names,
            history=history or None,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    return ChatResponse(answer=answer)
