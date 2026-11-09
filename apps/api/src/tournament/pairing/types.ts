// Shared shapes of the pure tournament engines (docs/TOURNAMENTS.md §5). The
// engines never touch the database: the round service loads these, calls an
// engine, and stores what it returns inside one transaction.

export type Color = "W" | "B";

/** A finished (or forfeited) game from a player's point of view, for pairing and standings. */
export type GameRecord = {
  round: number;
  whiteId: string;
  /** null for a bye (only `whiteId` is set). */
  blackId: string | null;
  /** Points for White in half-points: 2 win, 1 draw, 0 loss; null = not finished / no result. */
  whiteHalfPoints: number | null;
  /** Points for Black in half-points (independent of White's for double forfeits). */
  blackHalfPoints: number | null;
  /** Whether the game was played over the board (false for byes and forfeits). */
  played: boolean;
};

export type PairingPlayer = {
  id: string;
  /** Seed rating (null = unrated, seeded below every rated player). */
  rating: number | null;
  /** 1 = top seed. */
  seed: number;
};

export type Pairing = { whiteId: string; blackId: string; board: number };

export type ByeKind = "FULL" | "HALF" | "ZERO";

export type RoundPairings = { pairings: Pairing[]; byes: { playerId: string; kind: ByeKind }[] };

/** Points of one player from one game record, in half-points (null when not finished). */
export function halfPointsFor(game: GameRecord, playerId: string): number | null {
  if (game.whiteId === playerId) return game.whiteHalfPoints;
  if (game.blackId === playerId) return game.blackHalfPoints;
  return null;
}

export function opponentOf(game: GameRecord, playerId: string): string | null {
  if (game.whiteId === playerId) return game.blackId;
  if (game.blackId === playerId) return game.whiteId;
  return null;
}

export function colorOf(game: GameRecord, playerId: string): Color | null {
  if (game.blackId === null) return null; // a bye has no colour
  if (game.whiteId === playerId) return "W";
  if (game.blackId === playerId) return "B";
  return null;
}

/** Seed order: rated players by rating (desc), then unrated, ties by id for determinism. */
export function seedOrder<T extends { id: string; rating: number | null }>(players: readonly T[]): T[] {
  return [...players].sort((a, b) => {
    if (a.rating === null && b.rating !== null) return 1;
    if (b.rating === null && a.rating !== null) return -1;
    if (a.rating !== b.rating) return (b.rating ?? 0) - (a.rating ?? 0);
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
