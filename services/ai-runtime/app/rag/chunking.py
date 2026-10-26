"""Structure-aware chunking (AI_FOUNDATION.md §5.2).

A document is split into blocks (headings and paragraphs), and paragraphs are
packed into chunks of about `target_tokens`, carrying ~`overlap` of the
previous chunk forward. A section heading (level <= `section_level`) always
starts a new chunk, so a chunk never mixes two sections. A paragraph holding a
FEN or a move sequence is atomic: it is never split, even when oversized (the
chunk then carries the OVERSIZE_ATOMIC_BLOCK warning). An oversized prose
paragraph is split at sentence boundaries.

Offsets index into the *normalised* text (text.normalize_text)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from .chess_notation import is_atomic
from .text import approx_tokens, normalize_text, sha256_hex

DocumentFormat = Literal["markdown", "text"]

_MD_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(_\[])")
_PARAGRAPH_BREAK = re.compile(r"\n[ \t]*\n")


@dataclass(frozen=True)
class Block:
    kind: Literal["heading", "paragraph"]
    text: str
    start: int
    end: int
    level: int = 0
    atomic: bool = False

    @property
    def tokens(self) -> int:
        return approx_tokens(self.text)


@dataclass(frozen=True)
class Chunk:
    ordinal: int
    text: str
    heading_path: tuple[str, ...]
    char_start: int
    char_end: int
    token_count: int
    sha256: str
    warnings: tuple[str, ...] = field(default=())

    def embedding_text(self, title: str | None = None) -> str:
        """What gets embedded: the heading path gives a short chunk its topic."""
        path = " > ".join(p for p in ((title,) if title else ()) + self.heading_path if p)
        return f"{path}\n\n{self.text}" if path else self.text


def _plain_heading_level(paragraph: str) -> int:
    """Plain-text headings: a short single line with no lowercase letters.
    "CHAPTER IV" is level 1, "13. THE OPPOSITION" level 2, other caps lines
    (e.g. "EXAMPLE 2.") level 3."""
    if "\n" in paragraph or len(paragraph) > 80:
        return 0
    letters = [c for c in paragraph if c.isalpha()]
    if len(letters) < 3 or any(c.islower() for c in letters):
        return 0
    if re.match(r"^(CHAPTER|PART|BOOK)\b", paragraph):
        return 1
    if re.match(r"^(\d{1,3}\.|GAME \d+\.?)\s+\S", paragraph):
        return 2
    return 3


def parse_blocks(text: str, fmt: DocumentFormat) -> list[Block]:
    blocks: list[Block] = []
    position = 0
    for match in [*_PARAGRAPH_BREAK.finditer(text), None]:
        end = match.start() if match else len(text)
        raw = text[position:end]
        stripped = raw.strip()
        if stripped:
            start = position + raw.index(stripped[0])
            stop = start + len(stripped)
            blocks.extend(_classify(stripped, start, stop, fmt))
        position = match.end() if match else len(text)
    return blocks


def _classify(paragraph: str, start: int, stop: int, fmt: DocumentFormat) -> list[Block]:
    if fmt == "markdown":
        # A Markdown heading may sit directly above its paragraph.
        lines = paragraph.split("\n")
        heading = _MD_HEADING.match(lines[0])
        if heading:
            out = [Block("heading", heading.group(2), start, start + len(lines[0]), level=len(heading.group(1)))]
            rest = "\n".join(lines[1:]).strip()
            if rest:
                rest_start = paragraph.index(rest, len(lines[0])) + start
                out.append(Block("paragraph", rest, rest_start, rest_start + len(rest), atomic=is_atomic(rest)))
            return out
    else:
        level = _plain_heading_level(paragraph)
        if level:
            return [Block("heading", paragraph, start, stop, level=level)]
    return [Block("paragraph", paragraph, start, stop, atomic=is_atomic(paragraph))]


def _split_prose(block: Block, target_tokens: int) -> list[Block]:
    """Sentence-boundary pieces of at most ~target_tokens each."""
    pieces: list[Block] = []
    cursor = 0
    sentences: list[tuple[int, int]] = []
    for match in _SENTENCE_END.finditer(block.text):
        sentences.append((cursor, match.start()))
        cursor = match.end()
    sentences.append((cursor, len(block.text)))

    group_start, group_end, group_tokens = sentences[0][0], sentences[0][0], 0
    for s_start, s_end in sentences:
        tokens = approx_tokens(block.text[s_start:s_end])
        if group_tokens and group_tokens + tokens > target_tokens:
            pieces.append(_sub_block(block, group_start, group_end))
            group_start, group_tokens = s_start, 0
        group_end, group_tokens = s_end, group_tokens + tokens
    pieces.append(_sub_block(block, group_start, group_end))
    return pieces


def _sub_block(block: Block, start: int, end: int) -> Block:
    return Block("paragraph", block.text[start:end], block.start + start, block.start + end)


def chunk_document(
    raw_text: str,
    fmt: DocumentFormat,
    *,
    target_tokens: int = 400,
    overlap: float = 0.15,
    section_level: int = 2,
) -> tuple[str, list[Chunk]]:
    """Returns the normalised text and its chunks."""
    if target_tokens < 50 or not 0 <= overlap < 0.5:
        raise ValueError("target_tokens must be >= 50 and overlap in [0, 0.5).")
    text = normalize_text(raw_text)
    overlap_budget = int(target_tokens * overlap)

    # Expand oversized prose first, so packing only sees units it may keep whole.
    units: list[Block] = []
    for block in parse_blocks(text, fmt):
        if block.kind == "paragraph" and not block.atomic and block.tokens > target_tokens:
            units.extend(_split_prose(block, target_tokens))
        else:
            units.append(block)

    chunks: list[Chunk] = []
    path: list[tuple[int, str]] = []
    current: list[Block] = []
    current_path: tuple[str, ...] = ()
    current_tokens = 0
    # True when `current` holds only blocks carried over from the last chunk.
    carried_only = False

    def flush() -> None:
        nonlocal current, current_tokens, carried_only
        if current and not carried_only:
            body = "\n\n".join(b.text for b in current)
            warnings = ("OVERSIZE_ATOMIC_BLOCK",) if any(b.atomic and b.tokens > target_tokens for b in current) else ()
            chunks.append(
                Chunk(
                    ordinal=len(chunks),
                    text=body,
                    heading_path=current_path,
                    char_start=current[0].start,
                    char_end=current[-1].end,
                    token_count=approx_tokens(body),
                    sha256=sha256_hex(body),
                    warnings=warnings,
                )
            )
        current, current_tokens, carried_only = [], 0, False

    def heading_path() -> tuple[str, ...]:
        return tuple(title for _, title in path)

    for unit in units:
        if unit.kind == "heading":
            if unit.level <= section_level:
                flush()
            while path and path[-1][0] >= unit.level:
                path.pop()
            path.append((unit.level, unit.text))
            if not current:
                current_path = heading_path()
            continue

        if current and current_tokens + unit.tokens > target_tokens and not carried_only:
            previous = current
            flush()
            # Overlap: trailing whole paragraphs of the previous chunk that fit
            # the budget. A paragraph is never cut to make overlap.
            carry: list[Block] = []
            carry_tokens = 0
            for block in reversed(previous):
                if carry_tokens + block.tokens > overlap_budget:
                    break
                carry.insert(0, block)
                carry_tokens += block.tokens
            if len(carry) < len(previous):
                current, current_tokens, carried_only = carry, carry_tokens, bool(carry)
        if not current:
            current_path = heading_path()
        current.append(unit)
        current_tokens += unit.tokens
        carried_only = False

    flush()
    return text, chunks
