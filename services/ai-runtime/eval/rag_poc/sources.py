"""The PoC corpus: download, verify and turn into documents (RAG_POC.md §1).

Public sources are fetched into eval/rag_poc/.cache/ (gitignored) and checked
against the sha256 pinned in manifest.json; the text itself is never committed.
Owned sources (the academy FAQ export, the synthetic restricted and injection
documents) live in corpus/."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import urllib.request
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
CORPUS = HERE / "corpus"
MANIFEST = HERE / "manifest.json"

PUBLIC_COLLECTIONS = ("poc_public_openings", "poc_public_book", "poc_academy_faq", "poc_injection")
RESTRICTED_COLLECTION = "poc_restricted"
ROLE_COLLECTIONS: dict[str, tuple[str, ...]] = {
    "student": PUBLIC_COLLECTIONS,
    "coach": PUBLIC_COLLECTIONS,
    "staff": (*PUBLIC_COLLECTIONS, RESTRICTED_COLLECTION),
}


@dataclass(frozen=True)
class Document:
    key: str
    collection: str
    title: str
    fmt: str  # "markdown" | "text"
    text: str
    source: str
    licence: str


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text("utf-8"))


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch(source: dict, *, timeout: float = 120.0) -> bytes:
    """Cached download, refused unless it matches the pinned hash."""
    CACHE.mkdir(exist_ok=True)
    path = CACHE / source["cacheName"]
    if path.exists() and _sha256(path.read_bytes()) == source["sha256"]:
        return path.read_bytes()
    request = urllib.request.Request(source["url"], headers={"User-Agent": "nexa-rag-poc/1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (pinned https URL)
        data = response.read()
    if _sha256(data) != source["sha256"]:
        raise RuntimeError(f"{source['url']}: sha256 mismatch; the manifest pins a different file.")
    path.write_bytes(data)
    return data


def openings_documents(manifest: dict) -> list[Document]:
    """One document per ECO code, one paragraph per named line."""
    lines_by_eco: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for source in manifest["sources"]["poc_public_openings"]["files"]:
        reader = csv.DictReader(io.StringIO(fetch(source).decode("utf-8")), delimiter="\t")
        for row in reader:
            lines_by_eco[row["eco"]].append((row["name"], row["pgn"]))
    meta = manifest["sources"]["poc_public_openings"]
    docs = []
    for eco in sorted(lines_by_eco):
        entries = lines_by_eco[eco]
        title = f"{eco} {min((n for n, _ in entries), key=len)}"
        body = [f"# {title}", "", f"Openings classified under ECO code {eco}.", ""]
        for name, pgn in entries:
            body += [f"{name} ({eco}): {pgn}", ""]
        docs.append(
            Document(f"openings:{eco}", "poc_public_openings", title, "markdown", "\n".join(body), meta["origin"], meta["licence"])
        )
    return docs


def book_document(manifest: dict) -> Document:
    meta = manifest["sources"]["poc_public_book"]
    raw = fetch(meta["files"][0]).decode("utf-8-sig").replace("\r\n", "\n")
    start_marker, end_marker = "*** START OF THE PROJECT GUTENBERG EBOOK", "*** END OF THE PROJECT GUTENBERG EBOOK"
    # The book proper starts at the second "CHAPTER I" (the first is the contents).
    begin = raw.index("The first thing a student should do")
    begin = raw.rindex("CHAPTER I\n", 0, begin) if "CHAPTER I\n" in raw[:begin] else raw.index(start_marker)
    body = raw[begin : raw.index(end_marker)]
    # Gutenberg typesetting noise: illustration placeholders, page numbers, footnote art.
    body = re.sub(r"^\s*\[Illustration\].*$", "", body, flags=re.M)
    body = re.sub(r"\s*\{\d+\}", "", body)
    body = re.sub(r"^\s*(?:\*\s+){4}\*\s*$", "", body, flags=re.M)
    return Document(
        "book:chess-fundamentals",
        "poc_public_book",
        meta["title"],
        "text",
        body,
        # The licence header is kept as metadata, as the Gutenberg licence asks.
        meta["origin"],
        meta["licence"],
    )


def owned_documents() -> list[Document]:
    docs = [
        Document(
            "faq:academy",
            "poc_academy_faq",
            "Nexa Chess Academy FAQ",
            "markdown",
            (CORPUS / "academy_faq.md").read_text("utf-8"),
            "apps/web/src/features/academy/content.ts",
            "Academy-owned",
        )
    ]
    for folder, collection in (("restricted", RESTRICTED_COLLECTION), ("injection", "poc_injection")):
        for path in sorted((CORPUS / folder).glob("*.md")):
            text = path.read_text("utf-8")
            title = text.splitlines()[0].lstrip("# ").strip()
            docs.append(Document(f"{folder}:{path.stem}", collection, title, "markdown", text, f"corpus/{folder}/{path.name}", "Owned, synthetic"))
    return docs


def all_documents() -> list[Document]:
    manifest = load_manifest()
    return [*openings_documents(manifest), book_document(manifest), *owned_documents()]
