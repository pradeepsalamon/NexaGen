"""The PoC evaluation (RAG_POC.md §3-4): one configuration in, one report out."""

from __future__ import annotations

import json
import math
import resource
import statistics
import time
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.rag.chunking import chunk_document
from app.rag.citations import validate_citations
from app.rag.text import collapse_whitespace, normalize_text

from .embedders import Embedder, Reranker
from .pipeline import ABSTAIN, MODES, Mode, Pipeline
from .sources import RESTRICTED_COLLECTION, ROLE_COLLECTIONS, Document
from .stores import Store, StoredChunk

QUESTIONS = Path(__file__).resolve().parent / "questions.jsonl"
K = 5
DELETE_PROBE = ("restricted:r1-coach-payout", "ZEBRA-QUARTZ-41 coach payout reference code")
REINDEX_DOC = "faq:academy"
REINDEX_MARKER = "REINDEXMARKERV2"


@dataclass(frozen=True)
class Config:
    embedder: str
    chunk_tokens: int
    modes: tuple[Mode, ...] = MODES

    @property
    def name(self) -> str:
        return f"{self.embedder}-{self.chunk_tokens}"


def load_questions(path: Path = QUESTIONS) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]


def _is_relevant(chunk: StoredChunk, gold: Sequence[dict[str, str]]) -> bool:
    for g in gold:
        if chunk.document_key != g["doc"]:
            continue
        if "contains" not in g or collapse_whitespace(g["contains"]) in collapse_whitespace(chunk.text):
            return True
    return False


def _ideal_relevant(gold: Sequence[dict[str, str]], chunk_texts: dict[str, list[str]]) -> int:
    total = 0
    for g in gold:
        for text in chunk_texts.get(g["doc"], []):
            if "contains" not in g or collapse_whitespace(g["contains"]) in collapse_whitespace(text):
                total += 1
    return total


def _ndcg(rels: Sequence[bool], ideal: int) -> float:
    dcg = sum(1 / math.log2(i + 2) for i, rel in enumerate(rels) if rel)
    idcg = sum(1 / math.log2(i + 2) for i in range(min(ideal, len(rels))))
    return dcg / idcg if idcg else 0.0


def _signal(value: float | None) -> float:
    return -math.inf if value is None else value


def calibrate(answerable: Sequence[float | None], unanswerable: Sequence[float | None]) -> float:
    """The threshold that maximises correct answer/abstain decisions; midpoint
    between neighbouring signals, lowest best one on a tie (prefer answering)."""
    values = sorted({_signal(v) for v in (*answerable, *unanswerable) if v is not None})
    if not values:
        return math.inf
    candidates = [values[0] - 1e-6] + [(a + b) / 2 for a, b in zip(values, values[1:])] + [values[-1] + 1e-6]
    best, best_score = candidates[0], -1
    for t in candidates:
        score = sum(_signal(v) >= t for v in answerable) + sum(_signal(v) < t for v in unanswerable)
        if score > best_score:
            best, best_score = t, score
    return best


def _pct(values: Sequence[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(q * len(ordered)) - 1))]


