import uuid
import os
import json
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from parser import parse_document, chunk_text
from vector_store import upsert_chunks, search_similar, delete_doc_vectors
from storage import upload_file, delete_file
from llm import generate_answer


ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "csv": "text/csv",
}

# ── Persistent document registry via Supabase KV ──────────────────────────────
# Stored as a single JSON object in Supabase Storage under:
#   documents/_registry.json
# Format: { doc_id: { filename, chunk_count } }
#
# This survives Railway restarts/redeploys. Reads are cached in-memory;
# writes go to both the cache and Supabase.

_registry_cache: dict[str, dict] | None = None
_REGISTRY_PATH = "_registry.json"
_BUCKET = "documents"


def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "")


def _supabase_headers(content_type: str = "application/json") -> dict:
    key = os.getenv("SUPABASE_KEY", "")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": content_type,
    }


async def _load_registry() -> dict[str, dict]:
    """Load document registry from Supabase Storage (with in-memory cache)."""
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache

    url = f"{_supabase_url()}/storage/v1/object/{_BUCKET}/{_REGISTRY_PATH}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=_supabase_headers())
            if resp.status_code == 200:
                _registry_cache = resp.json()
                return _registry_cache
            # 400/404 means file doesn't exist yet — start fresh
            if resp.status_code in (400, 404):
                _registry_cache = {}
                return _registry_cache
            resp.raise_for_status()
    except Exception as e:
        print(f"[registry] Load warning: {e} — starting with empty registry")
        _registry_cache = {}
    return _registry_cache


async def _save_registry(registry: dict[str, dict]):
    """Persist registry to Supabase Storage and update in-memory cache."""
    global _registry_cache
    _registry_cache = registry

    content = json.dumps(registry, ensure_ascii=False).encode("utf-8")
    base_url = f"{_supabase_url()}/storage/v1/object"

    async with httpx.AsyncClient(timeout=15) as client:
        # Try PATCH (update) first, fall back to POST (create)
        for method, url in [
            ("patch", f"{base_url}/{_BUCKET}/{_REGISTRY_PATH}"),
            ("post", f"{base_url}/{_BUCKET}/{_REGISTRY_PATH}"),
        ]:
            resp = await getattr(client, method)(
                url,
                headers=_supabase_headers("application/json"),
                content=content,
            )
            if resp.status_code in (200, 201):
                return
            if method == "patch" and resp.status_code in (400, 404):
                continue  # file doesn't exist yet, try POST
            resp.raise_for_status()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm registry on startup
    registry = await _load_registry()
    print(f"[startup] Loaded {len(registry)} document(s) from registry.")
    yield
    print("[shutdown] RAG Chatbot backend stopped.")


app = FastAPI(title="RAG Research Assistant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str   # "user" or "assistant"
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
    return {"status": "ok"}


@app.post("/upload", response_model=DocumentInfo)
async def upload_document(file: UploadFile = File(...)):
    # Validate extension
    ext = file.filename.lower().rsplit(".", 1)[-1] if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read & size-check
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit.")

    doc_id = str(uuid.uuid4())

    # Upload raw file to Supabase Storage
    content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
    try:
        await upload_file(doc_id, file.filename, content, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    # Parse → chunk
    try:
        text = parse_document(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse document: {e}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="Document appears to be empty.")

    chunks = chunk_text(text)

    # Embed → upsert into Upstash
    try:
        chunk_count = await upsert_chunks(doc_id, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector indexing failed: {e}")

    # Persist registry entry
    registry = await _load_registry()
    registry[doc_id] = {"filename": file.filename, "chunk_count": chunk_count}
    try:
        await _save_registry(registry)
    except Exception as e:
        print(f"[registry] Save warning: {e}")

    return DocumentInfo(id=doc_id, filename=file.filename, chunk_count=chunk_count)


@app.get("/documents", response_model=list[DocumentInfo])
async def list_documents():
    registry = await _load_registry()
    return [
        DocumentInfo(id=doc_id, filename=info["filename"], chunk_count=info["chunk_count"])
        for doc_id, info in registry.items()
    ]


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    registry = await _load_registry()
    if doc_id not in registry:
        raise HTTPException(status_code=404, detail="Document not found.")

    info = registry[doc_id]

    # Delete vectors using known chunk_count (no dummy-vector query needed)
    try:
        await delete_doc_vectors(doc_id, info["chunk_count"])
    except Exception as e:
        print(f"[delete] Vector delete warning: {e}")

    # Delete raw file from Supabase Storage
    try:
        await delete_file(doc_id, info["filename"])
    except Exception as e:
        print(f"[delete] File delete warning: {e}")

    # Update registry
    del registry[doc_id]
    try:
        await _save_registry(registry)
    except Exception as e:
        print(f"[registry] Save warning: {e}")

    return {"message": f"Document '{info['filename']}' deleted."}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    registry = await _load_registry()
    if not registry:
        return ChatResponse(
            answer="Vui lòng upload ít nhất một tài liệu trước khi đặt câu hỏi."
        )

    # Retrieve relevant chunks
    try:
        chunks = await search_similar(request.message, top_k=5)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    # Convert history to plain dicts for llm.py
    history = [{"role": m.role, "content": m.content} for m in request.history]

    # Generate answer
    try:
        answer = await generate_answer(request.message, chunks, history=history or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    return ChatResponse(answer=answer)
