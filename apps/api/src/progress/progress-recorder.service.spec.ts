import { addDays, liveStreak, nextPuzzleRating, nextStreak, PUZZLE_DIFFICULTY_RATINGS } from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { localDay, ProgressRecorderService } from "./progress-recorder.service";

describe("progress maths", () => {
  it("gains more for beating a harder puzzle", () => {
    const base = { rating: 1200, ratedPuzzles: 50, score: 1 };
    const hard = nextPuzzleRating({ ...base, opponentRating: PUZZLE_DIFFICULTY_RATINGS.EXPERT });
    const easy = nextPuzzleRating({ ...base, opponentRating: PUZZLE_DIFFICULTY_RATINGS.BEGINNER });
    expect(hard - 1200).toBeGreaterThan(easy - 1200);
    expect(easy).toBeGreaterThanOrEqual(1200);
  });

  it("moves a provisional rating faster", () => {
    const args = { opponentRating: PUZZLE_DIFFICULTY_RATINGS.INTERMEDIATE, rating: 1200, score: 0 };
    expect(nextPuzzleRating({ ...args, ratedPuzzles: 0 })).toBeLessThan(
      nextPuzzleRating({ ...args, ratedPuzzles: 100 })
    );
  });

  it("extends, keeps and restarts a streak", () => {
    expect(nextStreak(3, "2026-09-26", "2026-09-27")).toBe(4);
    expect(nextStreak(3, "2026-09-27", "2026-09-27")).toBe(3);
    expect(nextStreak(3, "2026-09-20", "2026-09-27")).toBe(1);
    expect(nextStreak(0, null, "2026-09-27")).toBe(1);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("shows a streak as broken once a day is missed", () => {
    expect(liveStreak(5, "2026-09-26", "2026-09-27")).toBe(5);
    expect(liveStreak(5, "2026-09-25", "2026-09-27")).toBe(0);
  });

  it("buckets the day in the student's own timezone", () => {
    const lateUtc = new Date("2026-09-27T20:00:00Z");
    expect(localDay("UTC", lateUtc)).toBe("2026-09-27");
    expect(localDay("Asia/Kolkata", lateUtc)).toBe("2026-09-28");
  });
});

describe("ProgressRecorderService", () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: ProgressRecorderService;
  const input = {
    attemptId: "att-1",
    difficulty: "INTERMEDIATE" as const,
    hintsUsed: 0,
    puzzleId: "pz-1",
    rating: null,
    solved: true,
    studentId: "stu-1",
    wrongMoves: 0
  };

  function buildPrisma() {
    return {
      user: { findUnique: jest.fn().mockResolvedValue({ timezone: "UTC" }) },
      studentProgress: {
        create: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          currentStreak: 2,
          lastActiveDay: new Date(`${addDays(localDay("UTC"), -1)}T00:00:00Z`),
          longestStreak: 2,
          peakRating: 1200,
          puzzleRating: 1200,
          ratedPuzzles: 0
        }),
        update: jest.fn()
      },
      puzzleRatingChange: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null)
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn()
    };
  }

  beforeEach(() => {
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    service = new ProgressRecorderService(prisma as unknown as PrismaService);
  });

  it("rates the first finished attempt and extends the streak", async () => {
    await service.recordPuzzleResult(input);
    expect(prisma.puzzleRatingChange.create).toHaveBeenCalled();
    const { data } = prisma.studentProgress.update.mock.calls[0][0];
    expect(data.puzzleRating).toBeGreaterThan(1200);
    expect(data.ratedPuzzles).toBe(1);
    expect(data.currentStreak).toBe(3);
    expect(data.longestStreak).toBe(3);
  });

  it("doesn't re-rate a puzzle the student already had rated", async () => {
    prisma.puzzleRatingChange.findUnique.mockResolvedValue({ id: "prev" });
    await service.recordPuzzleResult(input);
    expect(prisma.puzzleRatingChange.create).not.toHaveBeenCalled();
    const { data } = prisma.studentProgress.update.mock.calls[0][0];
    expect(data.puzzleRating).toBe(1200);
  });

  it("plays against the puzzle's own rating and records it", async () => {
    await service.recordPuzzleResult({ ...input, rating: 1450 });
    const { data } = prisma.puzzleRatingChange.create.mock.calls[0][0];
    expect(data.puzzleRating).toBe(1450);
    // 1200 with 0 rated (K = 40) beating a 1450 puzzle: +32
    expect(data.after).toBe(1232);
  });

  it("falls back to the difficulty bucket for an unrated puzzle", async () => {
    await service.recordPuzzleResult(input);
    const { data } = prisma.puzzleRatingChange.create.mock.calls[0][0];
    expect(data.puzzleRating).toBe(PUZZLE_DIFFICULTY_RATINGS.INTERMEDIATE);
  });

  it("scores a solve that needed a wrong move like a failure (D1)", async () => {
    await service.recordPuzzleResult({ ...input, wrongMoves: 1 });
    const afterWrong = prisma.puzzleRatingChange.create.mock.calls[0][0].data.after;
    prisma.puzzleRatingChange.create.mockClear();
    await service.recordPuzzleResult({ ...input, solved: false });
    const afterFailed = prisma.puzzleRatingChange.create.mock.calls[0][0].data.after;
    expect(afterWrong).toBeLessThan(1200);
    expect(afterWrong).toBe(afterFailed);
  });

  it("never throws into the submit that called it", async () => {
    prisma.$transaction.mockRejectedValue(new Error("db down"));
    await expect(service.recordPractice("stu-1")).resolves.toBeUndefined();
  });
});
