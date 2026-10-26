"""Answer citations, checked against what was actually retrieved.

The answer schema is `{answer, citations: [{chunkId, quote?}]}`. A citation
survives only if its chunk was in the retrieved set handed to the model and its
quote (when given) is a substring of that chunk, whitespace collapsed. Invalid
citations are dropped and counted, never repaired."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from .text import collapse_whitespace

MAX_QUOTE_CHARS = 300


@dataclass
class CitationCheck:
    valid: list[dict[str, str]] = field(default_factory=list)
    dropped_unknown_chunk: int = 0
    dropped_bad_quote: int = 0
    dropped_malformed: int = 0

    @property
    def dropped(self) -> int:
        return self.dropped_unknown_chunk + self.dropped_bad_quote + self.dropped_malformed


def validate_citations(citations: Any, retrieved: Mapping[str, str]) -> CitationCheck:
    """`retrieved` maps chunk id -> chunk text for exactly the chunks the
    model was shown."""
    check = CitationCheck()
    if not isinstance(citations, list):
        check.dropped_malformed += 1
        return check
    seen: set[tuple[str, str]] = set()
    for item in citations:
        if not isinstance(item, dict) or not isinstance(item.get("chunkId"), str):
            check.dropped_malformed += 1
            continue
        chunk_id = item["chunkId"]
        quote = item.get("quote")
        if chunk_id not in retrieved:
            check.dropped_unknown_chunk += 1
            continue
        if quote is not None:
            if not isinstance(quote, str) or not quote.strip() or len(quote) > MAX_QUOTE_CHARS:
                check.dropped_malformed += 1
                continue
            if collapse_whitespace(quote) not in collapse_whitespace(retrieved[chunk_id]):
                check.dropped_bad_quote += 1
                continue
        key = (chunk_id, quote or "")
        if key in seen:
            continue
        seen.add(key)
        check.valid.append({"chunkId": chunk_id, **({"quote": quote} if quote is not None else {})})
    return check
