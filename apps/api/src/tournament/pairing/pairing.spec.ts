import { arenaPairings, arenaTally } from "./arena";
import { maxWeightMatching, type WeightedEdge } from "./blossom";
import { bracketRounds, bracketSize, firstRoundMatches, knockoutMatchState, nextSlot, seedSlots } from "./knockout";
import { roundRobinSchedule } from "./round-robin";
import { computeStandings, ratingDifferenceFor } from "./standings";
import { pairSwissRound, repeatFreePairingExists } from "./swiss";
import { colorOf, seedOrder, type GameRecord, type PairingPlayer } from "./types";

// A small deterministic PRNG, so a failing property test reproduces.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("maxWeightMatching (blossom)", () => {
  // Brute force: every matching of a small graph.
  function best(n: number, edges: WeightedEdge[], maxCardinality: boolean) {
    let bestCard = -1;
    let bestWeight = -Infinity;
    const used = new Array(n).fill(false);
    const go = (k: number, card: number, weight: number) => {
      if (k === edges.length) {
        if (maxCardinality ? card > bestCard || (card === bestCard && weight > bestWeight) : weight > bestWeight) {
          bestCard = card;
          bestWeight = weight;
        }
        return;
      }
      go(k + 1, card, weight);
      const [i, j, w] = edges[k];
      if (!used[i] && !used[j]) {
        used[i] = used[j] = true;
        go(k + 1, card + 1, weight + w);
        used[i] = used[j] = false;
      }
    };
    go(0, 0, 0);
    return { card: bestCard, weight: bestWeight };
  }

  const evaluate = (mate: number[], edges: WeightedEdge[]) => {
    let card = 0;
    let weight = 0;
    for (const [i, j, w] of edges) {
      if (mate[i] === j) {
        expect(mate[j]).toBe(i);
        card += 1;
        weight += w;
      }
    }
    return { card, weight };
  };

  it("matches known small cases", () => {
    expect(maxWeightMatching([[0, 1, 1]])).toEqual([1, 0]);
    expect(maxWeightMatching([[0, 1, 10], [1, 2, 11]])).toEqual([-1, 2, 1]);
    // Max cardinality beats weight.
    expect(maxWeightMatching([[0, 1, 2], [0, 2, 1], [1, 3, 1]], true)).toEqual([2, 3, 0, 1]);
  });

  it.each([false, true])("agrees with brute force on random graphs (maxCardinality=%s)", (maxCardinality) => {
    const random = rng(maxCardinality ? 7 : 3);
    for (let trial = 0; trial < 300; trial += 1) {
      const n = 2 + Math.floor(random() * 7);
      const edges: WeightedEdge[] = [];
      for (let i = 0; i < n; i += 1)
        for (let j = i + 1; j < n; j += 1) if (random() < 0.6) edges.push([i, j, 1 + Math.floor(random() * 20)]);
      if (edges.length === 0 || edges.length > 16) continue;
      const mate = maxWeightMatching(edges, maxCardinality);
      expect(evaluate(mate, edges)).toEqual(best(n, edges, maxCardinality));
    }
  });
});

// ── Swiss ──

type Sim = { players: PairingPlayer[]; games: GameRecord[] };

function players(n: number, random: () => number): PairingPlayer[] {
  const list = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, rating: random() < 0.15 ? null : 800 + Math.floor(random() * 1600) }));
  return seedOrder(list).map((p, i) => ({ ...p, seed: i + 1 }));
}

/** Plays a whole Swiss with random (rating-weighted) results and occasional withdrawals. */
function simulateSwiss(n: number, rounds: number, seed: number): Sim & { roundsPaired: number } {
  const random = rng(seed);
  let active = players(n, random);
  const all = [...active];
  const games: GameRecord[] = [];
  let roundsPaired = 0;
  for (let round = 1; round <= rounds && active.length >= 2; round += 1) {
    const { pairings, byes } = pairSwissRound({ games, players: active, round });
    roundsPaired += 1;
    // A repeat only when no repeat-free pairing of this round exists.
    const repeated = pairings.some((p) =>
      games.some((g) => [g.whiteId, g.blackId].sort().join("|") === [p.whiteId, p.blackId].sort().join("|"))
    );
    if (repeated) expect(repeatFreePairingExists({ games, players: active, round })).toBe(false);
    // Nobody gets a second bye while someone without one remains.
    for (const bye of byes) {
      const had = games.some((g) => g.blackId === null && g.whiteId === bye.playerId);
      const someoneFresh = active.some((p) => !games.some((g) => g.blackId === null && g.whiteId === p.id));
      if (had) expect(someoneFresh).toBe(false);
    }
    for (const bye of byes) games.push({ blackHalfPoints: null, blackId: null, played: false, round, whiteHalfPoints: 2, whiteId: bye.playerId });
    for (const p of pairings) {
      const r = random();
      const [w, b] = r < 0.42 ? [2, 0] : r < 0.84 ? [0, 2] : [1, 1];
      games.push({ blackHalfPoints: b, blackId: p.blackId, played: true, round, whiteHalfPoints: w, whiteId: p.whiteId });
    }
    if (random() < 0.2 && active.length > 3) active = active.filter((_, i) => i !== Math.floor(random() * active.length));
  }
  return { games, players: all, roundsPaired };
}

