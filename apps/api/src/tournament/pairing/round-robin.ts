// ─────────────────────────────────────────────────────────────────────────────
// Round robin (docs/TOURNAMENTS.md §5): Berger tables. With players numbered
// 1..n by seed (n even; an odd field adds a phantom n whose opponent has the
// bye), players i and j < n meet in round ((i + j − 2) mod (n − 1)) + 1 with
// White to the lower number when i + j is odd, else the higher; player i meets
// n in round ((2i − 2) mod (n − 1)) + 1 with White to i when i ≤ n/2. Every
// pair meets once per cycle, every player's colour difference is at most 1
// and nobody has the same colour three times running. A double round robin
// repeats the schedule with colours swapped.
// ─────────────────────────────────────────────────────────────────────────────

export type ScheduledRound = {
  round: number;
  pairings: { whiteId: string; blackId: string; board: number }[];
  /** The player sitting out (odd field), if any. */
  byeId: string | null;
};

export function roundRobinSchedule(seedOrderIds: readonly string[], cycles: 1 | 2 = 1): ScheduledRound[] {
  if (new Set(seedOrderIds).size !== seedOrderIds.length) throw new Error("roundRobinSchedule: duplicate player");
  if (seedOrderIds.length < 2) return [];
  const n = seedOrderIds.length % 2 === 0 ? seedOrderIds.length : seedOrderIds.length + 1;
  const idOf = (k: number): string | null => seedOrderIds[k - 1] ?? null; // k = n may be the phantom
  const rounds: ScheduledRound[] = Array.from({ length: n - 1 }, (_, r) => ({ byeId: null, pairings: [], round: r + 1 }));
  const games: { round: number; white: number; black: number }[] = [];
  for (let i = 1; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const round = ((i + j - 2) % (n - 1)) + 1;
      const white = (i + j) % 2 === 1 ? Math.min(i, j) : Math.max(i, j);
      games.push({ black: white === i ? j : i, round, white });
    }
    const round = ((2 * i - 2) % (n - 1)) + 1;
    const white = i <= n / 2 ? i : n;
    games.push({ black: white === i ? n : i, round, white });
  }
  // Boards: the higher seeds first.
  games.sort((a, b) => a.round - b.round || Math.min(a.white, a.black) - Math.min(b.white, b.black));
  for (const g of games) {
    const round = rounds[g.round - 1];
    const [white, black] = [idOf(g.white), idOf(g.black)];
    if (white === null || black === null) {
      round.byeId = white ?? black;
      continue;
    }
    round.pairings.push({ blackId: black, board: round.pairings.length + 1, whiteId: white });
  }
  if (cycles === 1) return rounds;
  const second = rounds.map((round) => ({
    byeId: round.byeId,
    pairings: round.pairings.map((p) => ({ blackId: p.whiteId, board: p.board, whiteId: p.blackId })),
    round: round.round + rounds.length
  }));
  return [...rounds, ...second];
}
