"""Chunk stores: pgvector (the design under test) and an in-memory twin for tests.

Both apply the permission filter (`allowed` collection ids) and the READY
version filter inside the search itself, never on the results afterwards
(AI_FOUNDATION.md §5.3: a namespace is never the authorization mechanism)."""

from __future__ import annotations

import math
import re
import uuid
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol
from urllib.parse import urlparse

from app.rag.chunking import Chunk

from .sources import RESTRICTED_COLLECTION, Document

SCHEMA = Path(__file__).resolve().parent / "schema.sql"


@dataclass(frozen=True)
class StoredChunk:
    id: str
    document_key: str
    collection: str
    title: str
    text: str
    ordinal: int


@dataclass(frozen=True)
class NewVersion:
    document: Document
    sha256: str
    chunks: Sequence[Chunk]
    vectors: Sequence[Sequence[float]]
    embedding_model: str
    warnings: Sequence[str]
    status: str  # READY | PENDING_REVIEW


class Store(Protocol):
    def reset(self, dim: int, embedding_model: str) -> None: ...

    def has_version(self, collection: str, sha256: str) -> bool: ...

    def add_version(self, version: NewVersion) -> str: ...

    def delete_document(self, document_key: str) -> None: ...

    def vector_search(self, vector: Sequence[float], allowed: Sequence[str], k: int) -> list[tuple[str, float]]: ...

    def text_search(self, query: str, allowed: Sequence[str], k: int) -> list[tuple[str, float]]: ...

    def get(self, ids: Sequence[str]) -> dict[str, StoredChunk]: ...

    def count_chunks(self, document_key: str | None = None) -> int: ...

    def version_statuses(self, document_key: str) -> list[str]: ...


def audience_of(collection: str) -> str:
    return "STAFF_ONLY" if collection == RESTRICTED_COLLECTION else "ALL_SIGNED_IN"


# ── In memory ──

_STOP = set(
    "a an and are as at be by can do does for from has have how i in is it of on or should the this to was what "
    "when where which who why will with you your".split()
)
_WORD = re.compile(r"[a-z0-9]+")


def _terms(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower()) if w not in _STOP]


@dataclass
class _MemChunk:
    stored: StoredChunk
    version_id: str
    vector: list[float]
    terms: Counter[str]


@dataclass
class MemoryStore:
    chunks: dict[str, _MemChunk] = field(default_factory=dict)
    versions: dict[str, dict[str, Any]] = field(default_factory=dict)

    def reset(self, dim: int, embedding_model: str) -> None:
        self.chunks.clear()
        self.versions.clear()

    def has_version(self, collection: str, sha256: str) -> bool:
        return any(
            v["collection"] == collection and v["sha256"] == sha256 and v["status"] != "SUPERSEDED"
            for v in self.versions.values()
        )

    def add_version(self, version: NewVersion) -> str:
        doc = version.document
        version_id = str(uuid.uuid4())
        old = [vid for vid, v in self.versions.items() if v["document"] == doc.key and v["status"] == "READY"]
        if version.status == "READY":
            for vid in old:
                self.versions[vid]["status"] = "SUPERSEDED"
        self.versions[version_id] = {
            "collection": doc.collection,
            "document": doc.key,
            "sha256": version.sha256,
            "status": version.status,
        }
        for chunk, vector in zip(version.chunks, version.vectors, strict=True):
            chunk_id = f"{version_id}:{chunk.ordinal}"
            stored = StoredChunk(chunk_id, doc.key, doc.collection, doc.title, chunk.text, chunk.ordinal)
            self.chunks[chunk_id] = _MemChunk(stored, version_id, list(vector), Counter(_terms(chunk.text)))
        if version.status == "READY":
            # Old chunks go after the flip (AI_FOUNDATION.md §5.2, "Updates").
            for cid in [cid for cid, c in self.chunks.items() if c.version_id in old]:
                del self.chunks[cid]
        return version_id

    def delete_document(self, document_key: str) -> None:
        gone = {vid for vid, v in self.versions.items() if v["document"] == document_key}
        for vid in gone:
            del self.versions[vid]
        for cid in [cid for cid, c in self.chunks.items() if c.version_id in gone]:
            del self.chunks[cid]

    def _searchable(self, allowed: Sequence[str]) -> list[_MemChunk]:
        allowed_set = set(allowed)
        return [
            c
            for c in self.chunks.values()
            if c.stored.collection in allowed_set and self.versions[c.version_id]["status"] == "READY"
        ]

    def vector_search(self, vector: Sequence[float], allowed: Sequence[str], k: int) -> list[tuple[str, float]]:
        scored = [(c.stored.id, sum(a * b for a, b in zip(vector, c.vector))) for c in self._searchable(allowed)]
        return sorted(scored, key=lambda p: -p[1])[:k]

    def text_search(self, query: str, allowed: Sequence[str], k: int) -> list[tuple[str, float]]:
        """BM25 (k1=1.2, b=0.75) over the searchable set."""
        docs = self._searchable(allowed)
        if not docs:
            return []
        terms = set(_terms(query))
        avg = sum(sum(c.terms.values()) for c in docs) / len(docs)
        scored = []
        for c in docs:
            length = sum(c.terms.values())
            score = 0.0
            for term in terms:
                tf = c.terms.get(term, 0)
                if not tf:
                    continue
                df = sum(1 for d in docs if term in d.terms)
                idf = math.log(1 + (len(docs) - df + 0.5) / (df + 0.5))
                score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / avg))
            if score > 0:
                scored.append((c.stored.id, score))
        return sorted(scored, key=lambda p: -p[1])[:k]

    def get(self, ids: Sequence[str]) -> dict[str, StoredChunk]:
        return {i: self.chunks[i].stored for i in ids if i in self.chunks}

    def count_chunks(self, document_key: str | None = None) -> int:
        return sum(1 for c in self.chunks.values() if document_key is None or c.stored.document_key == document_key)

    def version_statuses(self, document_key: str) -> list[str]:
        return sorted(v["status"] for v in self.versions.values() if v["document"] == document_key)