def run(
    config: Config,
    store: Store,
    embedder: Embedder,
    documents: Sequence[Document],
    *,
    reranker: Reranker | None = None,
    questions: Sequence[dict[str, Any]] | None = None,
    log: Callable[[str], None] = print,
) -> dict[str, Any]:
    questions = list(questions if questions is not None else load_questions())
    modes = tuple(m for m in config.modes if m != "hybrid_rerank" or reranker is not None)
    pipeline = Pipeline(store, embedder, chunk_tokens=config.chunk_tokens, reranker=reranker)
    report: dict[str, Any] = {
        "config": config.name,
        "embedder": embedder.name,
        "embeddingRevision": embedder.revision,
        "dim": embedder.dim,
        "chunkTokens": config.chunk_tokens,
        "reranker": getattr(reranker, "name", None),
    }

    # ── Ingest ──
    store.reset(embedder.dim, embedder.revision)
    started = time.perf_counter()
    statuses: dict[str, str] = {}
    flagged: list[str] = []
    chunk_texts: dict[str, list[str]] = {}
    total_chunks = 0
    for doc in documents:
        result = pipeline.ingest(doc)
        statuses[doc.key] = result.status
        total_chunks += result.chunks
        if "INJECTION_PATTERN" in result.warnings:
            flagged.append(doc.key)
        chunk_texts[doc.key] = [
            c.text for c in chunk_document(normalize_text(doc.text), doc.fmt, target_tokens=config.chunk_tokens)[1]  # type: ignore[arg-type]
        ]
    ingest_s = time.perf_counter() - started
    report["ingest"] = {
        "documents": len(documents),
        "chunks": total_chunks,
        "seconds": round(ingest_s, 2),
        "chunksPerSecond": round(total_chunks / ingest_s, 1) if ingest_s else None,
        "pendingReview": sorted(k for k, s in statuses.items() if s == "PENDING_REVIEW"),
    }
    log(f"[{config.name}] ingested {len(documents)} docs / {total_chunks} chunks in {ingest_s:.1f}s")

    # Duplicate upload of an unchanged document: a no-op.
    book = next((d for d in documents if d.key.startswith("book:")), documents[0])
    duplicate = pipeline.ingest(book).status
    report["duplicateUpload"] = {"status": duplicate, "pass": duplicate == "DUPLICATE"}

    by_kind = {kind: [q for q in questions if q["kind"] == kind] for kind in ("answerable", "unanswerable", "permission", "injection")}
    student = ROLE_COLLECTIONS["student"]
    staff = ROLE_COLLECTIONS["staff"]
    report["modes"] = {}

    for mode in modes:
        per_q: dict[str, dict[str, Any]] = {}
        latencies: list[float] = []
        for q in (*by_kind["answerable"], *by_kind["unanswerable"]):
            retrieval = pipeline.retrieve(q["question"], student, mode, k=K)
            latencies.append(sum(retrieval.timings_ms.values()))
            chunks = store.get(retrieval.hits)
            rels = [_is_relevant(chunks[i], q["gold"]) for i in retrieval.hits if i in chunks]
            per_q[q["id"]] = {
                "signal": retrieval.signal,
                "hit": any(rels),
                "ndcg": _ndcg(rels, _ideal_relevant(q["gold"], chunk_texts)) if q["gold"] else None,
                "split": q["split"],
                "kind": q["kind"],
            }
        answerable = [per_q[q["id"]] for q in by_kind["answerable"]]
        unanswerable = [per_q[q["id"]] for q in by_kind["unanswerable"]]
        cal = [r for r in (*answerable, *unanswerable) if r["split"] == "calibration"]
        threshold = calibrate(
            [r["signal"] for r in cal if r["kind"] == "answerable"], [r["signal"] for r in cal if r["kind"] == "unanswerable"]
        )

        def decisions(rows: Sequence[dict[str, Any]]) -> dict[str, Any]:
            a = [r for r in rows if r["kind"] == "answerable"]
            u = [r for r in rows if r["kind"] == "unanswerable"]
            return {
                "answerableAnswered": sum(_signal(r["signal"]) >= threshold for r in a),
                "answerable": len(a),
                "unanswerableAbstained": sum(_signal(r["signal"]) < threshold for r in u),
                "unanswerable": len(u),
            }

        # Permission probes: a student must never get a restricted chunk, not
        # even among the rerank candidates.
        leaked: list[str] = []
        probe_abstained = 0
        staff_hits = 0
        for q in by_kind["permission"]:
            retrieval = pipeline.retrieve(q["question"], student, mode, k=30)
            for chunk in store.get(retrieval.hits).values():
                if chunk.collection == RESTRICTED_COLLECTION:
                    leaked.append(f"{q['id']}:{chunk.id}")
            if _signal(retrieval.signal) < threshold:
                probe_abstained += 1
            control = pipeline.retrieve(q["question"], staff, mode, k=K)
            staff_hits += any(_is_relevant(c, q["gold"]) for c in store.get(control.hits).values())

        # Injection probes: flagged documents are PENDING_REVIEW, so never retrieved.
        pending = set(report["ingest"]["pendingReview"])
        pending_returned = 0
        payload_in_answer = 0
        for q in by_kind["injection"]:
            retrieval = pipeline.retrieve(q["question"], student, mode, k=30)
            pending_returned += sum(c.document_key in pending for c in store.get(retrieval.hits).values())
            answer = pipeline.answer(q["question"], student, mode, threshold)
            payload_in_answer += q["payload"] in answer.answer

        report["modes"][mode] = {
            "recallAt5": round(statistics.mean(r["hit"] for r in answerable), 3),
            "ndcgAt5": round(statistics.mean(r["ndcg"] for r in answerable), 3),
            "recallAt5Holdout": round(statistics.mean(r["hit"] for r in answerable if r["split"] == "holdout"), 3),
            "threshold": threshold,
            "abstention": decisions([*answerable, *unanswerable]),
            "abstentionHoldout": decisions([r for r in (*answerable, *unanswerable) if r["split"] == "holdout"]),
            "permission": {
                "restrictedChunksReturned": len(leaked),
                "leaks": leaked[:10],
                "studentAbstained": probe_abstained,
                "probes": len(by_kind["permission"]),
                "staffControlRecallAt5": round(staff_hits / max(1, len(by_kind["permission"])), 3),
            },
            "injection": {
                "flagged": len(flagged),
                "documents": len(by_kind["injection"]),
                "pendingReviewChunksReturned": pending_returned,
                # Extractive fixture: a payload here is quoted text from the one
                # unflagged probe document, not an instruction being followed.
                # "Followed" needs a real model (RAG_POC.md §2, Answer).
                "payloadQuotedInFixtureAnswer": payload_in_answer,
            },
            "latencyMs": {"p50": round(_pct(latencies, 0.5), 1), "p95": round(_pct(latencies, 0.95), 1)},
            "misses": sorted(i for i, r in per_q.items() if r["kind"] == "answerable" and not r["hit"]),
        }
        log(f"[{config.name}] {mode}: {json.dumps({k: report['modes'][mode][k] for k in ('recallAt5', 'ndcgAt5')})}")

    # ── Citations (best recall mode) ──
    best = max(modes, key=lambda m: (report["modes"][m]["recallAt5"], report["modes"][m]["ndcgAt5"]))
    report["bestMode"] = best
    valid = dropped = answered = 0
    for q in by_kind["answerable"]:
        answer = pipeline.answer(q["question"], student, best, report["modes"][best]["threshold"])
        if answer.abstained:
            continue
        answered += 1
        valid += len(answer.citations)
        dropped += answer.check.dropped if answer.check else 0
    sample = pipeline.retrieve(by_kind["answerable"][0]["question"], student, best)
    shown = {c.id: c.text for c in store.get(sample.hits).values()}
    forged = validate_citations(
        [
            {"chunkId": "not-a-retrieved-chunk", "quote": "anything"},
            {"chunkId": next(iter(shown), "x"), "quote": "a sentence this chunk never contained"},
            {"quote": "no id"},
        ],
        shown,
    )
    report["citations"] = {
        "answered": answered,
        "validCitations": valid,
        "droppedFixtureCitations": dropped,
        "forgedCitationsDropped": forged.dropped,
        "forgedCitationsKept": len(forged.valid),
    }

    # ── Deletion ──
    doc_key, probe = DELETE_PROBE
    before = store.count_chunks(doc_key)
    store.delete_document(doc_key)
    after = store.count_chunks(doc_key)
    hits_after = 0
    for mode in modes:
        retrieval = pipeline.retrieve(probe, staff, mode, k=30)
        hits_after += sum(c.document_key == doc_key for c in store.get(retrieval.hits).values())
    report["deletion"] = {
        "document": doc_key,
        "chunksBefore": before,
        "chunksAfter": after,
        "retrievalHitsAfter": hits_after,
        "pass": before > 0 and after == 0 and hits_after == 0,
    }

    # ── Re-index ──
    old = next(d for d in documents if d.key == REINDEX_DOC)
    new = Document(
        old.key,
        old.collection,
        old.title,
        old.fmt,
        old.text + f"\n\n## Rescheduling\n\nA missed class can be rescheduled once a month ({REINDEX_MARKER}).\n",
        old.source,
        old.licence,
    )
    result = pipeline.ingest(new)
    faq_hits: set[str] = set()
    for mode in modes:
        for query in (f"{REINDEX_MARKER} rescheduling", "How long is each chess class?"):
            retrieval = pipeline.retrieve(query, student, mode, k=30)
            faq_hits |= {c.id for c in store.get(retrieval.hits).values() if c.document_key == REINDEX_DOC}
    stale = sorted(i for i in faq_hits if not i.startswith(f"{result.version_id}:"))
    statuses_after = store.version_statuses(REINDEX_DOC)
    report["reindex"] = {
        "versionStatuses": statuses_after,
        "staleChunksReturned": len(stale),
        "chunksForDocument": store.count_chunks(REINDEX_DOC),
        "newVersionChunks": result.chunks,
        "pass": statuses_after == ["READY", "SUPERSEDED"] and not stale and store.count_chunks(REINDEX_DOC) == result.chunks,
    }

    report["maxRssMb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    report["abstainToken"] = ABSTAIN
    return report


def summary_markdown(reports: Sequence[dict[str, Any]]) -> str:
    lines = [
        "| Config | Mode | recall@5 | nDCG@5 | holdout recall@5 | abstain (unans.) | answered (ans.) | holdout abstain/answer | leaks | p50 / p95 ms |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in reports:
        for mode, m in r["modes"].items():
            a, h = m["abstention"], m["abstentionHoldout"]
            lines.append(
                f"| {r['config']} | {mode} | {m['recallAt5']:.3f} | {m['ndcgAt5']:.3f} | {m['recallAt5Holdout']:.3f} "
                f"| {a['unanswerableAbstained']}/{a['unanswerable']} | {a['answerableAnswered']}/{a['answerable']} "
                f"| {h['unanswerableAbstained']}/{h['unanswerable']} · {h['answerableAnswered']}/{h['answerable']} "
                f"| {m['permission']['restrictedChunksReturned']} | {m['latencyMs']['p50']} / {m['latencyMs']['p95']} |"
            )
    lines.append("")
    lines.append("| Config | chunks | ingest chunks/s | duplicate | deletion | re-index | injection flagged | forged citations kept | max RSS MB |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for r in reports:
        inj = next(iter(r["modes"].values()))["injection"]
        lines.append(
            f"| {r['config']} | {r['ingest']['chunks']} | {r['ingest']['chunksPerSecond']} "
            f"| {'pass' if r['duplicateUpload']['pass'] else 'FAIL'} | {'pass' if r['deletion']['pass'] else 'FAIL'} "
            f"| {'pass' if r['reindex']['pass'] else 'FAIL'} | {inj['flagged']}/{inj['documents']} "
            f"| {r['citations']['forgedCitationsKept']} | {r['maxRssMb']} |"
        )
    return "\n".join(lines) + "\n"
