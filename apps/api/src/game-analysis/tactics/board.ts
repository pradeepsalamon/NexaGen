import type { Color, PieceSymbol, Square } from 'chess.js';
import type { TacticMotifEvidence } from '@nexa-chess/types';
import { Chess } from '../../common/chess/chess';

/**
 * Board geometry for the tactic detector — pure functions over a chess.js
 * position. "Attacks" are geometric (pinned pieces still attack), which is
 * what defending / threatening means to a player.
 */

export const PIECE_VALUE: Record<PieceSymbol, number> = { b: 3, k: 0, n: 3, p: 1, q: 9, r: 5 };

/** Value used when ranking targets: the king outranks everything. */
const targetValue = (type: PieceSymbol) => (type === 'k' ? 1000 : PIECE_VALUE[type]);

export const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

const FILES = 'abcdefgh';
const sq = (file: number, rank: number) => `${FILES[file]}${rank + 1}` as Square;
const coords = (square: Square) => [FILES.indexOf(square[0]), Number(square[1]) - 1] as const;

const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

export type PlacedPiece = { square: Square; type: PieceSymbol; color: Color };

export function pieces(chess: Chess, color?: Color): PlacedPiece[] {
  return chess
    .board()
    .flat()
    .filter((p): p is PlacedPiece => !!p && (!color || p.color === color));
}

/** Sum of piece values for `color` (king excluded). */
export function material(chess: Chess, color: Color): number {
  return pieces(chess, color).reduce((sum, p) => sum + PIECE_VALUE[p.type], 0);
}

export const materialBalance = (chess: Chess, color: Color) => material(chess, color) - material(chess, other(color));

/** Enemy pieces the piece on `from` attacks. */
export function attackedEnemies(chess: Chess, from: Square): PlacedPiece[] {
  const piece = chess.get(from);
  if (!piece) return [];
  return pieces(chess, other(piece.color)).filter((t) => chess.attackers(t.square, piece.color).includes(from));
}

export const isDefended = (chess: Chess, square: Square, byColor: Color) =>
  chess.attackers(square, byColor).length > 0;

/**
 * A target worth attacking with `attackerType`: the king, anything more
 * valuable than the attacker, or anything undefended.
 */
export function isMeaningfulTarget(chess: Chess, target: PlacedPiece, attackerType: PieceSymbol): boolean {
  if (target.type === 'k') return true;
  if (PIECE_VALUE[target.type] > PIECE_VALUE[attackerType]) return true;
  return target.type !== 'p' && !isDefended(chess, target.square, target.color);
}

/** Squares strictly between two squares on a shared line; null if not aligned. */
export function between(a: Square, b: Square): Square[] | null {
  const [af, ar] = coords(a);
  const [bf, br] = coords(b);
  const df = Math.sign(bf - af);
  const dr = Math.sign(br - ar);
  const aligned = af === bf || ar === br || Math.abs(bf - af) === Math.abs(br - ar);
  if (!aligned || (df === 0 && dr === 0)) return null;
  const out: Square[] = [];
  for (let f = af + df, r = ar + dr; f !== bf || r !== br; f += df, r += dr) out.push(sq(f, r));
  return out;
}

/** The first two pieces met walking each ray from a slider. */
function rays(chess: Chess, from: PlacedPiece): Array<[PlacedPiece, PlacedPiece | null]> {
  const dirs =
    from.type === 'r' ? ROOK_DIRS : from.type === 'b' ? BISHOP_DIRS : from.type === 'q' ? [...ROOK_DIRS, ...BISHOP_DIRS] : [];
  const [f0, r0] = coords(from.square);
  const out: Array<[PlacedPiece, PlacedPiece | null]> = [];
  for (const [df, dr] of dirs) {
    const hits: PlacedPiece[] = [];
    for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8 && hits.length < 2; f += df, r += dr) {
      const p = chess.get(sq(f, r));
      if (p) hits.push({ ...p, square: sq(f, r) });
    }
    if (hits.length) out.push([hits[0], hits[1] ?? null]);
  }
  return out;
}

/**
 * Pins and skewers by `color`'s sliders: the first enemy piece on a ray, then
 * the next enemy piece behind it. Pin = the rear piece is worth more (or is
 * the king); skewer = the front piece is worth more (or is the king) and the
 * rear one is a real piece.
 */
export function lineTactics(chess: Chess, color: Color): { pins: string[][]; skewers: string[][] } {
  const pins: string[][] = [];
  const skewers: string[][] = [];
  for (const slider of pieces(chess, color).filter((p) => p.type === 'b' || p.type === 'r' || p.type === 'q')) {
    for (const [front, rear] of rays(chess, slider)) {
      if (!rear || front.color === color || rear.color === color) continue;
      if (front.type !== 'k' && targetValue(rear.type) > targetValue(front.type) && PIECE_VALUE[front.type] >= 3) {
        // Pinning a piece to a lesser-or-equal one behind it is no pin at all.
        if (rear.type === 'k' || PIECE_VALUE[rear.type] > PIECE_VALUE[slider.type] || !isDefended(chess, rear.square, rear.color)) {
          pins.push([slider.square, front.square, rear.square]);
        }
      } else if (targetValue(front.type) > targetValue(rear.type) && PIECE_VALUE[rear.type] >= 3) {
        if (PIECE_VALUE[rear.type] > PIECE_VALUE[slider.type] || !isDefended(chess, rear.square, rear.color)) {
          skewers.push([slider.square, front.square, rear.square]);
        }
      }
    }
  }
  return { pins, skewers };
}

