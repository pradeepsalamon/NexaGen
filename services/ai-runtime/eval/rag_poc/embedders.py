"""Embedders and the optional reranker (RAG_POC.md §2).

`hash` is a deterministic bag-of-words embedder for tests: no model, no
download. The fastembed ones need the `rag-poc` dependency group."""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

_WORD = re.compile(r"[a-z0-9]+")


class Embedder(Protocol):
    name: str
    dim: int

    @property
    def revision(self) -> str: ...

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


def _normalise(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


class HashEmbedder:
    """Signed feature hashing of word unigrams and bigrams, L2-normalised."""

    name = "hash"

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    @property
    def revision(self) -> str:
        return f"hash-v1-{self.dim}"

    def _embed(self, text: str) -> list[float]:
        words = _WORD.findall(text.lower())
        vector = [0.0] * self.dim
        for feature in [*words, *(f"{a} {b}" for a, b in zip(words, words[1:]))]:
            digest = hashlib.blake2b(feature.encode(), digest_size=8).digest()
            bucket = int.from_bytes(digest[:4], "little") % self.dim
            vector[bucket] += 1.0 if digest[4] & 1 else -1.0
        return _normalise(vector)

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


@dataclass(frozen=True)
class ModelSpec:
    model: str
    dim: int
    query_prefix: str = ""
    document_prefix: str = ""
    # Models fastembed doesn't ship: registered from their Hugging Face ONNX export.
    custom_hf: str | None = None


MODELS: dict[str, ModelSpec] = {
    # bge v1.5 works without an instruction; the query instruction is what the
    # model card recommends for short-query retrieval.
    "bge-small": ModelSpec(
        "BAAI/bge-small-en-v1.5", 384, query_prefix="Represent this sentence for searching relevant passages: "
    ),
    "e5-small": ModelSpec(
        "intfloat/multilingual-e5-small",
        384,
        query_prefix="query: ",
        document_prefix="passage: ",
        custom_hf="intfloat/multilingual-e5-small",
    ),
    "nomic": ModelSpec(
        "nomic-ai/nomic-embed-text-v1.5-Q", 768, query_prefix="search_query: ", document_prefix="search_document: "
    ),
}


def _snapshot_revision(cache_dir: Path, hf_repo: str | None, fallback: str) -> str:
    """The Hugging Face snapshot (commit) the weights were loaded from."""
    if hf_repo:
        snapshots = sorted((cache_dir / f"models--{hf_repo.replace('/', '--')}" / "snapshots").glob("*"))
        if snapshots:
            return f"{hf_repo}@{snapshots[-1].name}"
    return fallback


class FastEmbedder:
    def __init__(self, key: str, *, cache_dir: Path, threads: int | None = None) -> None:
        from fastembed import TextEmbedding  # rag-poc group only

        spec = MODELS[key]
        self.name = key
        self.dim = spec.dim
        self._spec = spec
        cache_dir.mkdir(parents=True, exist_ok=True)
        if spec.custom_hf and spec.model not in {m["model"] for m in TextEmbedding.list_supported_models()}:
            from fastembed.common.model_description import ModelSource, PoolingType

            TextEmbedding.add_custom_model(
                model=spec.model,
                pooling=PoolingType.MEAN,
                normalization=True,
                sources=ModelSource(hf=spec.custom_hf),
                dim=spec.dim,
                model_file="onnx/model.onnx",
            )
        self._model: Any = TextEmbedding(spec.model, cache_dir=str(cache_dir), threads=threads)
        import fastembed

        hf_repo = spec.custom_hf or next(
            (m["sources"]["hf"] for m in TextEmbedding.list_supported_models() if m["model"] == spec.model), None
        )
        self._revision = _snapshot_revision(cache_dir, hf_repo, f"{spec.model}@fastembed-{fastembed.__version__}")

    @property
    def revision(self) -> str:
        return self._revision

    def embed_documents(self, texts: Sequence[str]) -> list[list[float]]:
        prefixed = [self._spec.document_prefix + t for t in texts]
        return [list(map(float, v)) for v in self._model.embed(prefixed, batch_size=32)]

    def embed_query(self, text: str) -> list[float]:
        return [float(v) for v in next(iter(self._model.embed([self._spec.query_prefix + text])))]


class Reranker(Protocol):
    name: str

    def scores(self, query: str, documents: Sequence[str]) -> list[float]: ...


class CrossEncoderReranker:
    name = "Xenova/ms-marco-MiniLM-L-6-v2"

    def __init__(self, *, cache_dir: Path, threads: int | None = None) -> None:
        from fastembed.rerank.cross_encoder import TextCrossEncoder

        self._model: Any = TextCrossEncoder(self.name, cache_dir=str(cache_dir), threads=threads)

    def scores(self, query: str, documents: Sequence[str]) -> list[float]:
        return [float(s) for s in self._model.rerank(query, list(documents), batch_size=32)]


def make_embedder(key: str, *, cache_dir: Path, threads: int | None = None) -> Embedder:
    if key == "hash":
        return HashEmbedder()
    return FastEmbedder(key, cache_dir=cache_dir, threads=threads)
