// ─────────────────────────────────────────────────────────────────────────────
// Swiss pairing (docs/TOURNAMENTS.md §5): FIDE-Dutch-inspired, solved exactly
// as a maximum-cardinality, maximum-weight matching.
//
// Hard rule: no repeat pairing while any repeat-free pairing of the round
// exists (the matcher is first run without repeat edges; only when that can't
// pair everyone are repeats allowed, at a large cost).
// Soft rules, by weight (most important first):
//   1. equal scores (the square of the score difference is penalised),
//   2. colours (two players who both must have the same colour are expensive;
//      "must" = a colour difference of 2, or the same colour twice running),
//   3. inside a score group, top half against bottom half (Dutch: rank k meets
//      rank k + g/2); across groups, the lowest of the higher group floats down
//      to the highest of the lower group.
// Bye (odd number of players): the lowest-ranked player who has not had a bye,
// chosen so that the others can still be paired without repeats.
// ─────────────────────────────────────────────────────────────────────────────
import { maxWeightMatching, type WeightedEdge } from "./blossom";
import { colorOf, halfPointsFor, opponentOf, type ByeKind, type Color, type GameRecord, type Pairing, type PairingPlayer, type RoundPairings } from "./types";

const BASE = 10 ** 13;
const REPEAT_COST = 10 ** 12;
const SCORE_COST = 10 ** 8;
const ABSOLUTE_COLOR_COST = 10 ** 7;
const STRONG_COLOR_COST = 10 ** 6;
const RANK_COST = 10 ** 3;

export type SwissInput = {
  /** Players still in the tournament (withdrawn and disqualified ones removed). */
  players: readonly PairingPlayer[];
  /** Every earlier game of the tournament, byes included. */
  games: readonly GameRecord[];
  /** 1-based number of the round being paired. */
  round: number;
  /** What a pairing-allocated bye is worth (FULL = a win, the usual rule). */
  byeKind?: ByeKind;
};

type State = {
  id: string;
  seed: number;
  score: number;
  opponents: Set<string>;
  colors: Color[];
  hadBye: boolean;
  rank: number;
  /** Position inside the player's score group, and the group's size. */
  groupPos: number;
  groupSize: number;
};

export function swissStates(input: SwissInput): State[] {
  const states = input.players.map((p): State => {
    const mine = input.games.filter((g) => g.whiteId === p.id || g.blackId === p.id).sort((a, b) => a.round - b.round);
    return {
      colors: mine.map((g) => colorOf(g, p.id)).filter((c): c is Color => c !== null),
      groupPos: 0,
      groupSize: 1,
      hadBye: mine.some((g) => g.blackId === null),
      id: p.id,
      opponents: new Set(mine.map((g) => opponentOf(g, p.id)).filter((o): o is string => o !== null)),
      rank: 0,
      score: mine.reduce((sum, g) => sum + (halfPointsFor(g, p.id) ?? 0), 0),
      seed: p.seed
    };
  });
  states.sort((a, b) => b.score - a.score || a.seed - b.seed);
  states.forEach((s, i) => (s.rank = i));
  const groups = new Map<number, State[]>();
  for (const s of states) groups.set(s.score, [...(groups.get(s.score) ?? []), s]);
  for (const group of groups.values()) group.forEach((s, i) => ((s.groupPos = i), (s.groupSize = group.length)));
  return states;
}

const colorDiff = (s: State) => s.colors.filter((c) => c === "W").length - s.colors.filter((c) => c === "B").length;

/** The colour a player must (absolute) or should (strong) get next, if any. */
function colorPreference(s: State): { color: Color; absolute: boolean } | null {
  const diff = colorDiff(s);
  const [last, prev] = [s.colors[s.colors.length - 1], s.colors[s.colors.length - 2]];
  if (diff <= -2 || (last === "B" && prev === "B")) return { absolute: true, color: "W" };
  if (diff >= 2 || (last === "W" && prev === "W")) return { absolute: true, color: "B" };
  if (diff < 0) return { absolute: false, color: "W" };
  if (diff > 0) return { absolute: false, color: "B" };
  if (last) return { absolute: false, color: last === "W" ? "B" : "W" };
  return null;
}

function edgeWeight(a: State, b: State, repeat: boolean): number {
  let w = BASE;
  if (repeat) w -= REPEAT_COST;
  const scoreDiff = Math.abs(a.score - b.score);
  w -= scoreDiff * scoreDiff * SCORE_COST;
  const pa = colorPreference(a);
  const pb = colorPreference(b);
  if (pa && pb && pa.color === pb.color) {
    w -= pa.absolute && pb.absolute ? ABSOLUTE_COLOR_COST : pa.absolute || pb.absolute ? STRONG_COLOR_COST * 3 : STRONG_COLOR_COST;
  }
  if (a.score === b.score) {
    const half = Math.floor(a.groupSize / 2);
    w -= Math.abs(Math.abs(a.groupPos - b.groupPos) - half) * RANK_COST;
  } else {
    const [hi, lo] = a.score > b.score ? [a, b] : [b, a];
    w -= (hi.groupSize - 1 - hi.groupPos + lo.groupPos) * RANK_COST;
  }
  return w;
}

