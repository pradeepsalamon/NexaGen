"""Ingest, retrieve and answer, wired the way AI_FOUNDATION.md §5.1 draws it."""

from __future__ import annotations

import re
import time
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Literal

from app.rag.chunking import chunk_document
from app.rag.citations import CitationCheck, validate_citations
from app.rag.context import ContextChunk, build_context
from app.rag.fusion import reciprocal_rank_fusion
from app.rag.injection import flags_for
from app.rag.text import normalize_text, sha256_hex

from .embedders import Embedder, Reranker
from .sources import Document
from .stores import NewVersion, Store, StoredChunk

Mode = Literal["vector", "text", "hybrid", "hybrid_rerank"]
MODES: tuple[Mode, ...] = ("vector", "text", "hybrid", "hybrid_rerank")
CANDIDATES = 30
ABSTAIN = "NO_APPROVED_SOURCE"
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


@dataclass
class IngestResult:
    status: Literal["READY", "PENDING_REVIEW", "DUPLICATE"]
    version_id: str | None
    chunks: int
    warnings: list[str]


@dataclass
class Retrieval:
    hits: list[str]
    # The abstention signal: top cosine for vector/hybrid, top rerank score
    # for hybrid_rerank, top ts_rank for text. None when nothing matched.
    signal: float | None
    timings_ms: dict[str, float] = field(default_factory=dict)


@dataclass
class Answer:
    answer: str
    citations: list[dict[str, str]]
    abstained: bool
    check: CitationCheck | None = None


class Pipeline:
    def __init__(
        self,
        store: Store,
        embedder: Embedder,
        *,
        chunk_tokens: int = 400,
        reranker: Reranker | None = None,
    ) -> None:
        self.store = store
        self.embedder = embedder
        self.chunk_tokens = chunk_tokens
        self.reranker = reranker

    # ── Ingest ──

    def ingest(self, document: Document) -> IngestResult:
        normalised = normalize_text(document.text)
        sha = sha256_hex(normalised)
        if self.store.has_version(document.collection, sha):
            return IngestResult("DUPLICATE", None, 0, [])
        _, chunks = chunk_document(normalised, document.fmt, target_tokens=self.chunk_tokens)  # type: ignore[arg-type]
        warnings = sorted({*flags_for(normalised), *(w for c in chunks for w in c.warnings)})
        # A flagged document waits for staff review and is never retrievable until then.
        status: Literal["READY", "PENDING_REVIEW"] = "PENDING_REVIEW" if "INJECTION_PATTERN" in warnings else "READY"
        vectors = self.embedder.embed_documents([c.embedding_text(document.title) for c in chunks])
        version_id = self.store.add_version(
            NewVersion(document, sha, chunks, vectors, self.embedder.revision, warnings, status)
        )
        return IngestResult(status, version_id, len(chunks), warnings)

    # ── Retrieve ──

    def retrieve(self, query: str, allowed: Sequence[str], mode: Mode, *, k: int = 5) -> Retrieval:
        timings: dict[str, float] = {}

        def timed(name: str, start: float) -> None:
            timings[name] = (time.perf_counter() - start) * 1000

        vector_hits: list[tuple[str, float]] = []
        text_hits: list[tuple[str, float]] = []
        if mode != "text":
            t = time.perf_counter()
            qvec = self.embedder.embed_query(query)
            timed("embed", t)
            t = time.perf_counter()
            vector_hits = self.store.vector_search(qvec, allowed, CANDIDATES)
            timed("vector_sql", t)
        if mode != "vector":
            t = time.perf_counter()
            text_hits = self.store.text_search(query, allowed, CANDIDATES)
            timed("text_sql", t)

        if mode == "vector":
            return Retrieval([i for i, _ in vector_hits[:k]], vector_hits[0][1] if vector_hits else None, timings)
        if mode == "text":
            return Retrieval([i for i, _ in text_hits[:k]], text_hits[0][1] if text_hits else None, timings)

        fused = [i for i, _ in reciprocal_rank_fusion([[i for i, _ in vector_hits], [i for i, _ in text_hits]])]
        top_cosine = vector_hits[0][1] if vector_hits else None
        if mode == "hybrid" or not fused:
            return Retrieval(fused[:k], top_cosine, timings)

        if self.reranker is None:
            raise ValueError("hybrid_rerank needs a reranker.")
        candidates = fused[:CANDIDATES]
        chunks = self.store.get(candidates)
        t = time.perf_counter()
        scores = self.reranker.scores(query, [chunks[i].text for i in candidates])
        timed("rerank", t)
        ranked = sorted(zip(candidates, scores), key=lambda p: -p[1])
        return Retrieval([i for i, _ in ranked[:k]], ranked[0][1], timings)

    # ── Answer (fixture provider) ──

    def answer(self, query: str, allowed: Sequence[str], mode: Mode, threshold: float) -> Answer:
        """The PoC's `fixture` provider (RAG_POC.md §2): extractive, no model.
        It proves the pipeline (abstention, citation validation), not answer
        quality."""
        retrieval = self.retrieve(query, allowed, mode)
        if retrieval.signal is None or retrieval.signal < threshold or not retrieval.hits:
            return Answer(ABSTAIN, [], True)
        chunks = self.store.get(retrieval.hits)
        # What a model would be shown; built here so the code path is exercised.
        build_context([ContextChunk(c.id, c.title, c.text) for c in chunks.values()])
        top: StoredChunk = chunks[retrieval.hits[0]]
        first = _SENTENCE.split(top.text.strip(), maxsplit=1)[0][:300]
        raw = {"answer": first, "citations": [{"chunkId": top.id, "quote": first}]}
        check = validate_citations(raw["citations"], {c.id: c.text for c in chunks.values()})
        return Answer(raw["answer"], check.valid, False, check)
