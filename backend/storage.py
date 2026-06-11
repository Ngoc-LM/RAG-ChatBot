import os
import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BUCKET = "documents"

HEADERS = {
    "apikey": SUPABASE_KEY if SUPABASE_KEY else "",
    "Authorization": f"Bearer {SUPABASE_KEY}" if SUPABASE_KEY else "",
}


async def upload_file(doc_id: str, filename: str, content: bytes, content_type: str) -> str:
    """Upload file to Supabase Storage and return public path."""
    path = f"{doc_id}/{filename}"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            headers={**HEADERS, "Content-Type": content_type},
            content=content,
        )
        resp.raise_for_status()
    return path


async def delete_file(doc_id: str, filename: str):
    """Delete file from Supabase Storage."""
    path = f"{doc_id}/{filename}"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(url, headers=HEADERS)
        # Ignore 404 — file may already be gone
        if resp.status_code not in (200, 404):
            resp.raise_for_status()


async def list_files() -> list[dict]:
    """List all files in the documents bucket."""
    url = f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            headers={**HEADERS, "Content-Type": "application/json"},
            json={"prefix": "", "limit": 1000, "offset": 0},
        )
        resp.raise_for_status()
        return resp.json()
