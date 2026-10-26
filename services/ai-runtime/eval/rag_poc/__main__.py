"""RAG proof of concept CLI (docs/ai/architecture/RAG_POC.md).

    uv run --group rag-poc python -m eval.rag_poc matrix \\
        --store postgresql://poc:poc@127.0.0.1:5432/rag_poc \\
        --embedders bge-small,e5-small --chunk-tokens 400,250 --out eval/reports/rag_poc

`--store memory --embedders hash` runs the whole pipeline with no model and no
database (what the unit tests do). Never point --store at a shared database:
PgStore refuses any database whose name doesn't end in _poc."""

from __future__ import annotations

import argparse
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

from .embedders import CrossEncoderReranker, make_embedder
from .evaluate import Config, run, summary_markdown
from .sources import CACHE, all_documents
from .stores import MemoryStore, PgStore


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m eval.rag_poc")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("fetch", help="download and verify the public sources")
    matrix = sub.add_parser("matrix", help="evaluate every embedder x chunk size")
    matrix.add_argument("--store", default="memory", help="'memory' or a postgresql:// DSN (database *_poc)")
    matrix.add_argument("--embedders", default="hash")
    matrix.add_argument("--chunk-tokens", default="400,250")
    matrix.add_argument("--no-rerank", action="store_true")
    matrix.add_argument("--rerank-candidates", type=int, default=30)
    merge = sub.add_parser("merge", help="combine report.json files into one summary")
    merge.add_argument("reports", nargs="+", type=Path)
    merge.add_argument("--out", type=Path, required=True)
    matrix.add_argument("--threads", type=int, default=None, help="ONNX threads (2 = the production box)")
    matrix.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    if args.command == "merge":
        runs = [json.loads(p.read_text()) for p in args.reports]
        reports = [r for run_ in runs for r in run_["reports"]]
        # A merged report's meta is already a list: flatten, so merges compose.
        meta_list = [m for run_ in runs for m in (run_["meta"] if isinstance(run_["meta"], list) else [run_["meta"]])]
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "report.json").write_text(json.dumps({"meta": meta_list, "reports": reports}, indent=2) + "\n")
        (args.out / "summary.md").write_text(summary_markdown(reports))
        print(summary_markdown(reports))
        return 0

    documents = all_documents()
    if args.command == "fetch":
        print(f"{len(documents)} documents ready in {CACHE}")
        return 0

    models = CACHE / "models"
    reranker = None if args.no_rerank or args.embedders == "hash" else CrossEncoderReranker(cache_dir=models, threads=args.threads)
    store = MemoryStore() if args.store == "memory" else PgStore(args.store)
    reports = []
    for embedder_key in args.embedders.split(","):
        embedder = make_embedder(embedder_key, cache_dir=models, threads=args.threads)
        for tokens in (int(t) for t in args.chunk_tokens.split(",")):
            config = Config(embedder_key, tokens, rerank_candidates=args.rerank_candidates)
            reports.append(run(config, store, embedder, documents, reranker=reranker))

    args.out.mkdir(parents=True, exist_ok=True)
    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "store": "memory" if args.store == "memory" else "pgvector",
        "threads": args.threads,
    }
    (args.out / "report.json").write_text(json.dumps({"meta": meta, "reports": reports}, indent=2) + "\n")
    (args.out / "summary.md").write_text(
        f"RAG PoC run {meta['generatedAt']} on {meta['machine']} ({meta['store']})\n\n" + summary_markdown(reports)
    )
    print(summary_markdown(reports))
    return 0


if __name__ == "__main__":
    sys.exit(main())