const key = (squares: string[]) => squares.join('-');

/**
 * Motifs created by one move: compares the board before and after `uci`.
 * Returns evidence tagged with `atLinePly` and CONFIRMED (geometry seen).
 */
export function motifsOfMove(fenBefore: string, uci: string, atLinePly: number): TacticMotifEvidence[] {
  const before = new Chess(fenBefore);
  const mover = before.turn();
  const enemy = other(mover);
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const moved = before.get(from);
  if (!moved) return [];

  const captured = before.get(to);
  const after = new Chess(fenBefore);
  try {
    after.move({ from, promotion: uci.slice(4) || undefined, to });
  } catch {
    return [];
  }
  const out: TacticMotifEvidence[] = [];
  const add = (motif: TacticMotifEvidence['motif'], squares: string[]) =>
    out.push({ atLinePly, confidence: 'CONFIRMED', motif, squares });

  const movedNow = after.get(to);
  const enemyKing = pieces(after, enemy).find((p) => p.type === 'k');

  // ── Checks: double / discovered.
  if (after.inCheck() && enemyKing) {
    const checkers = after.attackers(enemyKing.square, mover);
    if (checkers.length >= 2) add('DOUBLE_CHECK', [...checkers, enemyKing.square]);
    // A checker other than the moved piece whose line ran through `from`.
    for (const c of checkers) {
      if (c !== to && between(c as Square, enemyKing.square)?.includes(from)) {
        add('DISCOVERED_CHECK', [c, enemyKing.square]);
      }
    }
  }

  // ── Promotion.
  if (uci.length === 5) add('PROMOTION', [from, to]);

  // ── Hanging piece won: the capture takes something undefended, or worth more than the capturer.
  if (captured && captured.color === enemy) {
    const recapturable = isDefended(after, to, enemy);
    if (!recapturable || PIECE_VALUE[captured.type] > PIECE_VALUE[moved.type]) add('HANGING_PIECE', [from, to]);
  }

  // ── Fork: the moved piece hits two meaningful targets.
  if (movedNow) {
    const targets = attackedEnemies(after, to).filter((t) => isMeaningfulTarget(after, t, movedNow.type));
    if (targets.length >= 2) add('FORK', [to, ...targets.map((t) => t.square)]);
  }

  // ── Discovered attacks: another piece's line opened through `from`.
  const discoveredTargets: string[] = [];
  for (const piece of pieces(after, mover)) {
    if (piece.square === to || !['b', 'r', 'q'].includes(piece.type)) continue;
    const beforeTargets = new Set(attackedEnemies(before, piece.square).map((t) => t.square));
    for (const t of attackedEnemies(after, piece.square)) {
      if (beforeTargets.has(t.square) || t.type === 'k') continue;
      if (!isMeaningfulTarget(after, t, piece.type)) continue;
      if (between(piece.square, t.square)?.includes(from)) {
        add('DISCOVERED_ATTACK', [piece.square, t.square]);
        discoveredTargets.push(t.square);
      }
    }
  }

  // ── Double attack: two different pieces newly threaten two meaningful targets.
  if (movedNow && discoveredTargets.length) {
    const ownThreats = attackedEnemies(after, to)
      .filter((t) => isMeaningfulTarget(after, t, movedNow.type))
      .map((t) => t.square)
      .filter((s) => !discoveredTargets.includes(s));
    if (ownThreats.length) add('DOUBLE_ATTACK', [to, ownThreats[0], discoveredTargets[0]]);
  }

  // ── Pins / skewers that did not exist before the move.
  const was = lineTactics(before, mover);
  const now = lineTactics(after, mover);
  const wasPins = new Set(was.pins.map(key));
  const wasSkewers = new Set(was.skewers.map(key));
  for (const p of now.pins) if (!wasPins.has(key(p))) add('PIN', p);
  for (const s of now.skewers) if (!wasSkewers.has(key(s))) add('SKEWER', s);

  return out;
}

/**
 * Back-rank mate (the standard definition): the mated king stands on its own
 * back rank, every square in front of it (same and adjacent files) is
 * occupied by its OWN pieces that the mating side doesn't attack, and a
 * checker stands on that back rank. One blocked square is not enough — the
 * king must be walled in by its own pieces.
 */
export function isBackRankMate(chess: Chess): boolean {
  if (!chess.isCheckmate()) return false;
  const mated = chess.turn();
  const mater = other(mated);
  const king = pieces(chess, mated).find((p) => p.type === 'k');
  if (!king) return false;
  const backRank = mated === 'w' ? 0 : 7;
  const [kf, kr] = coords(king.square);
  if (kr !== backRank) return false;
  const forward = backRank === 0 ? 1 : 6;
  for (const f of [kf - 1, kf, kf + 1]) {
    if (f < 0 || f > 7) continue;
    const square = sq(f, forward);
    const piece = chess.get(square);
    if (!piece || piece.color !== mated || chess.attackers(square, mater).length > 0) return false;
  }
  return chess.attackers(king.square, mater).some((s) => Number(s[1]) - 1 === backRank);
}
