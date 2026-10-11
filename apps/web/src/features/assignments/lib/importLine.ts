import { Chess } from "@/lib/chess";
import type { SolutionMove } from "@nexa-chess/types";

export type ImportedLine = { startFen: string; moves: SolutionMove[] };

export type ImportedPgnGame =
  | (ImportedLine & { ok: true; index: number; title: string; description?: string })
  | { ok: false; index: number; title: string; error: string };

const looksLikeFen = (text: string) => !text.includes("[") && /^[pnbrqkPNBRQK1-8/]+\s+[wb]\b/.test(text);

const HEADER_LINE = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/;

// ChessBase exports end FENs in "0 0", which chess.js rejects; repair the counters.
export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length >= 5 && !/^\d+$/.test(parts[4]!)) parts[4] = "0";
  if (parts.length >= 6 && !(Number(parts[5]) >= 1)) parts[5] = "1";
  return parts.join(" ");
}

const cleanText = (raw: string) => raw.replace(/﻿/g, "").replace(/\r\n?/g, "\n").trim();

/** Splits PGN text into one chunk per game (a header block starts a new game). */
export function splitPgnGames(raw: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let hasMoves = false;
  let braceDepth = 0;

  for (const line of cleanText(raw).split("\n")) {
    if (braceDepth === 0 && HEADER_LINE.test(line) && hasMoves) {
      games.push(current.join("\n"));
      current = [];
      hasMoves = false;
    }
    current.push(line);
    if (braceDepth > 0 || !HEADER_LINE.test(line)) {
      if (line.trim()) hasMoves = true;
      for (const ch of line) {
        if (ch === "{") braceDepth += 1;
        else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
      }
    }
  }
  if (current.some((l) => l.trim())) games.push(current.join("\n"));
  return games;
}

const meaningful = (value: string | undefined) =>
  value && !/^[?\-\s]*$/.test(value) ? value.trim() : undefined;

function gameTitle(headers: Record<string, string>, index: number): string {
  const white = meaningful(headers.White);
  const black = meaningful(headers.Black);
  const event = meaningful(headers.Event);
  if (white && black) return `${white} – ${black}`;
  return white ?? event ?? black ?? `Puzzle ${index + 1}`;
}

// The comment before the first move, minus ChessBase diagram/arrow markup.
function leadingComment(movetext: string): string | undefined {
  const match = /^\s*\{([^}]*)\}/.exec(movetext);
  if (!match) return undefined;
  const text = match[1]!
    .replace(/\[%[^\]]*\]/g, "")
    .replace(/\[#\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || undefined;
}

function parseGame(chunk: string, index: number): ImportedPgnGame {
  const headers: Record<string, string> = {};
  const lines = chunk.split("\n");
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const m = HEADER_LINE.exec(line);
    if (!m) break;
    headers[m[1]!] = m[2]!;
  }
  const movetext = lines.slice(i).join("\n");
  const title = gameTitle(headers, index);

  if (headers.FEN) headers.FEN = normalizeFen(headers.FEN);
  const pgn = [
    ...Object.entries(headers).map(([k, v]) => `[${k} "${v}"]`),
    "",
    movetext.trim() || "*"
  ].join("\n");

  const game = new Chess();
  try {
    game.loadPgn(pgn);
  } catch {
    return { ok: false, index, title, error: "Couldn't read this game — check the position and moves." };
  }

  const moves = game.history({ verbose: true }).map((m) => ({
    uci: `${m.from}${m.to}${m.promotion ?? ""}`,
    san: m.san
  }));
  return {
    ok: true,
    index,
    title,
    description: leadingComment(movetext),
    startFen: headers.FEN ? new Chess(headers.FEN).fen() : new Chess().fen(),
    moves
  };
}

/** Every game in a (possibly multi-game) PGN, each parsed independently. */
export function parsePgnGames(raw: string): ImportedPgnGame[] {
  return splitPgnGames(raw).map(parseGame);
}

/**
 * Accepts a bare FEN (position only) or a PGN. A PGN's `[FEN]` header sets the
 * start position; its mainline becomes the solution (variations and comments
 * are dropped). For a multi-game PGN, `gameIndex` picks the game (default the
 * first). Throws with a user-facing message on bad input.
 */
export function parsePgnOrFen(raw: string, gameIndex = 0): ImportedLine {
  const text = cleanText(raw);
  if (!text) throw new Error("Paste a FEN or PGN first.");

  if (looksLikeFen(text)) {
    try {
      return { startFen: new Chess(normalizeFen(text)).fen(), moves: [] };
    } catch {
      throw new Error("That FEN isn't a legal position.");
    }
  }

  const game = parsePgnGames(text)[gameIndex];
  if (!game) throw new Error("Couldn't find a game in that PGN.");
  if (!game.ok) throw new Error("Couldn't read that PGN — check the moves are legal.");
  return { startFen: game.startFen, moves: game.moves };
}
