import { createHash } from "node:crypto";
import { lichessTheme } from "@nexa-chess/types";
import { Chess } from "../../common/chess/chess";
import { puzzleContentHash } from "../puzzle-content-hash";

/**
 * Pure core of the Lichess catalogue PREPARE stage (spec §13 stage 1, audit
 * §F.3). No I/O: `scripts/lichess-puzzles-prepare.cjs` streams the dump through
 * these functions in worker threads and does the sorting / writing.
 *
 * The derived columns must match what materialisation later computes from the
 * same row, so they reuse the API's own pieces: `puzzleContentHash` and the
 * same chess.js `move({ from, to, promotion })` call `normalizeSolution` makes.
 */

/** Bumped when the TSV layout or a derivation changes; the load refuses others. */
export const PREPARE_FORMAT_VERSION = 1;

/** PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate */
export const LICHESS_CSV_HEADER =
  "PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate";
const LICHESS_CSV_COLUMNS = 11;

/**
 * TSV column order = the `\copy` column list in scripts/lichess-puzzles-load.sh.
 * `retiredAt` (NULL) and `releaseId` (the release, known only after the file
 * is hashed) are filled by the load, not carried in the file.
 */
export const CATALOGUE_TSV_COLUMNS = [
  "id",
  "fen",
  "moves",
  "rating",
  "ratingDeviation",
  "popularity",
  "nbPlays",
  "themes",
  "openingTags",
  "gameUrl",
  "ratingBand",
  "randKey",
  "contentHash",
  "passesQualityGate"
] as const;

/** 1-based positions of the columns the shell `sort` keys on. */
export const TSV_SORT_KEYS = {
  contentHash: CATALOGUE_TSV_COLUMNS.indexOf("contentHash") + 1,
  id: 1,
  nbPlays: CATALOGUE_TSV_COLUMNS.indexOf("nbPlays") + 1,
  passesQualityGate: CATALOGUE_TSV_COLUMNS.indexOf("passesQualityGate") + 1,
  randKey: CATALOGUE_TSV_COLUMNS.indexOf("randKey") + 1,
  ratingBand: CATALOGUE_TSV_COLUMNS.indexOf("ratingBand") + 1
} as const;

/** Prepare exits non-zero (and the load refuses) above this share of rejects. */
export const MAX_REJECT_RATIO = 0.001;

/** Source-quality thresholds of the ingestion gate (spec §1). */
export const QUALITY_GATE = { maxRatingDeviation: 90, minNbPlays: 100, minPopularity: 50 } as const;

export type PrepareRejectReason =
  | "BAD_FEN"
  | "BAD_ID"
  | "BAD_MOVE_TOKEN"
  | "BAD_NB_PLAYS"
  | "BAD_POPULARITY"
  | "BAD_RATING"
  | "BAD_RATING_DEVIATION"
  | "COLUMN_COUNT"
  | "DUPLICATE_ID"
  | "ILLEGAL_MOVE"
  | "MATE_NOT_CHECKMATE"
  | "MOVE_COUNT"
  | "NO_THEMES";

export interface PreparedRow {
  id: string;
  fen: string;
  moves: string;
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
  openingTags: string[];
  gameUrl: string;
  ratingBand: number;
  randKey: number;
  contentHash: string;
  /** Source quality only; the canonical-per-content rule is applied after sorting. */
  passesSourceQuality: boolean;
}

/** Kept-but-counted oddities (§F.3 "flag"): the row is valid, the manifest records them. */
export interface PrepareFlags {
  unknownThemes: string[];
  badOpeningTags: boolean;
  badGameUrl: boolean;
}

export type PrepareResult =
  | { ok: true; row: PreparedRow; flags: PrepareFlags }
  | { ok: false; id: string; reason: PrepareRejectReason; detail?: string };

