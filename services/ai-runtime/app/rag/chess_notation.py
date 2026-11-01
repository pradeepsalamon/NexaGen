"""Detects chess notation that a chunk boundary must never cut through."""

from __future__ import annotations

import re

# 1. e4, 12...Nxf3+, 3. O-O-O
_SAN_MOVE = re.compile(
    r"\b\d{1,3}\s*\.(?:\.\.)?\s*(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?"
)
# Descriptive notation, as in older books: "1 R - R 7", "2...K - B 1", "4. P x P"
_DESCRIPTIVE_MOVE = re.compile(r"\b\d{1,3}\s*\.{0,3}\s*(?:Kt|[KQRBP])\s*[-x]\s*(?:[KQ]\s*)?(?:Kt|[KQRBP])?\s*\d?")
_FEN = re.compile(
    r"(?<![A-Za-z0-9/])(?:[pnbrqkPNBRQK1-8]{1,8}/){7}[pnbrqkPNBRQK1-8]{1,8}"
    r"(?:\s+[wb]\s+(?:-|[KQkq]{1,4})\s+(?:-|[a-h][36])(?:\s+\d+\s+\d+)?)?"
)


def contains_fen(text: str) -> bool:
    return _FEN.search(text) is not None


def contains_movetext(text: str) -> bool:
    return _SAN_MOVE.search(text) is not None or _DESCRIPTIVE_MOVE.search(text) is not None


def is_atomic(text: str) -> bool:
    """A block holding a FEN or a move sequence is never split."""
    return contains_fen(text) or contains_movetext(text)
