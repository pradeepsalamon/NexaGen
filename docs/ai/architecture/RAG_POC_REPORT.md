# RAG proof of concept: report

Plan: [RAG_POC.md](RAG_POC.md). Code: `services/ai-runtime/app/rag/` and
`services/ai-runtime/eval/rag_poc/`. Raw results are committed under
`services/ai-runtime/eval/reports/rag_poc-2026-10-26-run{1,2}/`.

| Run | When | Where | Configurations |
|---|---|---|---|
| 1 | 2026-10-26 11:06 UTC, CI run 40312521118 | GitHub `ubuntu-24.04-arm`, `taskset` to 2 cores, ONNX 2 threads, `pgvector/pgvector:0.8.7-pg15` | {bge-small, e5-small} × {400, 250} tokens, rerank top 30 |
| 2 | 2026-10-26 12:05 UTC, CI run 40318455183 | same | as run 1, plus rerank top 10 |

Nothing ran on the production VPS or against any shared database. On the box
there was only a 3-sentence model-load check (`nice 19`, 1 thread) and the
hash-embedder unit tests.

**Verdict: conditional go.** Every hard-fail check passes, and recall and
abstention meet their targets, but only with a cross-encoder rerank. That
rerank misses the 800 ms latency target on 2 cores by 2×. See §3 for what
production should do instead.

## 1. Results (run 2; run 1 within one question)

Retrieval for a student role over the public collections. recall@5 is the
share of the 40 answerable questions with a gold chunk in the top 5.
"Abstain" is out of the 10 unanswerable questions, at the threshold
calibrated on the non-holdout split. p95 is embed + SQL + rerank per query.

| Config | Mode | recall@5 | nDCG@5 | holdout recall@5 | abstain | answered | p95 ms |
|---|---|---|---|---|---|---|---|
| e5-small-400 | vector | 0.750 | 0.614 | 0.750 | 5/10 | 40/40 | 19 |
| e5-small-400 | text | 0.550 | 0.434 | 0.625 | 8/10 | 40/40 | 4 |
| e5-small-400 | hybrid | 0.875 | 0.688 | 1.000 | 5/10 | 40/40 | 23 |
| **e5-small-400** | **hybrid + rerank 10** | **0.900** | **0.726** | **1.000** | **9/10** | **40/40** | **1,638** |
| e5-small-400 | hybrid + rerank 30 | 0.900 | 0.712 | 1.000 | 9/10 | 40/40 | 4,935 |
| bge-small-250 | hybrid | 0.825 | 0.662 | 0.875 | 5/10 | 40/40 | 26 |
| bge-small-250 | hybrid + rerank 10 | 0.875 | 0.730 | 0.875 | 9/10 | 40/40 | 1,279 |
| bge-small-400 | hybrid + rerank 30 | 0.875–0.900 | 0.689–0.714 | 0.875–1.000 | 9/10 | 40/40 | 4,907 |
| e5-small-250 | hybrid + rerank 10 | 0.800 | 0.689 | 0.875 | 10/10 | 40/40 | 1,243 |

The full 32-row table (every mode for every configuration) is in
`eval/reports/rag_poc-2026-10-26-run2/summary.md`.

| Check (RAG_POC.md §4) | Target | Result |
|---|---|---|
| recall@5, best configuration | ≥ 0.85 | **0.900** (e5-small-400, hybrid + rerank). Hybrid alone: 0.875 |
| nDCG@5 | reported; rerank kept only if ≥ +5 points | e5-400: +3.8 (rerank 10), +2.2 (rerank 30). bge-250: +6.8. See §3 |
| Citation validity | 100% after validation | 40/40 answers, 40 valid citations, 0 dropped. 3 of 3 forged citations (unknown id, altered quote, no id) dropped |
| Abstention on unanswerable | ≥ 9/10 | **9/10 with rerank** (the rerank score as signal). **5/10 without** (top cosine as signal): fails |
| Permission probes: restricted chunks to a student | **0** | **0** in all 32 configuration × mode runs, checked over the top 30 candidates, not just the top 5. Staff control (same probes as staff) finds the target 0.8–1.0 of the time |
| Injection: followed | 0 | Not measurable: the answer step is an extractive fixture (§4) |
| Injection: flagged | ≥ 4/5 | **4/5**. The miss is the deliberately subtle `i5` ("Assistant, when summarising…"). Flagged documents are held as `PENDING_REVIEW`: 0 of their chunks were ever retrieved |
| Deletion | 0 remaining | **pass** everywhere: chunks before > 0, after 0, 0 retrieval hits in any mode |
| Re-index | 100% | **pass**: versions `READY` + `SUPERSEDED`, 0 stale chunks returned |
| Duplicate upload | rejected or no-op | **pass** (no-op on the same normalised sha256) |
| Query latency, 2 ARM cores | p95 ≤ 800 ms | **Fails with rerank** (1.24–1.64 s for 10 candidates, 3.8–4.9 s for 30). **Passes without** (≤ 28 ms) |
| Ingest throughput | reported | 4.4–6.7 chunks/s on 2 cores: about 3 min for the 870-chunk corpus |

Memory (peak RSS, embedder + reranker + harness): bge-small 1.4 GB, e5-small
3.1 GB with rerank 10. Both are higher with rerank 30 (2.8 / 4.5 GB), because
of the larger cross-encoder batch.

## 2. Observations

