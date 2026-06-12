import os
import httpx

BUCKET = "documents"


def _supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "")


def _headers() -> dict:
    """Build headers lazily so env vars are always resolved at call time."""
    key = os.getenv("SUPABASE_KEY", "")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }


async def upload_file(doc_id: str, filename: str, content: bytes, content_type: str) -> str:
    """Upload file to Supabase Storage and return storage path."""
    path = f"{doc_id}/{filename}"
    url = f"{_supabase_url()}/storage/v1/object/{BUCKET}/{path}"

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": content_type},
            content=content,
        )
        resp.raise_for_status()
    return path


async def delete_file(doc_id: str, filename: str):
    """Delete file from Supabase Storage."""
    path = f"{doc_id}/{filename}"
    url = f"{_supabase_url()}/storage/v1/object/{BUCKET}/{path}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(url, headers=_headers())
        # Ignore 404 — file may already be gone
        if resp.status_code not in (200, 404):
            resp.raise_for_status()


async def list_files() -> list[dict]:
    """List all files in the documents bucket."""
    url = f"{_supabase_url()}/storage/v1/object/list/{BUCKET}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            headers={**_headers(), "Content-Type": "application/json"},
            json={"prefix": "", "limit": 1000, "offset": 0},
        )
        resp.raise_for_status()
        return resp.json()
