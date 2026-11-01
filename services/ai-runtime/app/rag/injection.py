"""Flags documents that look like they carry instructions for a model.

A flag never blocks ingestion by itself: the document goes to staff review
(AI_FOUNDATION.md §5.2). The real defence is downstream: retrieved text is
quoted as data, and RAG answer tasks have no tools."""

from __future__ import annotations

import re

INJECTION_FLAG = "INJECTION_PATTERN"

_PATTERNS: dict[str, re.Pattern[str]] = {
    "ignore-instructions": re.compile(
        r"\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+|your\s+)*"
        r"(?:previous|prior|above|earlier|preceding|system|original)\s+"
        r"(?:instructions?|prompts?|messages?|rules|directions|context)",
        re.I,
    ),
    "role-tag": re.compile(r"<\|?\s*/?\s*(?:system|im_start|im_end|assistant|user|developer)\s*\|?>", re.I),
    "role-line": re.compile(r"^\s*(?:#+\s*)?(?:system|assistant|developer)\s*(?:prompt)?\s*:", re.I | re.M),
    "persona-switch": re.compile(r"\byou\s+are\s+now\b|\bfrom\s+now\s+on\s+you\b|\bact\s+as\s+(?:an?\s+)?(?:unrestricted|different)\b", re.I),
    "new-instructions": re.compile(r"\bnew\s+(?:system\s+)?instructions?\s*:", re.I),
    "tool-call": re.compile(r"\b(?:call|invoke|execute|run|use)\s+(?:the\s+)?(?:tool|function)\b", re.I),
    "exfiltration": re.compile(
        r"\b(?:reveal|print|output|repeat|leak|show)\s+(?:the\s+|your\s+)?(?:system\s+prompt|hidden\s+instructions|secrets?|api\s+keys?|passwords?)",
        re.I,
    ),
}


def scan(text: str) -> list[str]:
    """Names of the patterns that match; empty when nothing does."""
    return [name for name, pattern in _PATTERNS.items() if pattern.search(text)]


def flags_for(text: str) -> list[str]:
    return [INJECTION_FLAG] if scan(text) else []