describe("Swiss pairing", () => {
  it("round 1: top half against bottom half, colours alternating down the boards", () => {
    const list = Array.from({ length: 8 }, (_, i) => ({ id: `s${i + 1}`, rating: 2000 - i * 50, seed: i + 1 }));
    const { pairings, byes } = pairSwissRound({ games: [], players: list, round: 1 });
    expect(byes).toEqual([]);
    expect(pairings).toEqual([
      { blackId: "s5", board: 1, whiteId: "s1" },
      { blackId: "s2", board: 2, whiteId: "s6" },
      { blackId: "s7", board: 3, whiteId: "s3" },
      { blackId: "s4", board: 4, whiteId: "s8" }
    ]);
  });

  it("gives the bye to the lowest-ranked player, never twice", () => {
    const list = Array.from({ length: 5 }, (_, i) => ({ id: `s${i + 1}`, rating: 2000 - i * 50, seed: i + 1 }));
    const r1 = pairSwissRound({ games: [], players: list, round: 1 });
    expect(r1.byes).toEqual([{ kind: "FULL", playerId: "s5" }]);
    const games: GameRecord[] = [
      { blackHalfPoints: null, blackId: null, played: false, round: 1, whiteHalfPoints: 2, whiteId: "s5" },
      ...r1.pairings.map((p) => ({ blackHalfPoints: 0, blackId: p.blackId, played: true, round: 1, whiteHalfPoints: 2, whiteId: p.whiteId }))
    ];
    const r2 = pairSwissRound({ games, players: list, round: 2 });
    expect(r2.byes[0].playerId).not.toBe("s5");
  });

  it("pairs equal scores together and balances colours", () => {
    const list = Array.from({ length: 4 }, (_, i) => ({ id: `s${i + 1}`, rating: 2000 - i * 50, seed: i + 1 }));
    // Round 1: s1-s3 (s1 wins), s4-s2 (s2 wins as Black).
    const games: GameRecord[] = [
      { blackHalfPoints: 0, blackId: "s3", played: true, round: 1, whiteHalfPoints: 2, whiteId: "s1" },
      { blackHalfPoints: 2, blackId: "s2", played: true, round: 1, whiteHalfPoints: 0, whiteId: "s4" }
    ];
    const { pairings } = pairSwissRound({ games, players: list, round: 2 });
    const pairsOf = pairings.map((p) => [p.whiteId, p.blackId].sort().join("-")).sort();
    expect(pairsOf).toEqual(["s1-s2", "s3-s4"]);
    const top = pairings.find((p) => [p.whiteId, p.blackId].includes("s1"))!;
    expect(top.whiteId).toBe("s2"); // s1 had White, s2 had Black
    expect(top.board).toBe(1);
  });

  it.each([2, 3, 7, 8, 13, 20, 33, 60])("property: %i players over a full event", (n) => {
    for (let seed = 1; seed <= 6; seed += 1) {
      const rounds = Math.min(11, Math.max(1, Math.ceil(Math.log2(n)) + 2));
      const { games, players: field } = simulateSwiss(n, rounds, seed * 97 + n);
      const byRound = new Map<number, GameRecord[]>();
      for (const g of games) byRound.set(g.round, [...(byRound.get(g.round) ?? []), g]);
      const met = new Map<string, number>();
      const byes = new Map<string, number>();
      for (const [round, roundGames] of byRound) {
        // Nobody twice in a round.
        const seen = roundGames.flatMap((g) => [g.whiteId, g.blackId].filter(Boolean));
        expect(new Set(seen).size).toBe(seen.length);
        // At most one bye per round.
        expect(roundGames.filter((g) => g.blackId === null).length).toBeLessThanOrEqual(1);
        for (const g of roundGames) {
          if (g.blackId === null) byes.set(g.whiteId, (byes.get(g.whiteId) ?? 0) + 1);
          else {
            const key = [g.whiteId, g.blackId].sort().join("|");
            met.set(key, (met.get(key) ?? 0) + 1);
          }
        }
        expect(round).toBeGreaterThan(0);
      }
      // (Repeats and second byes are checked round by round in simulateSwiss.)
      expect(met.size + byes.size).toBeGreaterThan(0);
      // Colour difference stays within 2 for everyone.
      for (const p of field) {
        const colours = games.map((g) => colorOf(g, p.id)).filter(Boolean);
        const diff = colours.filter((c) => c === "W").length - colours.filter((c) => c === "B").length;
        expect(Math.abs(diff)).toBeLessThanOrEqual(2);
      }
    }
  });

  it("is fast enough for a large field", () => {
    const started = Date.now();
    simulateSwiss(200, 9, 42);
    expect(Date.now() - started).toBeLessThan(20_000);
  });
});

