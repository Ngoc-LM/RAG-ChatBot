import io
import re
import csv
import markdown
import tiktoken
from pypdf import PdfReader
from docx import Document

# Cohere embed-multilingual-v3.0 hard limit is 512 tokens.
# Use 400 to stay safe and leave room for special tokens.
CHUNK_TOKEN_SIZE = 400
CHUNK_TOKEN_OVERLAP = 40

# Shared tokenizer — cl100k_base is a good approximation for multilingual text
_enc = tiktoken.get_encoding("cl100k_base")


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
        html = markdown.markdown(raw_md)
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


def chunk_text(
    text: str,
    chunk_size: int = CHUNK_TOKEN_SIZE,
    overlap: int = CHUNK_TOKEN_OVERLAP,
) -> list[str]:
    """
    Split text into overlapping chunks measured in TOKENS, not words.

    This prevents exceeding Cohere's 512-token limit, which is especially
    important for Vietnamese text (more tokens per word than English).
    """
    tokens = _enc.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunk = _enc.decode(chunk_tokens).strip()
        if chunk:
            chunks.append(chunk)
        if end == len(tokens):
            break
        start += chunk_size - overlap
    return chunks
