// ─────────────────────────────────────────────────────────────────────────────
// Standings and tiebreaks (docs/TOURNAMENTS.md §5). Pure: computed from the
// game records alone, so the stored standings can always be recomputed and
// compared. Scores are integer half-points (2 = 1 point).
//
// Unplayed rounds (byes, forfeits) in Buchholz-type tiebreaks count as a
// virtual opponent with the player's own final score — the common
// simplification of FIDE's virtual-opponent rule, applied the same way to
// every player.
// ─────────────────────────────────────────────────────────────────────────────
import type { TournamentArenaConfig, TournamentFormat, TournamentTiebreak } from "@nexa-chess/types";
import { arenaTally } from "./arena";
import { halfPointsFor, opponentOf, type GameRecord } from "./types";

export type StandingPlayer = { id: string; rating: number | null; seed: number };

export type ArenaGameExtras = { plies: number; whiteBerserk: boolean; blackBerserk: boolean; finishedOrder: number };

export type StandingRow = {
  playerId: string;
  rank: number;
  /** Half-points for round formats; arena points for an arena. */
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Consecutive wins at the end (arena: the streak). */
  streak: number;
  onFire: boolean;
  /** Tiebreak values in the tournament's order (half-points, except PERFORMANCE / WINS). */
  tiebreaks: Partial<Record<TournamentTiebreak, number>>;
  performance: number | null;
};

export type StandingsInput = {
  format: TournamentFormat;
  players: readonly StandingPlayer[];
  games: readonly (GameRecord & Partial<ArenaGameExtras>)[];
  tiebreaks: readonly TournamentTiebreak[];
  arenaConfig?: TournamentArenaConfig;
};

/** FIDE-style rating difference for a percentage score (logistic form, capped at ±800). */
export function ratingDifferenceFor(fraction: number): number {
  const p = Math.min(0.99, Math.max(0.01, fraction));
  return Math.round(-400 * Math.log10(1 / p - 1)) + 0; // + 0 turns -0 into 0
}

