import { moveGlyph, MOVE_GLYPHS, type MoveGlyph } from "@nexa-chess/types";

/**
 * Colours for annotation glyphs, shared by the move list and the badge on the
 * board so a "??" is the same red in both. Move-quality glyphs follow the
 * game-analysis labels (good = success, dubious = info, mistake = warning,
 * blunder = danger); every other glyph uses primary.
 */
type GlyphTone = "success" | "accent" | "info" | "warning" | "danger" | "primary";

const TONE_BY_NAG: Readonly<Record<number, GlyphTone>> = {
  1: "success",
  2: "warning",
  3: "success",
  4: "danger",
  5: "accent",
  6: "info",
};

const TEXT_CLASS: Record<GlyphTone, string> = {
  accent: "text-accent-ink",
  danger: "text-app-danger-ink",
  info: "text-info-ink",
  primary: "text-primary-ink",
  success: "text-success-ink",
  warning: "text-warning-ink",
};

const FILL: Record<GlyphTone, string> = {
  accent: "var(--color-accent)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
  primary: "var(--color-primary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
};

const toneOf = (nag: number): GlyphTone => TONE_BY_NAG[nag] ?? "primary";

/** Text colour class for a glyph in the move list. */
export function glyphTextClass(nag: number): string {
  return TEXT_CLASS[toneOf(nag)];
}

/** The move's own colour in the list: set only by a move-quality glyph ("!", "??", …). */
export function moveToneClass(nags: readonly number[] | undefined): string | undefined {
  const nag = nags?.find((n) => n in TONE_BY_NAG);
  return nag === undefined ? undefined : TEXT_CLASS[toneOf(nag)];
}

/** "!! Brilliant move — An excellent move that is hard to find." */
export function glyphDefinition(glyph: MoveGlyph): string {
  return `${glyph.symbol} ${glyph.name} — ${glyph.description}`;
}

/** The glyph shown on the board for a move: its first known one (move, then position, then observation). */
export function boardGlyph(nags: readonly number[] | undefined): MoveGlyph | undefined {
  if (!nags?.length) return undefined;
  return MOVE_GLYPHS.find((glyph) => nags.includes(glyph.nag));
}

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * A round badge in the top-right corner of a square, for chessground's
 * `customSvg` (the square is the 0–100 viewBox). Colours are CSS variables,
 * so the badge follows the theme.
 */
export function glyphBadgeSvg(nag: number): string | undefined {
  const glyph = moveGlyph(nag);
  if (!glyph) return undefined;
  const size = glyph.symbol.length > 1 ? 50 : 62;
  return (
    `<g transform="translate(71 -12) scale(0.4)">` +
    `<circle cx="50" cy="50" r="50" fill="${FILL[toneOf(nag)]}" stroke="rgb(var(--rgb-on-primary))" stroke-width="6" />` +
    `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="${size}" font-weight="700" ` +
    `font-family="system-ui, sans-serif" fill="rgb(var(--rgb-on-primary))">${escapeXml(glyph.symbol)}</text>` +
    `</g>`
  );
}