/** Pairs `states` (even count); null when impossible under the repeat rule. */
function match(states: State[], allowRepeats: boolean): [State, State][] | null {
  if (states.length === 0) return [];
  const edges: WeightedEdge[] = [];
  for (let i = 0; i < states.length; i += 1) {
    for (let j = i + 1; j < states.length; j += 1) {
      const repeat = states[i].opponents.has(states[j].id);
      if (repeat && !allowRepeats) continue;
      edges.push([i, j, edgeWeight(states[i], states[j], repeat)]);
    }
  }
  const mate = maxWeightMatching(edges, true);
  const pairs: [State, State][] = [];
  for (let i = 0; i < states.length; i += 1) {
    const j = mate[i] ?? -1;
    if (j === -1) return null;
    if (i < j) pairs.push([states[i], states[j]]);
  }
  return pairs;
}

/** Whether the players can be paired with no repeat at all (a quick matcher run). */
function pairableWithoutRepeats(states: State[]): boolean {
  return match(states, false) !== null;
}

function assignColors(a: State, b: State): [State, State] {
  const pa = colorPreference(a);
  const pb = colorPreference(b);
  // Satisfy the stronger preference first.
  const strength = (p: ReturnType<typeof colorPreference>) => (p ? (p.absolute ? 2 : 1) : 0);
  if (strength(pa) !== strength(pb)) {
    const [strong, other] = strength(pa) > strength(pb) ? [a, b] : [b, a];
    const pref = colorPreference(strong)!;
    return pref.color === "W" ? [strong, other] : [other, strong];
  }
  if (pa && pb && pa.color !== pb.color) return pa.color === "W" ? [a, b] : [b, a];
  // Equal preferences: the bigger colour imbalance gets its colour; else the higher rank decides.
  const da = colorDiff(a);
  const db = colorDiff(b);
  if (da !== db) return da < db ? [a, b] : [b, a];
  const [higher, lower] = a.rank < b.rank ? [a, b] : [b, a];
  if (higher.colors.length === 0) {
    // No colour history (round 1): alternate down the boards — the higher seed has White on
    // boards 1, 3, 5… and Black on 2, 4, 6… (`rank` is the board order in round 1).
    return higher.rank % 2 === 0 ? [higher, lower] : [lower, higher];
  }
  const last = higher.colors[higher.colors.length - 1];
  return last === "W" ? [lower, higher] : [higher, lower];
}

export function pairSwissRound(input: SwissInput): RoundPairings {
  const states = swissStates(input);
  const byes: RoundPairings["byes"] = [];
  let pool = states;

  if (states.length % 2 === 1) {
    // Lowest-ranked first; prefer one who hasn't had a bye and whose removal keeps the rest repeat-free.
    const fromBottom = [...states].reverse();
    const eligible = fromBottom.filter((s) => !s.hadBye);
    const candidates = eligible.length ? eligible : fromBottom;
    const chosen =
      candidates.find((c) => pairableWithoutRepeats(states.filter((s) => s !== c))) ?? candidates[0];
    byes.push({ kind: input.byeKind ?? "FULL", playerId: chosen.id });
    pool = states.filter((s) => s !== chosen);
  }

  const pairs = match(pool, false) ?? match(pool, true);
  if (!pairs) throw new Error("Swiss pairing failed: no perfect matching");

  const pairings: Pairing[] = pairs
    .map(([a, b]) => assignColors(a, b))
    .sort(([wa, ba], [wb, bb]) => {
      const topA = Math.max(wa.score, ba.score);
      const topB = Math.max(wb.score, bb.score);
      return topB - topA || Math.min(wa.rank, ba.rank) - Math.min(wb.rank, bb.rank);
    })
    .map(([white, black], i) => ({ blackId: black.id, board: i + 1, whiteId: white.id }));
  return { byes, pairings };
}

/**
 * Whether this round could be paired with no repeat at all, for some choice of
 * bye among the players who haven't had one (for tests and the round service's
 * "repeats were unavoidable" note).
 */
export function repeatFreePairingExists(input: SwissInput): boolean {
  const states = swissStates(input);
  if (states.length % 2 === 0) return pairableWithoutRepeats(states);
  const eligible = states.filter((s) => !s.hadBye);
  return (eligible.length ? eligible : states).some((c) => pairableWithoutRepeats(states.filter((s) => s !== c)));
}
