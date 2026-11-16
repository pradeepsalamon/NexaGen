/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { PUZZLE_STORM_CONFIG } from "@nexa-chess/types";
import { SoloPuzzleRushService } from "./solo-puzzle-rush.service";

const mockSelectRun = jest.fn();
let mockUser: Record<string, unknown> = { id: "s-1", role: UserRole.STUDENT, status: UserStatus.ACTIVE };

jest.mock("./puzzle-rush-run", () => ({
  MIN_RUN_SIZE: 20,
  selectPuzzleRushRun: (...args: unknown[]) => mockSelectRun(...args)
}));
jest.mock("../puzzle/puzzle-auth.helper", () => ({
  ...jest.requireActual("../puzzle/puzzle-auth.helper"),
  authenticateUser: async () => mockUser
}));
jest.mock("../tenancy/tenant-sql", () => ({ tenantFilter: () => ({ strings: [""], values: [] }) }));

const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
/** Ten 4-ply puzzles (2 player moves each). */
const PUZZLES = Array.from({ length: 10 }, (_, i) => ({
  fen: FEN,
  id: `p${i}`,
  moves: ["f1c4", "g8f6", "d2d3", "f8c5"],
  rating: 1000 + i * 100
}));

const runRow = (over: Record<string, unknown> = {}) => ({
  bestCombo: 0,
  endsAt: null,
  errors: 0,
  finishedAt: null,
  id: "run-1",
  mode: "STORM",
  moves: 0,
  playedAt: null,
  puzzleIndex: 0,
  puzzles: PUZZLES,
  score: 0,
  skipsUsed: 0,
  solved: 0,
  studentId: "s-1",
  ...over
});

const report = (over: Record<string, unknown> = {}) => ({
  bestCombo: 0,
  clockEndsAt: null,
  errors: 0,
  finished: false,
  highestRating: null,
  moves: 0,
  puzzleIndex: 0,
  score: 0,
  skipsUsed: 0,
  solved: 0,
  ...over
});

function build(prismaOver: Record<string, any> = {}) {
  const solo = {
    create: jest.fn(async ({ data }: any) => ({ id: "run-new", ...data })),
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    groupBy: jest.fn(async () => []),
    updateMany: jest.fn(async () => ({ count: 1 })),
    ...prismaOver.soloPuzzleRushRun
  };
  const prisma: any = {
    $queryRaw: jest.fn(async () => []),
    $transaction: jest.fn(async (fn: any) => fn({ soloPuzzleRushRun: solo })),
    batchStudent: {
      findMany: jest.fn(async () => [{ batch: { id: "b-1", name: "Beginners" } }]),
      ...prismaOver.batchStudent
    },
    soloPuzzleRushRun: solo,
    ...prismaOver.root
  };
  return { prisma, service: new SoloPuzzleRushService({} as any, prisma), solo };
}

