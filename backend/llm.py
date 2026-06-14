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


async def generate_answer(
    query: str,
    chunk_results: list[dict],
    doc_names: dict[str, str] | None = None,
    history: list[dict] | None = None,
) -> str:
    """
    Generate an answer using Owl Alpha via OpenRouter.

    Args:
        query: The current user question.
        chunk_results: List of { text, doc_id, score } from vector search.
        doc_names: Mapping of doc_id → filename for attribution in context.
        history: Optional previous conversation turns.
    """
    if not chunk_results:
        return (
            "Tôi không tìm thấy thông tin liên quan trong tài liệu của bạn. "
            "Vui lòng thử câu hỏi khác hoặc upload tài liệu phù hợp hơn."
        )

    # Build context block — label each chunk with its source document
    context_parts = []
    for i, chunk in enumerate(chunk_results, 1):
        doc_id = chunk.get("doc_id", "")
        filename = (doc_names or {}).get(doc_id, "Tài liệu")
        context_parts.append(f"[{i}] Từ tài liệu: {filename}\n{chunk['text']}")

    context = "\n\n---\n\n".join(context_parts)

    user_message = (
        f"Context từ các tài liệu:\n\n{context}\n\n"
        f"Câu hỏi: {query}\n\n"
        "Hãy trả lời dựa trên context trên. "
        "Nếu thông tin đến từ nhiều tài liệu khác nhau, hãy tổng hợp chúng."
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

        if "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            if "message" in choice:
                return choice["message"].get("content", "")
            elif "text" in choice:
                return choice["text"]

        for key in ("content", "text", "output"):
            if key in data:
                return data[key]

        raise Exception(f"Unexpected response format: {list(data.keys())}")
