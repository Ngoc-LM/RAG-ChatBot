import io
import csv
import markdown
import pandas as pd
from pypdf import PdfReader
from docx import Document


def parse_document(content: bytes, filename: str) -> str:
    """Parse document content to plain text based on file extension."""
    ext = filename.lower().rsplit(".", 1)[-1]

    if ext == "pdf":
        return _parse_pdf(content)
    elif ext == "docx":
        return _parse_docx(content)
    elif ext == "txt":
        return content.decode("utf-8", errors="ignore")
    elif ext == "md":
        raw_md = content.decode("utf-8", errors="ignore")
        # Strip HTML tags after converting markdown
        html = markdown.markdown(raw_md)
        import re
        return re.sub(r"<[^>]+>", "", html)
    elif ext == "csv":
        return _parse_csv(content)
    else:
        raise ValueError(f"Unsupported file type: {ext}")


def _parse_pdf(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    texts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            texts.append(t)
    return "\n".join(texts)


def _parse_docx(content: bytes) -> str:
    doc = Document(io.BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


def _parse_csv(content: bytes) -> str:
    text = content.decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(text))
    rows = [", ".join(row) for row in reader]
    return "\n".join(rows)


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks by word count."""
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + chunk_size
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks
