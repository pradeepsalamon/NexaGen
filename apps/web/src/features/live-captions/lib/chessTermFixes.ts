// Deterministic fixes for chess words speech recognition mishears in English.
// The list comes from the 2026-10-19 Whisper timing test (LIVE_CAPTIONS.md
// §5.2) plus common browser-recognition slips. English only: Tamil output is
// left as heard until a coach-reviewed glossary exists.

type Fix = { pattern: RegExp; replacement: string | ((match: string, ...groups: string[]) => string) };

const FIXES: readonly Fix[] = [
  { pattern: /\bpast pawn(s?)\b/gi, replacement: "passed pawn$1" },
  { pattern: /\b(?:porn|corn|pond|prawn)(s?)\b/gi, replacement: "pawn$1" },
  { pattern: /\bnight(s?)\b/gi, replacement: "knight$1" },
  { pattern: /\b(?:rock|ruk)(s?)\b/gi, replacement: "rook$1" },
  { pattern: /\bcheck mate(s|d)?\b/gi, replacement: "checkmate$1" },
  { pattern: /\bend game(s?)\b/gi, replacement: "endgame$1" },
  { pattern: /\bmiddle game(s?)\b/gi, replacement: "middlegame$1" },
  { pattern: /\b(?:ryan|roy|rui) lopez\b/gi, replacement: "Ruy Lopez" },
  { pattern: /\b(?:fian?ketto|fiancetto|fiyanchetto)\b/gi, replacement: "fianchetto" },
  { pattern: /\b(?:on|an|in) pass(?:ant|ent|on)\b/gi, replacement: "en passant" },
  { pattern: /\ben pass(?:ent|on)\b/gi, replacement: "en passant" },
  { pattern: /\b(?:zugswang|zug zwang|zoog zwang)\b/gi, replacement: "zugzwang" },
  { pattern: /\bstale mate\b/gi, replacement: "stalemate" },
  // "E4" → "e4": squares are lower case in notation. Only letter+digit with no
  // space, so "A 3 move combination" is left alone.
  { pattern: /\b([A-H])([1-8])\b/g, replacement: (_match, file, rank) => `${file.toLowerCase()}${rank}` }
];

export function isEnglishLang(lang: string): boolean {
  return lang.toLowerCase().startsWith("en");
}

export function applyChessTermFixes(text: string): string {
  return FIXES.reduce(
    (current, fix) =>
      typeof fix.replacement === "string"
        ? current.replace(fix.pattern, fix.replacement)
        : current.replace(fix.pattern, fix.replacement as (match: string, ...groups: string[]) => string),
    text
  );
}
