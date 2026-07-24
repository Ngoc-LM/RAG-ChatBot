# RAG Research Assistant

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-Educational-lightgrey)

A full-stack, multi-tenant Retrieval-Augmented Generation (RAG) chatbot for document-grounded Q&A in Vietnamese and English. Upload PDF, DOCX, TXT, Markdown, or CSV files and ask questions answered strictly from their content, with cited sources.

**Live demo:** [rag-chatbot-one-blush.vercel.app](https://rag-chatbot-one-blush.vercel.app)

---

## Table of contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Key features](#key-features)
- [Tech stack](#tech-stack)
- [Repository structure](#repository-structure)
- [API reference](#api-reference)
- [Configuration](#configuration)
- [Getting started](#getting-started)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Security notes](#security-notes)
- [License](#license)

## Overview

This project implements a production-oriented RAG pipeline rather than a single-user prototype. Each browser session is fully isolated — documents, vector embeddings, and conversation state never cross between users, despite the entire system running on shared free-tier infrastructure.

Retrieval uses a two-stage design: per-document vector search guarantees every uploaded file is represented in the candidate pool, then a cross-encoder reranker scores all candidates jointly against the query before the top results reach the LLM. This avoids the common failure mode where a single dominant document crowds out relevant context from the others.

## Architecture

```
┌─────────────┐      HTTPS       ┌──────────────────┐
│   Frontend   │ ───────────────▶ │      Backend      │
│ React + Vite │  X-Session-ID    │     FastAPI       │
│   (Vercel)   │ ◀─────────────── │     (Render)      │
└─────────────┘                  └─────────┬─────────┘
                                            │
                ┌───────────────────────────┼───────────────────────────┐
                ▼                           ▼                           ▼
      ┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
      │      Cohere       │       │  Upstash Vector   │       │     Supabase      │
      │ Embed + Rerank    │       │   (vector store)  │       │  (file storage)   │
      └──────────────────┘       └──────────────────┘       └──────────────────┘
                                            │
                                            ▼
                                  ┌──────────────────┐
                                  │    OpenRouter      │
                                  │   (LLM gateway)    │
                                  └──────────────────┘
```

### Retrieval pipeline

```
Query
  │
  ├─ embed query (Cohere, search_query mode)
  │
  ├─ for each document in session (parallel):
  │     query Upstash Vector, filtered by session_id + doc_id
  │     → top 5 candidate chunks
  │
  ├─ deduplicate + flatten candidates
  │
  ├─ Cohere Rerank (cross-encoder, scores query against all candidates jointly)
  │     → top 6 chunks by true relevance, threshold-filtered
  │
  └─ LLM generation (OpenRouter), with explicit source attribution
```

## Key features

- **Two-stage retrieval** — per-document vector search followed by cross-encoder reranking, ensuring balanced context across multiple uploaded documents and filtering out chunks that merely share vocabulary with the query.
- **Multi-tenant session isolation** — no authentication required; each client generates a UUID session on first visit, persisted in `localStorage`. Documents, vector IDs, and file storage paths are all namespaced by session, with zero cross-session data exposure.
- **Production-grade backend safeguards** — sliding-window rate limiting per endpoint, TTL-based in-memory cache eviction for idle sessions, and a per-session chunk quota to prevent any single user from exhausting the shared vector store.
- **Token-aware chunking** — documents are split using `tiktoken`, not naive word counts, keeping every chunk under the embedding model's token limit even for token-dense languages like Vietnamese.
- **Source-attributed answers** — every response includes the exact source documents used, derived directly from retrieval results rather than the LLM's own (unreliable) self-reporting.
- **Multilingual support** — Vietnamese and English, powered by Cohere's multilingual embedding and reranking models.
- **Persistent, restart-safe state** — document registries are stored in Supabase, not backend memory, so sessions survive backend redeploys and cold starts.
- **Rich frontend** — Markdown rendering with KaTeX math support, animated dot-matrix background, responsive mobile drawer navigation, and per-message source citations.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | FastAPI (Python), `httpx` (async HTTP) |
| Embeddings & Reranking | Cohere (`embed-multilingual-v3.0`, `rerank-multilingual-v3.0`) |
| Vector store | Upstash Vector (REST API, no SDK) |
| File storage | Supabase Storage |
| LLM gateway | OpenRouter |
| Math rendering | KaTeX |
| Tokenization | `tiktoken` |
| Frontend hosting | Vercel |
| Backend hosting | Render |

## Repository structure

```
rag-chatbot/
├── backend/
│   ├── main.py            # FastAPI routes, session handling, quota enforcement
│   ├── parser.py          # Document parsing + token-aware chunking
│   ├── vector_store.py    # Embedding, vector search, reranking pipeline
│   ├── storage.py         # Supabase Storage client
│   ├── llm.py             # OpenRouter integration, source attribution
│   ├── rate_limit.py      # Sliding-window rate limiter + TTL cache
│   ├── requirements.txt
│   ├── render.yaml        # Render Blueprint (service + env var definitions)
│   └── .python-version    # Pins Python 3.11.9 for the Render build
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── session.js              # Client-side session ID management
    │   └── components/
    │       ├── ChatPanel.jsx
    │       ├── UploadPanel.jsx
    │       ├── MarkdownText.jsx    # Markdown + KaTeX renderer
    │       └── DotMatrixBackground.jsx
    ├── package.json
    └── vercel.json
```

## API reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check; reports active in-memory session count |
| `POST` | `/upload` | Upload and index a document (multipart form) |
| `GET` | `/documents` | List documents in the current session |
| `DELETE` | `/documents/{doc_id}` | Delete a document and its associated vectors |
| `POST` | `/chat` | Submit a question; returns an answer with `sources` |

All endpoints except `/health` require an `X-Session-ID` header, sent automatically by the frontend.

### Constraints

| Parameter | Value |
|---|---|
| Max file size | 10 MB |
| Supported formats | PDF, DOCX, TXT, MD, CSV |
| Max chunks per session | 1,000 (~5–6 medium documents) |
| Chunk size / overlap | 400 / 40 tokens |
| Rate limit — upload | 10 requests / 60s |
| Rate limit — chat | 30 requests / 60s |
| Rate limit — delete | 20 requests / 60s |
| Session cache TTL | 30 minutes idle |

## Configuration

The backend is configured entirely through environment variables. None have insecure defaults — every external service must be supplied explicitly.

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key for LLM generation |
| `COHERE_API_KEY` | Yes | Cohere API key for embeddings and reranking |
| `UPSTASH_VECTOR_REST_URL` | Yes | Upstash Vector REST endpoint |
| `UPSTASH_VECTOR_REST_TOKEN` | Yes | Upstash Vector REST token |
| `SUPABASE_URL` | Yes | Supabase project URL (`https://<ref>.supabase.co`, no trailing slash) |
| `SUPABASE_KEY` | Yes | Supabase service-role key (Storage read/write) |
| `ALLOWED_ORIGINS` | Yes (prod) | Comma-separated allowed CORS origins. Defaults to `http://localhost:3000` if unset |
| `PORT` | No | Port to bind; injected automatically by the host. Defaults to `8000` |

The frontend reads a single build-time variable:

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Yes (prod) | Base URL of the backend API. Defaults to `http://localhost:8000` |

> **Note:** `VITE_*` variables are inlined at **build** time, not runtime. Changing `VITE_API_URL` requires a fresh frontend build/redeploy to take effect.

## Getting started

### Prerequisites

- Python 3.11+
- Node.js 18+
- API keys: [Cohere](https://cohere.com), [OpenRouter](https://openrouter.ai), [Upstash Vector](https://upstash.com), [Supabase](https://supabase.com)

### Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in `backend/` (see [Configuration](#configuration)):

```env
OPENROUTER_API_KEY=sk-or-v1-...
COHERE_API_KEY=...
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=...
ALLOWED_ORIGINS=http://localhost:5173
```

In Supabase, create a private Storage bucket named `documents`.

Run the backend:

```bash
uvicorn main:app --reload --port 8000
```

### Frontend setup

```bash
cd frontend
npm install
```

Create a `.env.local` file in `frontend/`:

```env
VITE_API_URL=http://localhost:8000
```

Run the frontend:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Deployment

### Backend (Render)

The repository ships a Render Blueprint at `backend/render.yaml`, which declares the web service, its Python runtime, and all required environment variables.

**Option A — Blueprint (recommended).** In Render, choose **New → Blueprint** and point it at this repository. Render reads `backend/render.yaml`, provisions the service with `rootDir: backend`, and prompts for each secret marked `sync: false` (`OPENROUTER_API_KEY`, `COHERE_API_KEY`, `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`, `SUPABASE_URL`, `SUPABASE_KEY`). Update the `ALLOWED_ORIGINS` value to match your frontend's public domain.

**Option B — Manual web service.** Create a new **Web Service**, set:

- **Root directory:** `backend`
- **Build command:** `pip install -r requirements.txt`
- **Start command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **Health check path:** `/health`
- Add every variable from [Configuration](#configuration) under **Environment**.

> **Python version matters.** `backend/.python-version` pins Python **3.11.9**. This is required: `tiktoken==0.7.0` publishes prebuilt wheels only up to Python 3.12, so on newer interpreters the build falls back to compiling from Rust source and fails on Render's read-only build filesystem. The `.python-version` file is honored on every deploy, including manually created services (unlike `render.yaml`'s `envVars`, which apply only to Blueprint-provisioned services).

### Frontend (Vercel)

Deploy the `frontend/` directory as the project root, with the **Vite** framework preset auto-detected. Set `VITE_API_URL` to your Render backend URL (e.g. `https://<service>.onrender.com`, no trailing slash), then redeploy so the value is baked into the build.

### Supabase

Create a private Storage bucket named `documents`. No additional database schema is required — session registries are stored as JSON objects within the same bucket. On the free tier, projects are **paused after a week of inactivity**; a paused project causes storage requests to fail, so resume it from the Supabase dashboard before use.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Failed to fetch` / `ERR_CONNECTION_REFUSED` calling `localhost:8000` | `VITE_API_URL` not set on Vercel | Set it to the Render URL and redeploy the frontend |
| `blocked by CORS policy` | Frontend origin not in `ALLOWED_ORIGINS` | Set `ALLOWED_ORIGINS` on the backend to the exact Vercel domain, then redeploy |
| `Building wheel for tiktoken ... error` at build time | Build ran on Python 3.13+ | Ensure `backend/.python-version` (3.11.9) is present and picked up |
| `Storage upload failed: [Errno -2] Name or service not known` | Bad/empty `SUPABASE_URL`, or Supabase project paused | Verify the URL (no stray whitespace) and resume the Supabase project |
| First request after idle is slow (10–30s) | Render free-tier cold start | Expected; the service spins back up on the first request |

## Known limitations

- **Scanned PDFs are not supported.** Text extraction relies on `pypdf`, which requires a text layer; OCR is not yet implemented.
- **Render free-tier cold starts.** After a period of inactivity, the backend may take 10–30 seconds to respond to the first request.
- **Shared vector store quota.** Upstash's free tier caps at 10,000 vectors across all sessions; the per-session quota mitigates but does not eliminate this constraint under heavy aggregate usage.

## Security notes

- Never commit `.env` files — already excluded via `.gitignore`.
- Rotate API keys immediately if accidentally exposed in commits, logs, or chat transcripts.
- Session IDs are client-generated UUIDs with no cryptographic authentication; this is a deliberate trade-off for frictionless, login-free access, not a substitute for real auth in a higher-stakes deployment.

## License

This project is provided as-is for educational and portfolio purposes.
