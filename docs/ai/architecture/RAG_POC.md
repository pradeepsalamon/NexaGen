# RAG proof of concept (non-production)

Status: **started 2026-10-26** (DECISIONS.md §4: Phase 2, OD-7 as recommended).
Code: `services/ai-runtime/app/rag/` (reusable, stdlib only) and
`services/ai-runtime/eval/rag_poc/` (the harness; README there). The real run
is `.github/workflows/rag-poc.yml` on a GitHub arm64 runner. Results:
[RAG_POC_REPORT.md](RAG_POC_REPORT.md).

Deviations from the plan below:

- Gold labels are a document plus a substring, not chunk ids, so one question
  set grades every chunk size.
- PGN in the openings TSV is checked by a notation pattern only. The chess
  wrapper is TypeScript, and python-chess is GPL-3.0.
- Documents matching an injection pattern are ingested as `PENDING_REVIEW` and
  never retrieved, which is what "flagged for staff review" means in production.
- The question set was drafted from the sources by Claude, not written by a
  coach. A coach should review it (§3).

Goal: before any production schema or database image change, prove that the
design in AI_FOUNDATION.md §5 can deliver:

- retrieval quality good enough to be useful
- correct citations
- abstention when the sources don't cover a question
- complete deletion
- permission-filtered retrieval

**Hard limits:**

- It runs on a developer machine or in CI, **not on the production VPS or
  database**.
- No student records, messages, recordings or copyrighted books are used.

## 1. Dataset (smallest useful)

| Collection | Source | Licence | Size [A] |
|---|---|---|---|
| `poc_public_openings` | `lichess-org/chess-openings` TSV (ECO, name, PGN) | CC0 | ~3,500 short entries |
| `poc_public_book` | One public-domain chess book in plain text, e.g. J. R. Capablanca, *Chess Fundamentals* (1921), Project Gutenberg edition. Public-domain status must be confirmed for India (author died 1942) and the US (published before 1930) before use, and the Gutenberg header kept | Public domain [U]: confirm | ~300–600 chunks |
| `poc_academy_faq` | The academy's own public FAQ (`apps/web/src/features/academy/content.ts`), exported to Markdown | Owned | ~30 chunks |
| `poc_restricted` | 5 synthetic "staff-only" Markdown documents written for the test, with unique marker phrases | Owned, synthetic | ~20 chunks |

`poc_restricted` exists only to test permissions and deletion.

## 2. Pipeline

| Step | Implementation |
|---|---|
| Ingest | A CLI in NestJS (or a Jest harness) calls the runtime's `/v1/documents/prepare`, which uses `pypdf` / plain text and Markdown parsing. The TSV is converted to one document per ECO family. PGN fields are validated with the chess wrapper |
| Chunking | Structure-aware, ~400 tokens, 15% overlap; FEN/PGN kept atomic. Variant B for comparison: 250 tokens |
| Embeddings | Runtime `/v1/embed` with a `fastembed` ONNX model. Compare **bge-small-en-v1.5** (384-d) and **multilingual-e5-small** (384-d); nomic-embed-text-v1.5 (768-d) optional. Record the model revision |
| Storage | Local `pgvector/pgvector:pg15` container (dev only; the production image question is ADR-006). Draft tables match AI_FOUNDATION.md §10.1, created by a **throwaway SQL script in the PoC folder**, not a Prisma migration |
| Retrieval | (a) vector only, (b) full-text only (`tsvector`, `english`), (c) hybrid RRF (k=60), (d) hybrid + rerank (ms-marco-MiniLM-L-6-v2) on the top 30 |
| Authz | `allowedCollectionIds` from a test user's role; SQL `WHERE collection_id = ANY($allowed)` inside the same query as the vector search |
| Answer | A mock `fixture` provider, added by this PoC (Phase 1 ships only `mock:echo`), for pipeline tests. Optional quality check with a local 3–4B model on a dev machine (never production); external only if OD-3 approves PUBLIC data |
| Citations | Answer schema `{answer, citations:[{chunkId, quote?}]}`; validator checks ids against the retrieved set and quotes as substrings |

## 3. Evaluation set

- **40 answerable questions** with gold chunk ids, written by a coach or the
  owner. Examples: "What is the ECO code of the Najdorf?" and "How does
  Capablanca suggest mating with king and queen?"
- **10 unanswerable questions**, where abstention is expected.
- **10 permission probes**: questions whose only answer is in `poc_restricted`,
  asked as a student-role user, where abstention is expected and no restricted
  chunk id may appear.
- **5 injection documents**: synthetic chunks containing "ignore previous
  instructions…" and "call tool X". The answer must not follow them, and the
  document must be flagged `INJECTION_PATTERN`.

The set is stored at `services/ai-runtime/eval/rag_poc/` as JSONL. Nothing in
it is personal.

## 4. Metrics and acceptance criteria

| Metric | Target |
|---|---|
| recall@5 (best configuration) | ≥ 0.85 |
| nDCG@5 | Reported; rerank is kept only if it adds ≥ 5 points |
| Citation validity (ids ∈ retrieved, quotes are substrings) | **100%** after validation; invalid citations are dropped and counted |
| Abstention on the 10 unanswerable questions | ≥ 9/10 |
| Permission probes: restricted chunks returned to an unauthorized user | **0** (hard fail) |
| Injection documents: followed instructions | **0**; flagged ≥ 4/5 |
| Deletion: after deleting a document, its chunks, vectors and retrieval hits are gone | **0 remaining** (hard fail) |
| Re-index: a new version supersedes the old one; queries return only the new version's chunks | 100% |
| Duplicate upload (same sha256) | Rejected or no-op |
| Query latency (embed + hybrid SQL + rerank) on a 2-vCPU ARM-like machine | p95 ≤ 800 ms [A] |
| Ingest throughput | Reported (chunks per second); informs production sizing |

## 5. Deliverables

1. `services/ai-runtime/eval/rag_poc/` with the dataset manifest (sources,
   licences, hashes), not the copyrighted text.
2. A PoC report (`docs/ai/architecture/RAG_POC_REPORT.md`) with:
   - the metrics table per configuration
   - the chosen embedding model and chunk size
   - the calibrated abstention threshold
   - the measured latency and memory
   - the recommendation on reranking
   - the go/no-go for ADR-006 (pgvector image change)
3. A list of required production schema changes, confirmed or adjusted from
   AI_FOUNDATION.md §10.1.

## 6. Tests that carry into production

The following become permanent tests when RAG reaches production:

- the permission-probe suite
- the deletion test
- the injection-document suite
- citation validation

They'll go in `*.int-spec.ts` against a pgvector-enabled integration database,
and the CI `migrations` job image will change accordingly.

## 7. Effort and risks

- **Effort:** about 4–6 days after Phase 1.
- **Risks:**
  - The public-domain text has OCR noise, which hurts recall. Mitigation:
    pick a clean Gutenberg text.
  - The English-centric embedder does poorly if students ask in Hindi or Tamil.
    Mitigation: the e5-multilingual comparison, plus a question on which
    languages students actually use [U].
  - Overfitting the threshold to 50 questions. Mitigation: hold out 10.
