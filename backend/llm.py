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
- Do not fabricate information"""


def _openrouter_headers() -> dict:
    return {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY', '')}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://rag-chatbot.app",
        "X-Title": "RAG Research Assistant",
    }


async def generate_answer(
    query: str,
    context_chunks: list[str],
    history: list[dict] | None = None,
) -> str:
    """
    Generate an answer using Owl Alpha via OpenRouter.

    Args:
        query: The current user question.
        context_chunks: Relevant text chunks retrieved from the vector store.
        history: Optional list of previous turns [{"role": "user"|"assistant", "content": "..."}].
                 Injected before the current turn so the LLM has conversation context.
    """
    if not context_chunks:
        return (
            "Tôi không tìm thấy thông tin liên quan trong tài liệu của bạn. "
            "Vui lòng upload tài liệu phù hợp hoặc thử câu hỏi khác."
        )

    context = "\n\n---\n\n".join(context_chunks)
    user_message = (
        f"Context from documents:\n{context}\n\nQuestion: {query}\n\n"
        "Please answer the question based on the context above."
    )

    # Build message list: system → history (optional) → current user turn
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

        # Standard OpenAI-compatible format
        if "choices" in data and len(data["choices"]) > 0:
            choice = data["choices"][0]
            if "message" in choice:
                return choice["message"].get("content", "")
            elif "text" in choice:
                return choice["text"]

        # Non-standard fallback formats
        for key in ("content", "text", "output"):
            if key in data:
                return data[key]

        raise Exception(f"Unexpected response format: {list(data.keys())}")