# ── pgvector ──


def _vector_literal(vector: Sequence[float]) -> str:
    return "[" + ",".join(f"{v:.7g}" for v in vector) + "]"


class PgStore:
    """Needs psycopg (rag-poc group) and a pgvector Postgres the PoC owns."""

    def __init__(self, dsn: str) -> None:
        database = urlparse(dsn).path.lstrip("/")
        if not database.endswith("_poc"):
            # A guard, not a convenience: reset() drops the whole schema.
            raise ValueError("The PoC store only runs against a database whose name ends in _poc.")
        import psycopg

        self._conn = psycopg.connect(dsn, autocommit=False)
        self._dim = 0

    def reset(self, dim: int, embedding_model: str) -> None:
        self._dim = dim
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(SCHEMA.read_text("utf-8").replace("{dim}", str(int(dim))))
            for collection in ("poc_public_openings", "poc_public_book", "poc_academy_faq", "poc_injection", RESTRICTED_COLLECTION):
                cur.execute(
                    "INSERT INTO rag_poc.knowledge_collection (id, audience, active_embedding_model) VALUES (%s, %s, %s)",
                    (collection, audience_of(collection), embedding_model),
                )
        with self._conn.cursor() as cur:
            # Exact enough for a few thousand rows, and it keeps filtered ANN
            # scans from returning fewer than k rows (pgvector >= 0.8).
            cur.execute("SET hnsw.ef_search = 200")
            cur.execute("SET hnsw.iterative_scan = relaxed_order")
        self._conn.commit()

    def has_version(self, collection: str, sha256: str) -> bool:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM rag_poc.knowledge_document_version"
                " WHERE collection_id = %s AND sha256 = %s AND status <> 'SUPERSEDED'",
                (collection, sha256),
            )
            found = cur.fetchone() is not None
        self._conn.commit()
        return found

    def add_version(self, version: NewVersion) -> str:
        doc = version.document
        version_id = str(uuid.uuid4())
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute(
                "INSERT INTO rag_poc.knowledge_document (id, collection_id, title, source, licence) VALUES (%s, %s, %s, %s, %s)"
                " ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title",
                (doc.key, doc.collection, doc.title, doc.source, doc.licence),
            )
            old: list[str] = []
            if version.status == "READY":
                cur.execute(
                    "UPDATE rag_poc.knowledge_document_version SET status = 'SUPERSEDED'"
                    " WHERE document_id = %s AND status = 'READY' RETURNING id",
                    (doc.key,),
                )
                old = [row[0] for row in cur.fetchall()]
            cur.execute(
                "INSERT INTO rag_poc.knowledge_document_version (id, document_id, collection_id, sha256, status, warnings)"
                " VALUES (%s, %s, %s, %s, %s, %s)",
                (version_id, doc.key, doc.collection, version.sha256, version.status, list(version.warnings)),
            )
            rows = [
                (
                    f"{version_id}:{chunk.ordinal}",
                    version_id,
                    doc.collection,
                    chunk.ordinal,
                    chunk.text,
                    list(chunk.heading_path),
                    chunk.char_start,
                    chunk.char_end,
                    chunk.token_count,
                    chunk.sha256,
                    version.embedding_model,
                    _vector_literal(vector),
                )
                for chunk, vector in zip(version.chunks, version.vectors, strict=True)
            ]
            cur.executemany(
                "INSERT INTO rag_poc.knowledge_chunk (id, version_id, collection_id, ordinal, text, heading_path,"
                " char_start, char_end, token_count, sha256, embedding_model, embedding)"
                " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::vector)",
                rows,
            )
            if old:
                cur.execute("DELETE FROM rag_poc.knowledge_chunk WHERE version_id = ANY(%s)", (old,))
        return version_id

    def delete_document(self, document_key: str) -> None:
        # Chunks go by ON DELETE CASCADE from the version, versions from the document.
        with self._conn.transaction(), self._conn.cursor() as cur:
            cur.execute("DELETE FROM rag_poc.knowledge_document WHERE id = %s", (document_key,))

    def vector_search(self, vector: Sequence[float], allowed: Sequence[str], k: int) -> list[tuple[str, float]]:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT c.id, 1 - (c.embedding <=> %(v)s::vector) FROM rag_poc.knowledge_chunk c"
                " JOIN rag_poc.knowledge_document_version v ON v.id = c.version_id"
                " WHERE c.collection_id = ANY(%(allowed)s) AND v.status = 'READY'"
                " ORDER BY c.embedding <=> %(v)s::vector LIMIT %(k)s",
                {"v": _vector_literal(vector), "allowed": list(allowed), "k": k},
            )
            rows = [(r[0], float(r[1])) for r in cur.fetchall()]
        self._conn.commit()
        # relaxed_order iterative scans may return rows slightly out of order.
        return sorted(rows, key=lambda p: -p[1])

    def text_search(self, query: str, allowed: Sequence[str], k: int) -> list[tuple[str, float]]:
        # OR of the query's words: a question rarely contains every word of
        # its answer, so websearch_to_tsquery's implicit AND would miss.
        words = [w for w in _WORD.findall(query.lower()) if w not in _STOP]
        if not words:
            return []
        tsquery = " | ".join(words)
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT c.id, ts_rank_cd(c.tsv, q) FROM rag_poc.knowledge_chunk c"
                " JOIN rag_poc.knowledge_document_version v ON v.id = c.version_id,"
                " to_tsquery('english', %(q)s) q"
                " WHERE c.collection_id = ANY(%(allowed)s) AND v.status = 'READY' AND c.tsv @@ q"
                " ORDER BY ts_rank_cd(c.tsv, q) DESC, c.id LIMIT %(k)s",
                {"q": tsquery, "allowed": list(allowed), "k": k},
            )
            rows = [(r[0], float(r[1])) for r in cur.fetchall()]
        self._conn.commit()
        return rows

    def get(self, ids: Sequence[str]) -> dict[str, StoredChunk]:
        if not ids:
            return {}
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT c.id, d.id, c.collection_id, d.title, c.text, c.ordinal FROM rag_poc.knowledge_chunk c"
                " JOIN rag_poc.knowledge_document_version v ON v.id = c.version_id"
                " JOIN rag_poc.knowledge_document d ON d.id = v.document_id WHERE c.id = ANY(%s)",
                (list(ids),),
            )
            out = {r[0]: StoredChunk(*r) for r in cur.fetchall()}
        self._conn.commit()
        return out

    def count_chunks(self, document_key: str | None = None) -> int:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM rag_poc.knowledge_chunk c"
                " JOIN rag_poc.knowledge_document_version v ON v.id = c.version_id"
                " WHERE %(d)s::text IS NULL OR v.document_id = %(d)s",
                {"d": document_key},
            )
            (count,) = cur.fetchone()
        self._conn.commit()
        return int(count)

    def version_statuses(self, document_key: str) -> list[str]:
        with self._conn.cursor() as cur:
            cur.execute("SELECT status FROM rag_poc.knowledge_document_version WHERE document_id = %s", (document_key,))
            out = sorted(r[0] for r in cur.fetchall())
        self._conn.commit()
        return out