// ── Round robin ──

describe("round robin", () => {
  it.each([2, 3, 4, 5, 8, 11, 16])("%i players: everyone meets everyone once, nobody twice in a round", (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const schedule = roundRobinSchedule(ids);
    expect(schedule).toHaveLength(n % 2 === 0 ? n - 1 : n);
    const met = new Map<string, number>();
    const byeCount = new Map<string, number>();
    for (const round of schedule) {
      const seen = round.pairings.flatMap((p) => [p.whiteId, p.blackId]);
      expect(new Set(seen).size).toBe(seen.length);
      if (round.byeId) byeCount.set(round.byeId, (byeCount.get(round.byeId) ?? 0) + 1);
      for (const p of round.pairings) {
        const key = [p.whiteId, p.blackId].sort().join("|");
        met.set(key, (met.get(key) ?? 0) + 1);
      }
    }
    expect(met.size).toBe((n * (n - 1)) / 2);
    expect([...met.values()].every((c) => c === 1)).toBe(true);
    if (n % 2 === 1) expect([...byeCount.values()].every((c) => c === 1) && byeCount.size === n).toBe(true);
    // Colour balance within 2.
    for (const id of ids) {
      const w = schedule.flatMap((r) => r.pairings).filter((p) => p.whiteId === id).length;
      const b = schedule.flatMap((r) => r.pairings).filter((p) => p.blackId === id).length;
      expect(Math.abs(w - b)).toBeLessThanOrEqual(1);
    }
  });

  it("a double round robin swaps colours in the second cycle", () => {
    const schedule = roundRobinSchedule(["a", "b", "c", "d"], 2);
    expect(schedule).toHaveLength(6);
    const first = schedule[0].pairings[0];
    const mirror = schedule[3].pairings[0];
    expect([mirror.whiteId, mirror.blackId]).toEqual([first.blackId, first.whiteId]);
  });
});

// ── Knockout ──

