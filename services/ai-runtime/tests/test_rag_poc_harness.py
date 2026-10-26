"""The RAG PoC harness (eval/rag_poc/) end to end, with the in-memory store and
the hash embedder: no model, no database, no download. It proves the hard-fail
checks of RAG_POC.md §4 (permissions, deletion, re-index, duplicates, forged
citations) are wired; retrieval quality is measured by the real run in CI."""

from __future__ import annotations

import json

import pytest

from eval.rag_poc.embedders import HashEmbedder
from eval.rag_poc.evaluate import Config, calibrate, load_questions, run, summary_markdown
from eval.rag_poc.pipeline import Pipeline
from eval.rag_poc.sources import RESTRICTED_COLLECTION, ROLE_COLLECTIONS, Document, owned_documents
from eval.rag_poc.stores import MemoryStore, PgStore

BOOK = Document(
    "book:chess-fundamentals",
    "poc_public_book",
    "Chess Fundamentals",
    "text",
    "CHAPTER I\n\n5. RELATIVE VALUE OF THE PIECES\n\nTwo Rooks are slightly stronger than a Queen. "
    "It is well known that two Bishops are almost always better than two Knights.\n\n"
    "13. THE OPPOSITION\n\nThe player obtaining that advantage is said to have the opposition.",
    "test",
    "test",
)


@pytest.fixture(scope="module")
def documents() -> list[Document]:
    return [BOOK, *owned_documents()]


@pytest.fixture(scope="module")
def report(documents: list[Document]) -> dict:
    keys = {d.key for d in documents}
    questions = [q for q in load_questions() if all(g["doc"] in keys for g in q["gold"])]
    return run(
        Config("hash", 250, modes=("vector", "text", "hybrid")),
        MemoryStore(),
        HashEmbedder(),
        documents,
        questions=questions,
        log=lambda _: None,
    )


def test_question_file_is_well_formed() -> None:
    questions = load_questions()
    kinds = [q["kind"] for q in questions]
    assert (kinds.count("answerable"), kinds.count("unanswerable"), kinds.count("permission"), kinds.count("injection")) == (
        40,
        10,
        10,
        5,
    )
    assert len({q["id"] for q in questions}) == len(questions)
    held_out = [q for q in questions if q["split"] == "holdout"]
    assert len(held_out) == 10


def test_permission_probes_never_leak(report: dict) -> None:
    for mode in report["modes"].values():
        assert mode["permission"]["restrictedChunksReturned"] == 0
        assert mode["permission"]["staffControlRecallAt5"] > 0  # the probes can find their target


def test_deletion_reindex_and_duplicates(report: dict) -> None:
    assert report["deletion"]["pass"], report["deletion"]
    assert report["reindex"]["pass"], report["reindex"]
    assert report["duplicateUpload"]["pass"]


def test_injection_documents_are_held_for_review(report: dict) -> None:
    for mode in report["modes"].values():
        assert mode["injection"]["flagged"] >= 4
        assert mode["injection"]["pendingReviewChunksReturned"] == 0
    assert sum(k.startswith("injection:") for k in report["ingest"]["pendingReview"]) >= 4


def test_forged_citations_are_dropped(report: dict) -> None:
    assert report["citations"]["forgedCitationsKept"] == 0
    assert report["citations"]["droppedFixtureCitations"] == 0


def test_summary_renders(report: dict) -> None:
    table = summary_markdown([report])
    assert "| hash-250 | hybrid |" in table
    json.dumps(report)  # serialisable


def test_student_retrieval_filters_inside_the_search(documents: list[Document]) -> None:
    store = MemoryStore()
    store.reset(256, "hash")
    pipeline = Pipeline(store, HashEmbedder(), chunk_tokens=250)
    for doc in documents:
        pipeline.ingest(doc)
    # The question names the restricted marker verbatim: the best possible match.
    for mode in ("vector", "text", "hybrid"):
        hits = pipeline.retrieve("ZEBRA-QUARTZ-41 payout reference code", ROLE_COLLECTIONS["student"], mode, k=30).hits
        assert all(c.collection != RESTRICTED_COLLECTION for c in store.get(hits).values())
        staff = pipeline.retrieve("ZEBRA-QUARTZ-41 payout reference code", ROLE_COLLECTIONS["staff"], mode, k=5).hits
        assert any(c.collection == RESTRICTED_COLLECTION for c in store.get(staff).values())


def test_calibrate_prefers_the_split_with_most_correct_decisions() -> None:
    threshold = calibrate([0.8, 0.7, 0.9], [0.2, 0.3, None])
    assert 0.3 < threshold < 0.7
    assert calibrate([], []) == float("inf")


def test_pg_store_refuses_a_non_poc_database() -> None:
    with pytest.raises(ValueError, match="_poc"):
        PgStore("postgresql://u:p@127.0.0.1:5432/vps_dev")