export function computeStandings(input: StandingsInput): StandingRow[] {
  const finished = input.games.filter((g) => g.whiteHalfPoints !== null || g.blackHalfPoints !== null);
  const ratingOf = new Map(input.players.map((p) => [p.id, p.rating]));
  const seedOf = new Map(input.players.map((p) => [p.id, p.seed]));
  const ids = input.players.map((p) => p.id);
  const gamesOf = new Map<string, typeof finished>(ids.map((id) => [id, []]));
  for (const g of finished) {
    gamesOf.get(g.whiteId)?.push(g);
    if (g.blackId) gamesOf.get(g.blackId)?.push(g);
  }
  const roundsPlayed = finished.reduce((max, g) => Math.max(max, g.round), 0);

  // Base score per player.
  const score = new Map<string, number>();
  const arena = input.format === "ARENA";
  const arenaInfo = new Map<string, { streak: number; onFire: boolean }>();
  for (const id of ids) {
    const mine = gamesOf.get(id)!;
    if (arena) {
      const ordered = [...mine].sort((a, b) => (a.finishedOrder ?? 0) - (b.finishedOrder ?? 0));
      const tally = arenaTally(input.arenaConfig ?? { berserk: true, streaks: true }, ordered.map((g) => ({
        berserk: g.whiteId === id ? Boolean(g.whiteBerserk) : Boolean(g.blackBerserk),
        halfPoints: halfPointsFor(g, id) ?? 0,
        plies: g.plies ?? 0
      })));
      score.set(id, tally.points);
      arenaInfo.set(id, { onFire: tally.onFire, streak: tally.streak });
    } else {
      score.set(id, mine.reduce((s, g) => s + (halfPointsFor(g, id) ?? 0), 0));
    }
  }
  // Chess score in half-points, for opponent-based tiebreaks (also for arena).
  const chessScore = new Map(ids.map((id) => [id, gamesOf.get(id)!.reduce((s, g) => s + (halfPointsFor(g, id) ?? 0), 0)]));

  const rows = ids.map((id): StandingRow => {
    const mine = gamesOf.get(id)!;
    const played = mine.filter((g) => g.played);
    const results = played.map((g) => halfPointsFor(g, id) ?? 0);
    const wins = results.filter((r) => r === 2).length;
    const draws = results.filter((r) => r === 1).length;
    const losses = results.filter((r) => r === 0).length;
    const own = chessScore.get(id)!;
    // Opponent scores, with a virtual opponent (own score) for each unplayed round.
    const oppScores = played.map((g) => chessScore.get(opponentOf(g, id)!) ?? 0);
    const unplayedRounds = arena ? 0 : Math.max(0, roundsPlayed - played.length);
    const buchholzList = [...oppScores, ...new Array(unplayedRounds).fill(own)].sort((a, b) => a - b);
    const sum = (list: number[]) => list.reduce((s, v) => s + v, 0);

    const tiebreaks: StandingRow["tiebreaks"] = {};
    for (const tb of input.tiebreaks) {
      switch (tb) {
        case "BUCHHOLZ":
          tiebreaks[tb] = sum(buchholzList);
          break;
        case "BUCHHOLZ_CUT1":
          tiebreaks[tb] = sum(buchholzList.slice(1));
          break;
        case "MEDIAN_BUCHHOLZ":
          tiebreaks[tb] = sum(buchholzList.slice(1, Math.max(1, buchholzList.length - 1)));
          break;
        case "SONNEBORN_BERGER":
          // Opponent's score times the result (in half-points ×2, kept integer: sum of oppScore * result / 2).
          tiebreaks[tb] = played.reduce((s, g) => s + ((chessScore.get(opponentOf(g, id)!) ?? 0) * (halfPointsFor(g, id) ?? 0)) / 2, 0);
          break;
        case "WINS":
          tiebreaks[tb] = wins;
          break;
        case "PROGRESSIVE": {
          let running = 0;
          let total = 0;
          for (let r = 1; r <= roundsPlayed; r += 1) {
            running += mine.filter((g) => g.round === r).reduce((s, g) => s + (halfPointsFor(g, id) ?? 0), 0);
            total += running;
          }
          tiebreaks[tb] = total;
          break;
        }
        case "PERFORMANCE":
          tiebreaks[tb] = performanceOf(played, id, ratingOf) ?? 0;
          break;
        case "DIRECT_ENCOUNTER":
          tiebreaks[tb] = 0; // filled in per tie group below
          break;
      }
    }
    return {
      draws,
      losses,
      onFire: arenaInfo.get(id)?.onFire ?? false,
      performance: performanceOf(played, id, ratingOf),
      played: played.length,
      playerId: id,
      points: score.get(id)!,
      rank: 0,
      streak: arena ? (arenaInfo.get(id)?.streak ?? 0) : trailingWins(mine, id),
      tiebreaks,
      wins
    };
  });

  // Direct encounter: points scored against the other players on the same score.
  if (input.tiebreaks.includes("DIRECT_ENCOUNTER")) {
    const byScore = new Map<number, StandingRow[]>();
    for (const row of rows) byScore.set(row.points, [...(byScore.get(row.points) ?? []), row]);
    for (const group of byScore.values()) {
      if (group.length < 2) continue;
      const members = new Set(group.map((r) => r.playerId));
      for (const row of group) {
        row.tiebreaks.DIRECT_ENCOUNTER = (gamesOf.get(row.playerId) ?? [])
          .filter((g) => g.played && members.has(opponentOf(g, row.playerId) ?? ""))
          .reduce((s, g) => s + (halfPointsFor(g, row.playerId) ?? 0), 0);
      }
    }
  }

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const tb of input.tiebreaks) {
      const d = (b.tiebreaks[tb] ?? 0) - (a.tiebreaks[tb] ?? 0);
      if (d !== 0) return d;
    }
    return (seedOf.get(a.playerId) ?? 0) - (seedOf.get(b.playerId) ?? 0);
  });
  // Shared ranks only when everything used for ordering is equal; the seed only breaks display order.
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    const tied = prev && prev.points === row.points && input.tiebreaks.every((tb) => (prev.tiebreaks[tb] ?? 0) === (row.tiebreaks[tb] ?? 0));
    row.rank = tied ? prev.rank : i + 1;
  });
  return rows;
}

function trailingWins(games: readonly GameRecord[], id: string): number {
  const ordered = [...games].filter((g) => g.played).sort((a, b) => a.round - b.round);
  let streak = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (halfPointsFor(ordered[i], id) === 2) streak += 1;
    else break;
  }
  return streak;
}

/** Average opponent rating + the rating difference for the score (rated opponents only). */
function performanceOf(played: readonly GameRecord[], id: string, ratingOf: Map<string, number | null>): number | null {
  const rated = played.filter((g) => ratingOf.get(opponentOf(g, id)!) != null);
  if (rated.length === 0) return null;
  const avg = rated.reduce((s, g) => s + (ratingOf.get(opponentOf(g, id)!) ?? 0), 0) / rated.length;
  const fraction = rated.reduce((s, g) => s + (halfPointsFor(g, id) ?? 0), 0) / (2 * rated.length);
  return Math.round(avg + ratingDifferenceFor(fraction));
}
