import os
import httpx

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "openrouter/owl-alpha"

SYSTEM_PROMPT = """You are a helpful research assistant. Answer questions based on the provided context from the user's documents.

Rules:
- Answer in the same language as the user's question (Vietnamese or English)
- Only use information from the provided context
- If the context doesn't contain enough information, say so honestly
- Be concise and accurate
- Do not fabricate information"""


async def generate_answer(query: str, context_chunks: list[str]) -> str:
    """Generate an answer using Owl Alpha via OpenRouter given query and context."""
    if not context_chunks:
        return (
            "Tôi không tìm thấy thông tin liên quan trong tài liệu của bạn. "
            "Vui lòng upload tài liệu phù hợp hoặc thử câu hỏi khác."
        )

    context = "\n\n---\n\n".join(context_chunks)
    user_message = f"""Context from documents:
{context}

Question: {query}

Please answer the question based on the context above."""

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://rag-chatbot.app",
                "X-Title": "RAG Research Assistant",
            },
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
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

        # Non-standard formats
        if "content" in data:
            return data["content"]
        if "text" in data:
            return data["text"]
        if "output" in data:
            return data["output"]

        # Log full response for debugging
        raise Exception(f"Unexpected response format: {list(data.keys())}")
