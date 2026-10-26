# RAG proof of concept

Phase 2 of the AI roadmap. Spec: [RAG_POC.md](../../../../docs/ai/architecture/RAG_POC.md).
Results: [RAG_POC_REPORT.md](../../../../docs/ai/architecture/RAG_POC_REPORT.md).

**Never run this on the production VPS or against a shared database.** The
real run is the `RAG proof of concept` workflow (`.github/workflows/rag-poc.yml`):
a GitHub arm64 runner with a throwaway pgvector container. `PgStore` refuses any
database whose name doesn't end in `_poc`, because it drops its schema.

| File | |
|---|---|
| `manifest.json` | Sources, licences and pinned sha256 (OD-7: public domain, CC0, academy-owned) |
| `corpus/` | Owned documents: the academy FAQ export, 5 synthetic staff-only docs, 5 injection probes |
| `questions.jsonl` | 40 answerable (gold = document + a substring), 16 unanswerable, 10 permission probes, 5 injection probes; 16 held out (8 answerable, 8 unanswerable) |
| `sources.py` | Downloads into `.cache/` (gitignored), verifies hashes, builds documents |
| `embedders.py` | `hash` (tests), `bge-small`, `e5-small`, `nomic` via fastembed; the MiniLM cross-encoder |
| `stores.py`, `schema.sql` | pgvector store + an in-memory twin. The permission filter is inside the search |
| `pipeline.py` | Ingest → retrieve (vector / text / hybrid RRF / hybrid + rerank) → extractive fixture answer |
| `evaluate.py` | Metrics and the hard-fail checks of RAG_POC.md §4 |

The reusable pieces (chunking, injection flags, RRF, citation validation, the
quoted context block) are in `app/rag/`, stdlib only, so they can move into
the runtime's endpoints when RAG reaches production (Phase 5).

## Run

```bash
cd services/ai-runtime
uv sync --frozen --group rag-poc

# Plumbing only: no model, no database, ~10 s.
uv run --group rag-poc python -m eval.rag_poc matrix --store memory --embedders hash --chunk-tokens 400 --out /tmp/rag

# The real thing, on a dev machine:
docker run -d --name rag-poc-db -e POSTGRES_USER=poc -e POSTGRES_PASSWORD=poc -e POSTGRES_DB=rag_poc \
  -p 127.0.0.1:55432:5432 pgvector/pgvector:0.8.7-pg15
uv run --group rag-poc python -m eval.rag_poc matrix \
  --store postgresql://poc:poc@127.0.0.1:55432/rag_poc \
  --embedders bge-small,e5-small --chunk-tokens 400,250 --threads 2 --out /tmp/rag
```

Models download into `.cache/models/` (about 600 MB for both embedders and the
reranker).

The academy FAQ is generated: after editing `apps/web/src/features/academy/content.ts`,
run `node scripts/ai/rag-poc/export-academy-faq.mjs` and commit `corpus/academy_faq.md`.

## Limits of this PoC

- The answer step is an extractive fixture, so "followed an injected
  instruction" can't be measured until a real model is allowed (OD-3, or a
  local 3–4B model on a dev machine). Flagged documents are held as
  `PENDING_REVIEW` and never retrieved. That part is measured.
- The PGN in the openings TSV is checked only by a notation pattern, not by
  the chess wrapper. python-chess is GPL-3.0, so it isn't a dependency.
- The question set was drafted from the sources, not by a coach. A coach
  should review it before the thresholds are trusted (RAG_POC.md §3).