const ID_RE = /^[A-Za-z0-9]{5}$/;
const UCI_RE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const OPENING_TAG_RE = /^[A-Za-z0-9_'-]+$/;
const INT_RE = /^-?\d+$/;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE62_VALUE = new Map([...BASE62].map((c, i) => [c, i]));
/** Number of distinct 5-char ids — the size of the prepare script's seen-id bitset. */
export const LICHESS_ID_SPACE = 62 ** 5;

/** Dense ordinal of a valid 5-char id in [0, LICHESS_ID_SPACE), for an in-memory bitset. */
export function lichessIdOrdinal(id: string): number {
  let n = 0;
  for (const c of id) n = n * 62 + (BASE62_VALUE.get(c) ?? 0);
  return n;
}

/** floor(rating / 50) — the walk index's leading column. */
export function ratingBandOf(rating: number): number {
  return Math.floor(rating / 50);
}

/** Stable shuffle key: first 31 bits of sha1(id). A reload reproduces it. */
export function lichessRandKey(id: string): number {
  return parseInt(createHash("sha1").update(id, "utf8").digest("hex").slice(0, 8), 16) & 0x7fffffff;
}

export function passesSourceQuality(row: Pick<PreparedRow, "nbPlays" | "popularity" | "ratingDeviation">): boolean {
  return (
    row.ratingDeviation <= QUALITY_GATE.maxRatingDeviation &&
    row.popularity >= QUALITY_GATE.minPopularity &&
    row.nbPlays >= QUALITY_GATE.minNbPlays
  );
}

function parseIntIn(value: string, min: number, max: number): number | null {
  if (!INT_RE.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

function splitList(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

/**
 * Validate and derive one CSV line of the dump. Never throws. `fen` and
 * `moves` are kept exactly as published; `contentHash` is computed from the
 * post-setup position (after moves[0]) and moves[1..] — what a materialised
 * `puzzles` row will hold.
 */
export function prepareLine(line: string): PrepareResult {
  const cols = line.split(",");
  const id = cols[0] ?? "";
  if (cols.length !== LICHESS_CSV_COLUMNS) return { ok: false, id, reason: "COLUMN_COUNT", detail: String(cols.length) };
  const [, fen, movesRaw, ratingRaw, rdRaw, popularityRaw, playsRaw, themesRaw, gameUrl, openingRaw] = cols;

  if (!ID_RE.test(id)) return { ok: false, id, reason: "BAD_ID" };

  const rating = parseIntIn(ratingRaw, 100, 4000);
  if (rating === null) return { ok: false, id, reason: "BAD_RATING", detail: ratingRaw };
  const ratingDeviation = parseIntIn(rdRaw, 0, 1000);
  if (ratingDeviation === null) return { ok: false, id, reason: "BAD_RATING_DEVIATION", detail: rdRaw };
  const popularity = parseIntIn(popularityRaw, -100, 100);
  if (popularity === null) return { ok: false, id, reason: "BAD_POPULARITY", detail: popularityRaw };
  const nbPlays = parseIntIn(playsRaw, 0, 2_147_483_647);
  if (nbPlays === null) return { ok: false, id, reason: "BAD_NB_PLAYS", detail: playsRaw };

  const themes = splitList(themesRaw);
  if (themes.length === 0) return { ok: false, id, reason: "NO_THEMES" };

  const moves = splitList(movesRaw);
  if (moves.length < 2 || moves.length % 2 !== 0) {
    return { ok: false, id, reason: "MOVE_COUNT", detail: String(moves.length) };
  }
  const badToken = moves.find((m) => !UCI_RE.test(m));
  if (badToken !== undefined) return { ok: false, id, reason: "BAD_MOVE_TOKEN", detail: badToken };

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return { ok: false, id, reason: "BAD_FEN" };
  }

  let postSetupFen = "";
  for (const [i, uci] of moves.entries()) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4) || undefined });
    } catch {
      return { ok: false, id, reason: "ILLEGAL_MOVE", detail: `${i + 1}:${uci}` };
    }
    if (i === 0) postSetupFen = chess.fen();
  }
  if (themes.includes("mate") && !chess.isCheckmate()) return { ok: false, id, reason: "MATE_NOT_CHECKMATE" };

  const openingTags = splitList(openingRaw);
  const row: PreparedRow = {
    contentHash: puzzleContentHash(postSetupFen, moves.slice(1).map((uci) => ({ uci }))),
    fen,
    gameUrl,
    id,
    moves: moves.join(" "),
    nbPlays,
    openingTags,
    passesSourceQuality: passesSourceQuality({ nbPlays, popularity, ratingDeviation }),
    popularity,
    randKey: lichessRandKey(id),
    rating,
    ratingBand: ratingBandOf(rating),
    ratingDeviation,
    themes
  };
  return {
    flags: {
      badGameUrl: !gameUrl.startsWith("https://lichess.org/"),
      badOpeningTags: openingTags.some((tag) => !OPENING_TAG_RE.test(tag)),
      unknownThemes: themes.filter((key) => !lichessTheme(key))
    },
    ok: true,
    row
  };
}

/** Escape one value for PostgreSQL COPY text format. */
function copyText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/** A text[] literal; elements are quoted only when PostgreSQL requires it. */
export function pgTextArray(items: readonly string[]): string {
  const parts = items.map((item) =>
    item === "" || /[{}",\\\s]/.test(item) || item.toUpperCase() === "NULL"
      ? `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
      : item
  );
  return `{${parts.join(",")}}`;
}

/** One TSV line (no newline) in CATALOGUE_TSV_COLUMNS order, ready for COPY. */
export function toCatalogueTsv(row: PreparedRow, passesQualityGate: boolean): string {
  return [
    row.id,
    row.fen,
    row.moves,
    String(row.rating),
    String(row.ratingDeviation),
    String(row.popularity),
    String(row.nbPlays),
    pgTextArray(row.themes),
    pgTextArray(row.openingTags),
    row.gameUrl,
    String(row.ratingBand),
    String(row.randKey),
    row.contentHash,
    passesQualityGate ? "t" : "f"
  ]
    .map(copyText)
    .join("\t");
}
