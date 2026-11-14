// ─────────────────────────────────────────────────────────────────────────────
// Arena (docs/TOURNAMENTS.md §5): players are paired as soon as they are free,
// for as long as the arena runs.
//
// Scoring per game: win 2, draw 1, loss 0. Streaks (when on): after two wins
// in a row a player is "on fire" and scores double (win 4, draw 2) until a game
// that isn't a win. A draw before move 10 scores nothing (no quick-draw
// farming). Berserk (when on): a player who halved their clock and wins a game
// of at least 7 moves gets +1.
// ─────────────────────────────────────────────────────────────────────────────
import type { TournamentArenaConfig } from "@nexa-chess/types";

export const ARENA_MIN_PLIES_FOR_DRAW_POINTS = 20;
export const ARENA_MIN_PLIES_FOR_BERSERK = 14;

export type ArenaGameResult = {
  /** 2 win, 1 draw, 0 loss (half-points). */
  halfPoints: number;
  plies: number;
  berserk: boolean;
};

export type ArenaTally = { points: number; streak: number; onFire: boolean; sheet: number[] };

/** Arena points over a player's games in the order they finished. */
export function arenaTally(config: TournamentArenaConfig, games: readonly ArenaGameResult[]): ArenaTally {
  let points = 0;
  let streak = 0;
  const sheet: number[] = [];
  for (const g of games) {
    const onFire = config.streaks && streak >= 2;
    let base = g.halfPoints === 2 ? 2 : g.halfPoints === 1 ? (g.plies < ARENA_MIN_PLIES_FOR_DRAW_POINTS ? 0 : 1) : 0;
    if (onFire) base *= 2;
    if (config.berserk && g.berserk && g.halfPoints === 2 && g.plies >= ARENA_MIN_PLIES_FOR_BERSERK) base += 1;
    points += base;
    sheet.push(base);
    streak = g.halfPoints === 2 ? streak + 1 : 0;
  }
  return { onFire: config.streaks && streak >= 2, points, sheet, streak };
}

export type ArenaWaiting = {
  id: string;
  /** Current position in the standings (0 = leader). */
  rank: number;
  lastOpponentId: string | null;
  /** Whites minus Blacks so far. */
  colorDiff: number;
};

/**
 * Pairs waiting players who are close in the standings, never the same two
 * twice in a row (unless they are the only two waiting). Odd one out waits.
 */
export function arenaPairings(waiting: readonly ArenaWaiting[]): { whiteId: string; blackId: string }[] {
  const pool = [...waiting].sort((a, b) => a.rank - b.rank);
  const pairs: { whiteId: string; blackId: string }[] = [];
  while (pool.length >= 2) {
    const a = pool.shift()!;
    let index = pool.findIndex((b) => b.id !== a.lastOpponentId && a.id !== b.lastOpponentId);
    if (index === -1) {
      // Only an immediate rematch is possible: allow it if nobody else will come for either.
      if (pool.length === 1) index = 0;
      else continue;
    }
    const [b] = pool.splice(index, 1);
    const aWhite = a.colorDiff !== b.colorDiff ? a.colorDiff < b.colorDiff : a.rank % 2 === 0;
    pairs.push(aWhite ? { blackId: b.id, whiteId: a.id } : { blackId: a.id, whiteId: b.id });
  }
  return pairs;
}
