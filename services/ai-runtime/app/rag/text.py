"""Text normalisation and an approximate token count."""

from __future__ import annotations

import hashlib
import re
import unicodedata

# C0/C1 controls except tab and newline, plus zero-width and bidi overrides:
# invisible characters are where hidden instructions hide (AI_FOUNDATION.md §5.2).
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f​-‏‪-‮⁠-⁤﻿]")
_TRAILING_SPACE = re.compile(r"[ \t]+\n")
_BLANK_RUN = re.compile(r"\n{3,}")
_TOKEN = re.compile(r"[A-Za-z0-9]+|[^\sA-Za-z0-9]")


def normalize_text(text: str) -> str:
    """NFC, LF line endings, no control characters, at most one blank line."""
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")
    text = _CONTROL.sub("", text)
    text = _TRAILING_SPACE.sub("\n", text)
    return _BLANK_RUN.sub("\n\n", text).strip("\n")


def approx_tokens(text: str) -> int:
    """Words and punctuation marks. Within ~20% of a WordPiece count on English
    prose; chess notation ("K - Kt 1;") counts high, which errs towards
    smaller chunks rather than truncated ones."""
    return len(_TOKEN.findall(text))


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def collapse_whitespace(text: str) -> str:
    return " ".join(text.split())
