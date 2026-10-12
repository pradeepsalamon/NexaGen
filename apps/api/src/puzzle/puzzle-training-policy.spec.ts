import {
  TRAINING_MAX_RATING,
  TRAINING_MIN_RATING,
  leastSeenTheme,
  planTrainingPick,
  trainingBandOrder,
  trainingTargetRating,
  weakestTheme,
  type TrainingResult
} from "@nexa-chess/types";

// The pure training policy (spec §12) lives in @nexa-chess/types; the API is
// its only caller, so it is specced here beside PuzzleTrainingService.

const result = (over: Partial<TrainingResult> = {}): TrainingResult => ({
  completedAt: "2026-10-10T10:00:00.000Z",
  hintsUsed: 0,
  solved: true,
  themes: [],
  wrongMoves: 0,
  ...over
});
const clean = (n: number, themes: string[] = []) => Array.from({ length: n }, () => result({ themes }));
const missed = (n: number, themes: string[] = []) => Array.from({ length: n }, () => result({ solved: false, themes }));

describe("trainingTargetRating", () => {
  it("stays at the rating until ten training results exist", () => {
    expect(trainingTargetRating(1300, clean(9))).toBe(1300);
  });

  it.each([
    // clean of the last ten, offset
    [10, 75],
    [8, 75],
    [7, 0],
    [5, 0],
    [4, -75],
    [0, -75]
  ])("%i clean of ten moves the target by %i", (n, offset) => {
    expect(trainingTargetRating(1300, [...clean(n), ...missed(10 - n)])).toBe(1300 + offset);
  });

  it("only looks at the ten most recent", () => {
    expect(trainingTargetRating(1300, [...clean(10), ...missed(30)])).toBe(1375);
  });

  it("counts hints and wrong moves as not clean", () => {
    const slips = [...clean(4), ...Array.from({ length: 6 }, () => result({ hintsUsed: 1 }))];
    expect(trainingTargetRating(1300, slips)).toBe(1225);
  });

  it("clamps to the training range", () => {
    expect(trainingTargetRating(200, [])).toBe(TRAINING_MIN_RATING);
    expect(trainingTargetRating(3000, clean(10))).toBe(TRAINING_MAX_RATING);
  });
});

describe("weakestTheme", () => {
  it("needs five recent attempts of a theme to judge it", () => {
    expect(weakestTheme(1500, missed(4, ["fork"]))).toBeNull();
  });

  it("picks the lowest smoothed clean rate", () => {
    const recent = [...missed(5, ["pin"]), ...clean(3, ["fork"]), ...missed(2, ["fork"])];
    expect(weakestTheme(1500, recent)).toBe("pin");
  });

  it("breaks a tie on the theme met least recently", () => {
    const recent = [...missed(5, ["pin"]), ...missed(5, ["fork"])];
    expect(weakestTheme(1500, recent)).toBe("fork");
  });

  it("ignores themes above the student's level and non-motif tags", () => {
    expect(weakestTheme(1000, missed(6, ["zugzwang"]))).toBeNull();
    expect(weakestTheme(1000, missed(6, ["endgame", "short"]))).toBeNull();
  });
});

describe("leastSeenTheme", () => {
  it("returns a theme never met before the ones already practised", () => {
    const theme = leastSeenTheme(1500, clean(3, ["smotheredMate"]));
    expect(theme).not.toBe("smotheredMate");
    expect(theme).toBeTruthy();
  });
});

describe("planTrainingPick", () => {
  const base = { rating: 1300, recentAll: [], recentTraining: [], reviewDue: false };

  it("follows the slot cycle with its rating offset", () => {
    const weakHistory = missed(6, ["fork"]);
    expect(planTrainingPick({ ...base, recentAll: weakHistory, trainingCount: 0 })).toEqual({
      slot: "WEAK",
      targetRating: 1250,
      theme: "fork"
    });
    expect(planTrainingPick({ ...base, trainingCount: 2 })).toEqual({ slot: "MIXED", targetRating: 1350, theme: null });
  });

  it("serves a review only when one is due, else a weak spot", () => {
    expect(planTrainingPick({ ...base, reviewDue: true, trainingCount: 6 })).toMatchObject({ slot: "REVIEW", theme: null });
    expect(planTrainingPick({ ...base, recentAll: missed(6, ["pin"]), trainingCount: 6 })).toMatchObject({
      slot: "WEAK",
      theme: "pin"
    });
  });

  it("falls back WEAK → EXPLORE when there is too little history", () => {
    expect(planTrainingPick({ ...base, trainingCount: 0 })).toMatchObject({ slot: "EXPLORE", targetRating: 1300 });
  });

  it("lets a requested theme override the cycle", () => {
    expect(planTrainingPick({ ...base, requestedTheme: "skewer", trainingCount: 6 })).toEqual({
      slot: "MIXED",
      targetRating: 1300,
      theme: "skewer"
    });
  });
});

describe("trainingBandOrder", () => {
  it("walks the target band, then out by one and two", () => {
    expect(trainingBandOrder(1320)).toEqual([26, 27, 25, 28, 24]);
  });

  it("never goes below band zero", () => {
    expect(trainingBandOrder(40)).toEqual([0, 1, 2]);
  });
});
