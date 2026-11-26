import {
  TACTIC_MOTIFS,
  WEAK_SPOT_LICHESS_THEMES,
  WEAK_SPOT_TIPS,
  LICHESS_THEMES,
  buildWeakSpotProfile,
  type PlayFinding,
  type PlaySource,
  type PlayTacticStats,
  type TrainingResult,
  type WeakSpotPlayItem
} from "@nexa-chess/types";

// The pure weak-spot rules in @nexa-chess/types weak-spots.ts (docs/WEAK_SPOTS.md).

const NOW = "2026-11-26T12:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3";

let nextId = 0;
function item(days: number, tactics: PlayTacticStats | null, findings: PlayFinding[] = [], source: PlaySource = "CLASS_BOARD"): WeakSpotPlayItem {
  nextId += 1;
  return { findings, playedAt: daysAgo(days), source, sourceId: `i${nextId}`, tactics };
}
const counts = (found: number, missed: number, alternative = 0, allowed = 0) => ({ allowed, alternative, found, missed });
const missedFork = (loss: number | null): PlayFinding => ({
  bestMoveSan: "Nd5",
  fenBefore: FEN,
  kind: "MISSED_TACTIC",
  motif: "FORK",
  playedSan: "a3",
  ply: 9,
  segment: 0,
  winPercentLoss: loss
});
const puzzle = (days: number, themes: string[], clean: boolean): TrainingResult => ({
  completedAt: daysAgo(days),
  hintsUsed: 0,
  solved: true,
  themes,
  wrongMoves: clean ? 0 : 1
});

describe("buildWeakSpotProfile", () => {
  it("calls a motif a weak spot only with enough chances, misses and different items", () => {
    const profile = buildWeakSpotProfile({
      items: [
        item(1, { FORK: counts(1, 2), PIN: counts(3, 0) }, [missedFork(30)]),
        item(5, { FORK: counts(0, 2), PIN: counts(2, 1) }, [missedFork(20)], "RUSH"),
        item(9, { FORK: counts(0, 2), PIN: counts(2, 0), SKEWER: counts(0, 2) }, [missedFork(null)])
      ],
      now: NOW,
      puzzles: []
    });
    expect(profile.weakSpots.map((m) => m.motif)).toEqual(["FORK"]);
    expect(profile.weakSpots[0]).toMatchObject({
      averageLoss: 25,
      itemsWithMiss: 3,
      missRate: 0.86,
      missed: 6,
      opportunities: 7,
      verdict: "WEAKNESS"
    });
    expect(profile.weakSpots[0].bySource).toEqual([
      { missed: 4, source: "CLASS_BOARD" },
      { missed: 2, source: "RUSH" }
    ]);
    // 7 of 8 pins found: a strength. 2 skewer chances: not enough to judge.
    expect(profile.strengths.map((m) => m.motif)).toEqual(["PIN"]);
    expect(profile.others.find((m) => m.motif === "SKEWER")).toMatchObject({ missRate: null, verdict: "NOT_ENOUGH_DATA" });
  });

  it("never calls it a weak spot when the misses sit in fewer than three items", () => {
    const profile = buildWeakSpotProfile({ items: [item(1, { FORK: counts(0, 4) }), item(2, { FORK: counts(1, 2) })], now: NOW, puzzles: [] });
    expect(profile.weakSpots).toEqual([]);
    expect(profile.others[0]).toMatchObject({ motif: "FORK", verdict: "NEUTRAL" });
  });

  it("ranks weak spots by what they cost: misses × average loss", () => {
    const pinMiss = (loss: number): PlayFinding => ({ ...missedFork(loss), motif: "PIN" });
    const profile = buildWeakSpotProfile({
      items: [1, 2, 3].map((d) => item(d, { FORK: counts(0, 2), PIN: counts(0, 2) }, [missedFork(5), pinMiss(40)])),
      now: NOW,
      puzzles: []
    });
    expect(profile.weakSpots.map((m) => m.motif)).toEqual(["PIN", "FORK"]);
  });

  it("reads only the window, and rates only from reviews that carry chance counts", () => {
    const profile = buildWeakSpotProfile({
      items: [item(1, { FORK: counts(1, 0) }), item(2, null, [missedFork(10)]), item(61, { FORK: counts(0, 9) })],
      now: NOW,
      puzzles: []
    });
    expect(profile).toMatchObject({ itemsWithStats: 1, reviewedItems: 2, windowDays: 60 });
    // The old review's miss is an example, but not a counted chance.
    expect(profile.others[0]).toMatchObject({ missed: 0, motif: "FORK", opportunities: 1 });
    expect(profile.others[0].examples).toHaveLength(1);
  });

  it("shows a trend only with enough chances in both halves", () => {
    const better = buildWeakSpotProfile({
      items: [item(40, { FORK: counts(0, 5) }), item(5, { FORK: counts(4, 1) })],
      now: NOW,
      puzzles: []
    });
    expect(better.others[0].trend).toBe("BETTER");
    const thin = buildWeakSpotProfile({ items: [item(40, { FORK: counts(0, 5) }), item(5, { FORK: counts(1, 1) })], now: NOW, puzzles: [] });
    expect(thin.others[0].trend).toBeNull();
  });

  it("takes examples newest first, one per item, at most three", () => {
    const items = [1, 2, 3, 4].map((d) => item(d, { FORK: counts(0, 2) }, [missedFork(10), missedFork(20)]));
    const profile = buildWeakSpotProfile({ items, now: NOW, puzzles: [] });
    expect(profile.weakSpots[0].examples.map((e) => e.sourceId)).toEqual(items.slice(0, 3).map((i) => i.sourceId));
  });

  it("counts puzzles of the motif's themes, and clean solves among them", () => {
    const profile = buildWeakSpotProfile({
      items: [item(1, { FORK: counts(1, 0) })],
      now: NOW,
      puzzles: [puzzle(1, ["fork", "short"], true), puzzle(2, ["fork"], false), puzzle(3, ["pin"], true), puzzle(70, ["fork"], true)]
    });
    expect(profile.puzzleAttempts).toBe(3);
    expect(profile.others[0].puzzles).toEqual({ attempts: 2, clean: 1 });
  });

  it("has a tip and real Lichess themes for every motif", () => {
    const known = new Set(LICHESS_THEMES.map((t) => t.key));
    for (const motif of TACTIC_MOTIFS) {
      expect(WEAK_SPOT_TIPS[motif].length).toBeGreaterThan(20);
      for (const theme of WEAK_SPOT_LICHESS_THEMES[motif]) expect(known.has(theme)).toBe(true);
    }
  });
});