describe("knockout", () => {
  it("sizes and seeds the bracket so 1 and 2 meet only in the final", () => {
    expect([bracketSize(2), bracketSize(5), bracketSize(8), bracketSize(9)]).toEqual([2, 8, 8, 16]);
    expect(bracketRounds(9)).toBe(4);
    expect(seedSlots(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const slots = seedSlots(16);
    expect(slots.indexOf(1) < 8).toBe(true);
    expect(slots.indexOf(2) >= 8).toBe(true);
  });

  it("gives byes to the top seeds", () => {
    const ids = ["s1", "s2", "s3", "s4", "s5", "s6"];
    const matches = firstRoundMatches(ids);
    expect(matches).toHaveLength(4);
    const byes = matches.filter((m) => m.bId === null).map((m) => m.aId);
    expect(byes.sort()).toEqual(["s1", "s2"]);
    expect(matches.every((m) => m.aId !== null)).toBe(true);
  });

  it("routes winners to the right next slot", () => {
    expect(nextSlot(0)).toEqual({ side: "A", slot: 0 });
    expect(nextSlot(1)).toEqual({ side: "B", slot: 0 });
    expect(nextSlot(5)).toEqual({ side: "B", slot: 2 });
  });

  it("best of N with alternating colours, an early decision, sudden death, then the higher seed", () => {
    const cfg = { gamesPerMatch: 2, tiebreak: "SUDDEN_DEATH" as const };
    expect(knockoutMatchState(cfg, [])).toEqual({ aWhite: true, status: "NEXT_GAME", suddenDeath: false });
    expect(knockoutMatchState(cfg, [{ aHalfPoints: 1, aWhite: true, bHalfPoints: 1 }])).toEqual({ aWhite: false, status: "NEXT_GAME", suddenDeath: false });
    const level = [
      { aHalfPoints: 1, aWhite: true, bHalfPoints: 1 },
      { aHalfPoints: 1, aWhite: false, bHalfPoints: 1 }
    ];
    expect(knockoutMatchState(cfg, level)).toEqual({ aWhite: true, status: "NEXT_GAME", suddenDeath: true });
    expect(knockoutMatchState(cfg, [...level, { aHalfPoints: 0, aWhite: true, bHalfPoints: 2 }])).toEqual({ by: "GAMES", status: "DECIDED", winner: "B" });
    const draws = [...level, ...Array.from({ length: 3 }, (_, i) => ({ aHalfPoints: 1, aWhite: i % 2 === 0, bHalfPoints: 1 }))];
    expect(knockoutMatchState(cfg, draws)).toEqual({ by: "SEED", status: "DECIDED", winner: "A" });
    expect(knockoutMatchState({ gamesPerMatch: 1, tiebreak: "HIGHER_SEED" }, [{ aHalfPoints: 1, aWhite: true, bHalfPoints: 1 }])).toEqual({ by: "SEED", status: "DECIDED", winner: "A" });
    // Best of 3 is decided after 2 wins.
    expect(knockoutMatchState({ gamesPerMatch: 3, tiebreak: "SUDDEN_DEATH" }, [
      { aHalfPoints: 0, aWhite: true, bHalfPoints: 2 },
      { aHalfPoints: 0, aWhite: false, bHalfPoints: 2 }
    ])).toEqual({ by: "GAMES", status: "DECIDED", winner: "B" });
  });

  it("property: every bracket produces exactly one champion", () => {
    const random = rng(11);
    for (let n = 2; n <= 40; n += 1) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      let round = firstRoundMatches(ids).map((m) => [m.aId, m.bId] as const);
      while (round.length > 1 || (round.length === 1 && round[0][1] !== undefined && round[0][0] !== null && round[0][1] !== null)) {
        const winners = round.map(([a, b]) => (a === null ? b : b === null ? a : random() < 0.5 ? a : b));
        if (winners.length === 1) {
          round = [[winners[0], undefined as unknown as null]];
          break;
        }
        const next: [string | null, string | null][] = [];
        for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
        round = next;
      }
      const champion = round[0][0] ?? round[0][1];
      expect(ids).toContain(champion);
    }
  });
});

// ── Arena ──

describe("arena", () => {
  const cfg = { berserk: true, streaks: true };
  const win = { berserk: false, halfPoints: 2, plies: 40 };
  const draw = { berserk: false, halfPoints: 1, plies: 40 };
  const loss = { berserk: false, halfPoints: 0, plies: 40 };

  it("win 2, draw 1; doubled on fire after two wins until a non-win", () => {
    expect(arenaTally(cfg, [win, win, win, draw, win]).sheet).toEqual([2, 2, 4, 2, 2]);
    expect(arenaTally(cfg, [win, win, loss, win]).sheet).toEqual([2, 2, 0, 2]);
    expect(arenaTally({ ...cfg, streaks: false }, [win, win, win]).points).toBe(6);
    expect(arenaTally(cfg, [win, win]).onFire).toBe(true);
  });

  it("a quick draw scores nothing; a berserk win of 7+ moves scores +1", () => {
    expect(arenaTally(cfg, [{ ...draw, plies: 10 }]).points).toBe(0);
    expect(arenaTally(cfg, [{ ...win, berserk: true }]).points).toBe(3);
    expect(arenaTally(cfg, [{ ...win, berserk: true, plies: 10 }]).points).toBe(2);
    expect(arenaTally({ ...cfg, berserk: false }, [{ ...win, berserk: true }]).points).toBe(2);
  });

  it("pairs neighbours in the standings and avoids an immediate rematch", () => {
    const pairs = arenaPairings([
      { colorDiff: 0, id: "a", lastOpponentId: "b", rank: 0 },
      { colorDiff: 0, id: "b", lastOpponentId: "a", rank: 1 },
      { colorDiff: 1, id: "c", lastOpponentId: null, rank: 2 },
      { colorDiff: -1, id: "d", lastOpponentId: null, rank: 3 }
    ]);
    const keys = pairs.map((p) => [p.whiteId, p.blackId].sort().join("-")).sort();
    expect(keys).toEqual(["a-c", "b-d"]);
    // c had more Whites than a, so a has White.
    expect(pairs.find((p) => p.whiteId === "a" || p.blackId === "a")).toEqual({ blackId: "c", whiteId: "a" });
    // Only two waiting: the rematch is allowed.
    expect(arenaPairings([
      { colorDiff: 0, id: "a", lastOpponentId: "b", rank: 0 },
      { colorDiff: 0, id: "b", lastOpponentId: "a", rank: 1 }
    ])).toHaveLength(1);
  });
});

// ── Standings ──

describe("standings and tiebreaks", () => {
  const field = [
    { id: "a", rating: 2000, seed: 1 },
    { id: "b", rating: 1900, seed: 2 },
    { id: "c", rating: 1800, seed: 3 },
    { id: "d", rating: 1700, seed: 4 }
  ];
  const g = (round: number, w: string, b: string, wp: number): GameRecord => ({
    blackHalfPoints: 2 - wp,
    blackId: b,
    played: true,
    round,
    whiteHalfPoints: wp,
    whiteId: w
  });
  // a beats c and d, draws b; b beats c and d; c beats d.
  const games = [g(1, "a", "c", 2), g(1, "b", "d", 2), g(2, "a", "b", 1), g(2, "c", "d", 2), g(3, "d", "a", 0), g(3, "c", "b", 0)];

  it("ranks by points, then the tiebreaks in order", () => {
    const rows = computeStandings({ format: "SWISS", games, players: field, tiebreaks: ["BUCHHOLZ", "SONNEBORN_BERGER", "WINS"] });
    // a and b are equal on every tiebreak (Buchholz 7, SB 4.5, 2 wins): a shared first place.
    expect(rows.map((r) => [r.playerId, r.points, r.rank])).toEqual([
      ["a", 5, 1],
      ["b", 5, 1],
      ["c", 2, 3],
      ["d", 0, 4]
    ]);
    const a = rows[0];
    // Buchholz of a: c(2) + b(5) + d(0) = 7 half-points.
    expect(a.tiebreaks.BUCHHOLZ).toBe(7);
    // SB of a: beat c (2) + half of b (5/2) + beat d (0) = 4.5.
    expect(a.tiebreaks.SONNEBORN_BERGER).toBe(4.5);
    expect([a.wins, a.draws, a.losses]).toEqual([2, 1, 0]);
  });

  it("shares a rank when every tiebreak is equal", () => {
    const rows = computeStandings({ format: "SWISS", games: [g(1, "a", "b", 1)], players: field.slice(0, 2), tiebreaks: ["WINS"] });
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });

  it("direct encounter breaks a tie between the two who played", () => {
    const tied = [g(1, "a", "b", 0), g(2, "a", "c", 2), g(2, "b", "d", 0), g(1, "c", "d", 1)];
    const rows = computeStandings({ format: "ROUND_ROBIN", games: tied, players: field, tiebreaks: ["DIRECT_ENCOUNTER"] });
    // d 3, then a and b on 2 each: b won their game, so b is ahead.
    expect(rows.map((r) => r.playerId)).toEqual(["d", "b", "a", "c"]);
  });

  it("a bye counts for points but not as a win or a played game; Buchholz uses a virtual opponent", () => {
    const withBye: GameRecord[] = [
      { blackHalfPoints: null, blackId: null, played: false, round: 1, whiteHalfPoints: 2, whiteId: "a" },
      g(2, "a", "b", 2)
    ];
    const rows = computeStandings({ format: "SWISS", games: withBye, players: field.slice(0, 2), tiebreaks: ["BUCHHOLZ", "WINS"] });
    const a = rows.find((r) => r.playerId === "a")!;
    expect([a.points, a.played, a.wins]).toEqual([4, 1, 1]);
    // Opponents: b (0) + virtual (own 4).
    expect(a.tiebreaks.BUCHHOLZ).toBe(4);
  });

  it("arena standings come from the streak rules", () => {
    const arenaGames = [
      { ...g(1, "a", "b", 2), finishedOrder: 1, plies: 40 },
      { ...g(1, "a", "c", 2), finishedOrder: 2, plies: 40 },
      { ...g(1, "a", "d", 2), finishedOrder: 3, plies: 40 }
    ];
    const rows = computeStandings({ arenaConfig: { berserk: true, streaks: true }, format: "ARENA", games: arenaGames, players: field, tiebreaks: [] });
    expect(rows[0]).toMatchObject({ onFire: true, playerId: "a", points: 8, streak: 3 });
  });

  it("performance and the rating difference table", () => {
    expect(ratingDifferenceFor(0.5)).toBe(0);
    expect(ratingDifferenceFor(1)).toBe(798);
    expect(ratingDifferenceFor(0.75)).toBe(191);
    const rows = computeStandings({ format: "SWISS", games, players: field, tiebreaks: ["PERFORMANCE"] });
    expect(rows.find((r) => r.playerId === "d")!.performance).toBeLessThan(1700);
  });
});
