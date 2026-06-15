import os
import httpx

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openrouter/owl-alpha"

SYSTEM_PROMPT = """You are a helpful research assistant. Answer questions based on the provided context from the user's documents.

Rules:
- Answer in the same language as the user's question (Vietnamese or English)
- Only use information from the provided context
- If the context doesn't contain enough information, say so honestly
- Be concise and accurate
- Do not fabricate information
- When information comes from multiple documents, synthesize them coherently"""


def _openrouter_headers() -> dict:
    return {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY', '')}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://rag-chatbot.app",
        "X-Title": "RAG Research Assistant",
    }


def _build_sources(chunk_results: list[dict], doc_names: dict[str, str]) -> list[dict]:
    """
    Derive unique source list from retrieved chunks.
    Returns [{ doc_id, filename }] deduplicated, preserving retrieval order.
    """
    seen: set[str] = set()
    sources = []
    for chunk in chunk_results:
        doc_id = chunk.get("doc_id", "")
        if doc_id and doc_id not in seen:
            seen.add(doc_id)
            sources.append({
                "doc_id": doc_id,
                "filename": doc_names.get(doc_id, "Tài liệu"),
            })
    return sources


async def generate_answer(
    query: str,
    chunk_results: list[dict],
    doc_names: dict[str, str] | None = None,
    history: list[dict] | None = None,
) -> dict:
    """
    Generate an answer and return both the answer text and source list.

    Returns:
        { "answer": str, "sources": [{ doc_id, filename }, ...] }
    """
    doc_names = doc_names or {}

    if not chunk_results:
        return {
            "answer": (
                "Tôi không tìm thấy thông tin liên quan trong tài liệu của bạn. "
                "Vui lòng thử câu hỏi khác hoặc upload tài liệu phù hợp hơn."
            ),
            "sources": [],
        }

    sources = _build_sources(chunk_results, doc_names)

    # Build context — number each chunk so LLM can reference them
    context_parts = []
    for i, chunk in enumerate(chunk_results, 1):
        doc_id = chunk.get("doc_id", "")
        filename = doc_names.get(doc_id, "Tài liệu")
        context_parts.append(f"[{i}] {filename}\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)

    user_message = (
        f"Context từ các tài liệu:\n\n{context}\n\n"
        f"Câu hỏi: {query}\n\n"
        "Hãy trả lời dựa trên context trên. "
        "Nếu thông tin đến từ nhiều tài liệu, hãy tổng hợp chúng một cách mạch lạc."
    )

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers=_openrouter_headers(),
            json={
                "model": MODEL,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 1024,
            },
        )

        if resp.status_code != 200:
            raise Exception(f"OpenRouter error {resp.status_code}: {resp.text}")

        data = resp.json()
        answer_text = ""

        if "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            if "message" in choice:
                answer_text = choice["message"].get("content", "")
            elif "text" in choice:
                answer_text = choice["text"]
        else:
            for key in ("content", "text", "output"):
                if key in data:
                    answer_text = data[key]
                    break

        if not answer_text:
            raise Exception(f"Unexpected response format: {list(data.keys())}")

        return {"answer": answer_text, "sources": sources}
