import uuid
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from parser import parse_document, chunk_text
from vector_store import upsert_chunks, search_similar, delete_doc_vectors
from storage import upload_file, delete_file
from llm import generate_answer

# In-memory document registry (reset on redeploy — acceptable for MVP)
documents: dict[str, dict] = {}

ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "csv": "text/csv",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("RAG Chatbot backend started.")
    yield
    print("RAG Chatbot backend stopped.")


app = FastAPI(title="RAG Research Assistant", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str


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

    # Read content
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10MB limit.")

    doc_id = str(uuid.uuid4())

    # Upload to Supabase Storage
    content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
    try:
        await upload_file(doc_id, file.filename, content, content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {e}")

    # Parse and chunk
    try:
        text = parse_document(content, file.filename)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse document: {e}")

    if not text.strip():
        raise HTTPException(status_code=422, detail="Document appears to be empty.")

    chunks = chunk_text(text, chunk_size=500, overlap=50)

    # Embed and store in Upstash
    try:
        chunk_count = await upsert_chunks(doc_id, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Vector indexing failed: {e}")

    # Register document
    documents[doc_id] = {
        "filename": file.filename,
        "chunk_count": chunk_count,
    }

    return DocumentInfo(id=doc_id, filename=file.filename, chunk_count=chunk_count)


@app.get("/documents", response_model=list[DocumentInfo])
async def list_documents():
    return [
        DocumentInfo(id=doc_id, filename=info["filename"], chunk_count=info["chunk_count"])
        for doc_id, info in documents.items()
    ]


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found.")

    info = documents[doc_id]

    # Delete from vector store
    try:
        await delete_doc_vectors(doc_id)
    except Exception:
        pass  # Best-effort

    # Delete from Supabase Storage
    try:
        await delete_file(doc_id, info["filename"])
    except Exception:
        pass  # Best-effort

    del documents[doc_id]
    return {"message": f"Document '{info['filename']}' deleted."}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    if not documents:
        return ChatResponse(
            answer="Vui lòng upload ít nhất một tài liệu trước khi đặt câu hỏi."
        )

    # Retrieve relevant chunks
    try:
        chunks = await search_similar(request.message, top_k=5)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

    # Generate answer
    try:
        answer = await generate_answer(request.message, chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM error: {e}")

    return ChatResponse(answer=answer)
