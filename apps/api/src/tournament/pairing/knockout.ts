// ─────────────────────────────────────────────────────────────────────────────
// Knockout (docs/TOURNAMENTS.md §5). The bracket is the next power of two;
// seeds are placed so that 1 and 2 can only meet in the final (1 v N, with
// the top half / bottom half split recursively); byes go to the top seeds.
// A match is best of N games with alternating colours (the higher seed has
// White first); a level match goes to sudden-death games (at most 3), then
// the higher seed advances.
// ─────────────────────────────────────────────────────────────────────────────
import type { TournamentKnockoutConfig } from "@nexa-chess/types";

export const MAX_SUDDEN_DEATH_GAMES = 3;

export function bracketSize(players: number): number {
  let size = 1;
  while (size < players) size *= 2;
  return Math.max(2, size);
}

export function bracketRounds(players: number): number {
  return Math.log2(bracketSize(players));
}

/** Seed numbers (1-based) in slot order: size 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
export function seedSlots(size: number): number[] {
  let slots = [1];
  while (slots.length < size) {
    const next = slots.length * 2 + 1;
    slots = slots.flatMap((s) => [s, next - s]);
  }
  return slots;
}

export type FirstRoundMatch = { slot: number; aId: string | null; bId: string | null };

/** Round-1 matches from the seed order; a null side is a bye. Side A is always the higher seed. */
export function firstRoundMatches(seedOrderIds: readonly string[]): FirstRoundMatch[] {
  const size = bracketSize(seedOrderIds.length);
  const slots = seedSlots(size);
  const matches: FirstRoundMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const [s1, s2] = [slots[i], slots[i + 1]];
    const [hi, lo] = s1 < s2 ? [s1, s2] : [s2, s1];
    matches.push({ aId: seedOrderIds[hi - 1] ?? null, bId: seedOrderIds[lo - 1] ?? null, slot: i / 2 });
  }
  return matches;
}

/** Where the winner of (round, slot) plays next: slot ⌊slot/2⌋, as side A when the slot is even. */
export function nextSlot(slot: number): { slot: number; side: "A" | "B" } {
  return { side: slot % 2 === 0 ? "A" : "B", slot: Math.floor(slot / 2) };
}

/** One finished game of a match, from side A's point of view. */
export type MatchGame = { aWhite: boolean; aHalfPoints: number; bHalfPoints: number };

export type MatchState =
  | { status: "DECIDED"; winner: "A" | "B"; by: "GAMES" | "SEED" }
  | { status: "NEXT_GAME"; aWhite: boolean; suddenDeath: boolean };

export function knockoutMatchState(config: TournamentKnockoutConfig, games: readonly MatchGame[]): MatchState {
  const regular = games.slice(0, config.gamesPerMatch);
  const extra = games.slice(config.gamesPerMatch);
  const a = regular.reduce((s, g) => s + g.aHalfPoints, 0);
  const b = regular.reduce((s, g) => s + g.bHalfPoints, 0);
  const remaining = config.gamesPerMatch - regular.length;
  // Decided early when the trailing side can't catch up (2 half-points per game left).
  if (a > b + remaining * 2) return { by: "GAMES", status: "DECIDED", winner: "A" };
  if (b > a + remaining * 2) return { by: "GAMES", status: "DECIDED", winner: "B" };
  if (remaining > 0) return { aWhite: regular.length % 2 === 0, status: "NEXT_GAME", suddenDeath: false };
  // Level after the regular games.
  if (config.tiebreak === "SUDDEN_DEATH") {
    for (const g of extra) {
      if (g.aHalfPoints > g.bHalfPoints) return { by: "GAMES", status: "DECIDED", winner: "A" };
      if (g.bHalfPoints > g.aHalfPoints) return { by: "GAMES", status: "DECIDED", winner: "B" };
    }
    if (extra.length < MAX_SUDDEN_DEATH_GAMES) {
      return { aWhite: (regular.length + extra.length) % 2 === 0, status: "NEXT_GAME", suddenDeath: true };
    }
  }
  return { by: "SEED", status: "DECIDED", winner: "A" };
}