describe("SoloPuzzleRushService", () => {
  beforeEach(() => {
    mockUser = { id: "s-1", role: UserRole.STUDENT, status: UserStatus.ACTIVE };
    mockSelectRun.mockReset().mockResolvedValue(PUZZLES.concat(PUZZLES, PUZZLES));
  });

  it("is for students only", async () => {
    mockUser = { id: "c-1", role: UserRole.COACH, status: UserStatus.ACTIVE };
    await expect(build().service.overview("t")).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("start", () => {
    it("refuses a student whose batches have training switched off", async () => {
      const { service } = build({ batchStudent: { findMany: jest.fn(async () => []) } });
      await expect(service.start("t", "STORM")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("is a 503 without the Lichess catalogue", async () => {
      mockSelectRun.mockResolvedValue(PUZZLES);
      await expect(build().service.start("t", "STORM")).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it("closes the student's abandoned run and freezes a new one", async () => {
      const { service, solo } = build();
      const run = await service.start("t", "RACER");
      expect(solo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { finishedAt: null, studentId: "s-1" } })
      );
      expect(run.endsAt).not.toBeNull();
      expect(Date.parse(run.startsAt)).toBeGreaterThan(Date.parse(run.serverTime));
      expect(run.puzzles).toHaveLength(30);
    });

    it("a Storm run has no end time (the player's own clock)", async () => {
      const run = await build().service.start("t", "STORM");
      expect(run.endsAt).toBeNull();
    });
  });

  describe("reportProgress", () => {
    it("treats another student's run as not found", async () => {
      const { service, solo } = build();
      solo.findFirst.mockResolvedValue(null);
      await expect(service.reportProgress("t", "run-1", report())).rejects.toBeInstanceOf(NotFoundException);
      expect(solo.findFirst).toHaveBeenCalledWith({ where: { id: "run-1", studentId: "s-1" } });
    });

    it("clamps an inflated Storm score to the puzzles actually reached", async () => {
      const { service, solo } = build();
      solo.findFirst.mockResolvedValue(runRow());
      const res = await service.reportProgress("t", "run-1", report({ moves: 500, puzzleIndex: 2, solved: 400 }));
      // 2 puzzles reached → at most 2 solved, and 3 puzzles' worth of moves (2 each).
      expect(res.score).toBe(2);
      expect((solo.updateMany.mock.calls as any[])[0][0].data).toMatchObject({ moves: 6, solved: 2, score: 2 });
    });

    it("caps a Racer score at moves plus the best possible combo bonus", async () => {
      const { service, solo } = build();
      solo.findFirst.mockResolvedValue(
        runRow({ endsAt: new Date(Date.now() + 60_000), mode: "RACER", startsAt: new Date() })
      );
      const res = await service.reportProgress("t", "run-1", report({ moves: 4, puzzleIndex: 1, score: 9999 }));
      expect(res.score).toBeLessThan(20);
    });

    it("refuses a Racer report after the race and its grace", async () => {
      const { service, solo } = build();
      solo.findFirst.mockResolvedValue(runRow({ endsAt: new Date(Date.now() - 60_000), mode: "RACER" }));
      await expect(service.reportProgress("t", "run-1", report())).rejects.toBeInstanceOf(ConflictException);
    });

    it("answers a repeat of the final report, but refuses other reports once finished", async () => {
      const { service, solo } = build();
      solo.findFirst.mockResolvedValue(runRow({ finishedAt: new Date(), score: 7 }));
      await expect(service.reportProgress("t", "run-1", report({ finished: true }))).resolves.toEqual({
        finished: true,
        score: 7
      });
      await expect(service.reportProgress("t", "run-1", report())).rejects.toBeInstanceOf(ConflictException);
    });

    it("never moves a total backwards and only writes unfinished rows forward", async () => {
      const { service, solo } = build();
      solo.findFirst.mockResolvedValue(runRow({ moves: 4, puzzleIndex: 2, score: 2, solved: 2 }));
      await service.reportProgress("t", "run-1", report({ moves: 2, puzzleIndex: 1, solved: 1 }));
      const call = (solo.updateMany.mock.calls as any[])[0][0];
      expect(call.data.score).toBe(2);
      expect(call.where).toMatchObject({ finishedAt: null, moves: { lte: 2 }, puzzleIndex: { lte: 1 } });
    });

    it("closes a Storm run reported after its clock ran out, and drops the stored puzzles", async () => {
      const { service, solo } = build();
      const longAgo = new Date(Date.now() - (PUZZLE_STORM_CONFIG.initialSeconds + 60) * 1000);
      solo.findFirst.mockResolvedValue(runRow({ playedAt: longAgo }));
      const res = await service.reportProgress("t", "run-1", report({ moves: 2, puzzleIndex: 1, solved: 1 }));
      expect(res.finished).toBe(true);
      expect((solo.updateMany.mock.calls as any[])[0][0].data.puzzles).toEqual([]);
    });
  });

  describe("leaderboard", () => {
    it("is not found for a batch the student isn't in", async () => {
      const { service } = build();
      await expect(
        service.leaderboard("t", { batchId: "other", mode: "STORM", period: "WEEK" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("ranks ties on score and errors together", async () => {
      const row = (id: string, score: number, errors: number) => ({
        achievedAt: new Date("2026-11-16T10:00:00Z"),
        bestCombo: 1,
        errors,
        firstName: id,
        lastName: null,
        moves: 5,
        score,
        studentId: id
      });
      const { service } = build({
        root: { $queryRaw: jest.fn(async () => [row("a", 9, 1), row("b", 9, 1), row("c", 5, 0)]) }
      });
      const res = await service.leaderboard("t", { batchId: "b-1", mode: "STORM", period: "ALL" });
      expect(res.rows.map((r) => [r.studentId, r.rank])).toEqual([
        ["a", 1],
        ["b", 1],
        ["c", 3]
      ]);
    });
  });
});