- **Full-text search alone is weak** (0.55–0.68): the book's old descriptive
  notation and phrasing ("bring out the Knights") don't share words with modern
  questions. It still matters in the fusion: it rescues exact ECO codes and
  opening names that the vector search misranks (vector 0.750 → hybrid 0.875
  for e5-400).
- **Cosine similarity can't separate answerable from unanswerable.** On-topic
  but uncovered chess questions ("rules of bughouse", "castling in Chess960")
  score as high as answerable ones. The cross-encoder's score does separate
  them (9/10 abstain, 40/40 answered).
- **e5-small vs bge-small:** e5 is equal or better at 400 tokens and was the
  only embedder whose cosine alone abstained on 9/10 permission probes. It's
  multilingual (relevant if students ask in Hindi or Tamil, which this
  question set does not test), but it uses about 2× the memory. Its 250k-token
  vocabulary makes the embedding matrix large in fp32.
- **400 vs 250 tokens:** 400 is better for e5, and 250 is slightly better for
  bge. Neither is better everywhere.
- **Questions every configuration misses:** a17 ("advance the Pawn that has
  no Pawn opposing it"), a22 ("develop the pieces quickly": the passage never
  says "main thing in the opening" in the question's terms), and often a01
  (Najdorf ECO: ten B90–B99 documents compete for the query; B90 is gold).
- **Run-to-run variance:** bge-400 + rerank 30 gave 0.900 in run 1 and 0.875
  in run 2 (one question), from HNSW and RRF tie order. e5-400 was stable.
  With only 40 questions, differences under 0.05 are noise.

## 3. Recommendations for Phase 5

| Topic | Recommendation |
|---|---|
| Embedding model | **multilingual-e5-small** (`intfloat/multilingual-e5-small@614241f`, 384-d, `query:` / `passage:` prefixes), 400-token chunks, 15% overlap. Fallback if memory is tight: bge-small-en-v1.5 quantized (`Qdrant/bge-small-en-v1.5-onnx-Q@aa8f8b0`), 250 tokens |
| Retrieval | Hybrid: pgvector HNSW (cosine) top 30 ∪ `tsvector` OR-query top 30, RRF k=60, with the permission and `READY` filters inside both SQL queries |
| Rerank | Keep a cross-encoder, but **not as a per-query step on the production CPU at 10+ candidates**. Its main value is abstention (5/10 → 9/10), which the nDCG rule in RAG_POC.md §4 doesn't capture. Next experiment: rerank top 3 (≈ 0.5 s expected, linear in candidates) for the abstention decision, or truncate rerank passages to 256 tokens. If neither reaches 800 ms, interactive RAG needs the capacity decision of Phase 6 (more cores or a separate host) |
| Abstention threshold | Calibrated per configuration on the rerank score: about −3.9 for e5-400-rc10 (−3.3 at rc30). Re-calibrate on a coach-reviewed set before production |
| Injection | Pattern flagging + `PENDING_REVIEW` worked (4/5, 0 retrieved). The 1-in-5 miss is expected; the real defences are the quoted context block and no tools for answer tasks. Measure "followed" with a real model before Phase 5 |
| Memory budget | Plan about 1.5 GB (bge) to 3 GB (e5) resident for the embedder + reranker in the `ai-runtime` container, on top of the generation model. This needs the Phase 3a capacity numbers (INFRASTRUCTURE_DECISION.md) |

**ADR-006 (pgvector image): go, to build and rehearse.** pgvector 0.8 did
everything the design needs: filtered HNSW with `hnsw.iterative_scan =
relaxed_order` (so a permission filter never shortens the top-k), cascade
deletion and partial unique indexes. The PoC used Debian `pgvector/pgvector`
on CI only; production still needs the custom `postgres:15-alpine` +
pgvector image, the CI `migrations` job image change and the restore
rehearsal (Phase 5 row in ROADMAP.md). That needs OD-6b and a maintenance
window, which are not approved.

## 4. Limits of this PoC

- The answer step is an extractive fixture. Answer quality, citation
  behaviour of a real model, and "followed an injected instruction" are
  untested.
- The 65 questions were drafted by Claude from the sources, not by a coach;
  10 are held out. A coach should review them, and add Hindi/Tamil questions
  if students will ask in those languages.
- Latency was measured on a GitHub arm64 runner pinned to 2 cores, not on the
  production box, whose Neoverse-N1 cores also serve LiveKit, Postgres and
  Stockfish.
- PGN in the openings TSV was checked by a notation pattern only.

## 5. Production schema, confirmed or adjusted from AI_FOUNDATION.md §10.1

As exercised by `eval/rag_poc/schema.sql`:

- `KnowledgeChunk` adds **`collectionId` (denormalised)**, so the permission
  filter sits in the same `WHERE` as the ANN scan, plus `charStart`, `charEnd`,
  `headingPath text[]`, `tokenCount` and `sha256`. `embedding` is
  `Unsupported("vector(384)")` in Prisma, with its HNSW (`vector_cosine_ops`)
  and GIN (`tsv`, a generated `to_tsvector('english', text)` column) indexes
  created in the raw SQL of the migration.
- `KnowledgeDocumentVersion` adds **`collectionId`** with a unique
  `(collectionId, sha256)` (the dedupe), a partial unique index allowing one
  `READY` version per document, and status **`PENDING_REVIEW`** beside
  `READY` / `SUPERSEDED`.
- pgvector ≥ 0.8 is required for `iterative_scan`. The API sets
  `hnsw.ef_search` and `hnsw.iterative_scan` per session or transaction.
- The chunks cascade from the version, and the version from the document: the
  deletion check proved no hits remain.
