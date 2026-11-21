/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { PUZZLE_STORM_CONFIG } from "@nexa-chess/types";
import { type BatchBattleSqlRow, leaderboardName, rankBatchBattles, SoloPuzzleRushService } from "./solo-puzzle-rush.service";

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

  describe("overview", () => {
    it("returns all-time and this-week bests, the week from the leaderboard's 7-day window", async () => {
      const { service, solo } = build();
      const done = new Date("2026-11-16T10:00:00Z");
      solo.groupBy.mockImplementation(async ({ where }: any) =>
        where.finishedAt.gte ? [{ _max: { score: 7 }, mode: "STORM" }] : [{ _max: { score: 12 }, mode: "STORM" }]
      );
      solo.findFirstOrThrow.mockResolvedValue({ finishedAt: done });
      const before = Date.now();
      const res = await service.overview("t");
      expect(res.bests).toEqual([{ achievedAt: done.toISOString(), mode: "STORM", score: 12 }]);
      expect(res.weekBests).toEqual([{ achievedAt: done.toISOString(), mode: "STORM", score: 7 }]);
      const weekCall = solo.groupBy.mock.calls.map((c: any) => c[0]).find((q: any) => q.where.finishedAt.gte);
      const since = weekCall.where.finishedAt.gte.getTime();
      expect(before - since).toBeGreaterThanOrEqual(7 * 24 * 3600 * 1000 - 1000);
      expect(weekCall.where.studentId).toBe("s-1");
    });

    it("has no week bests when nothing was finished this week", async () => {
      const res = await build().service.overview("t");
      expect(res.weekBests).toEqual([]);
      expect(res.enabled).toBe(true);
    });
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

    it("shows first name and last initial only (students are minors)", async () => {
      const { service } = build({
        root: {
          $queryRaw: jest.fn(async () => [
            { achievedAt: new Date(), bestCombo: 1, errors: 0, firstName: "Arjun", lastName: "kumar", moves: 5, score: 9, studentId: "a" }
          ])
        }
      });
      const res = await service.leaderboard("t", { batchId: "b-1", mode: "STORM", period: "WEEK" });
      expect(res.rows[0].name).toBe("Arjun K.");
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

  describe("batchBattles", () => {
    it("refuses a student with no training batch", async () => {
      const { service } = build({ batchStudent: { findMany: jest.fn(async () => []) } });
      await expect(service.batchBattles("t", { mode: "STORM", period: "WEEK" })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns the ranked board with the student's best score", async () => {
      const { service } = build({
        root: { $queryRaw: jest.fn(async () => [battleRow({ batchId: "b-1", batchName: "Beginners", players: 3 })]) },
        soloPuzzleRushRun: { aggregate: jest.fn(async () => ({ _max: { score: 15 } })) }
      });
      const res = await service.batchBattles("t", { mode: "STORM", period: "WEEK" });
      expect(res).toMatchObject({ minPlayers: 3, mode: "STORM", myBest: 15, period: "WEEK" });
      expect(res.rows.map((r) => [r.batchId, r.rank, r.isMyBatch])).toEqual([["b-1", 1, true]]);
    });
  });

  describe("updateBattleSettings", () => {
    const updated = { _count: { students: 8 }, batchType: null, battlesEnabled: false, battlesShowNames: true, id: "b-1" };

    it("lets a coach change only a batch they are assigned to", async () => {
      mockUser = { id: "c-1", role: UserRole.COACH, status: UserStatus.ACTIVE };
      const batch = { findFirst: jest.fn(async (_args: any) => null), update: jest.fn() };
      const { service } = build({ root: { batch } });
      await expect(service.updateBattleSettings("t", "b-9", { battlesEnabled: true })).rejects.toBeInstanceOf(NotFoundException);
      expect(batch.findFirst.mock.calls[0][0].where).toEqual({
        coaches: { some: { coachId: "c-1", isDeleted: false } },
        id: "b-9",
        isDeleted: false
      });
      expect(batch.update).not.toHaveBeenCalled();
    });

    it("saves for an admin and resolves whether the batch takes part", async () => {
      mockUser = { id: "a-1", role: UserRole.ADMIN, status: UserStatus.ACTIVE };
      const batch = { findFirst: jest.fn(async (_args: any) => ({ id: "b-1" })), update: jest.fn(async (_args: any) => updated) };
      const { service } = build({ root: { batch } });
      const res = await service.updateBattleSettings("t", "b-1", { battlesEnabled: false, battlesShowNames: true });
      expect(batch.findFirst.mock.calls[0][0].where).toEqual({ id: "b-1", isDeleted: false });
      expect(batch.update.mock.calls[0][0].data).toEqual({ battlesEnabled: false, battlesShowNames: true });
      expect(res).toEqual({ batchId: "b-1", battlesEnabled: false, battlesShowNames: true, takesPart: false });
    });

    it("refuses a student", async () => {
      mockUser = { id: "s-1", role: UserRole.STUDENT, status: UserStatus.ACTIVE };
      const { service } = build({ root: { batch: { findFirst: jest.fn(), update: jest.fn() } } });
      await expect(service.updateBattleSettings("t", "b-1", { battlesEnabled: true })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

function battleRow(over: Partial<BatchBattleSqlRow> = {}): BatchBattleSqlRow {
  return {
    avgScore: 10,
    batchId: "b",
    batchName: "Batch",
    batchType: null,
    battlesEnabled: null,
    battlesShowNames: false,
    players: 3,
    rosterSize: 8,
    topFirstName: "Arjun",
    topLastName: "Kumar",
    topScore: 20,
    ...over
  };
}

describe("rankBatchBattles", () => {
  it("ranks by average, ties share a rank, short batches come after unranked", () => {
    const res = rankBatchBattles(
      [
        battleRow({ avgScore: 12, batchId: "small", batchName: "Small", players: 2 }),
        battleRow({ avgScore: 15, batchId: "a", batchName: "Alpha", players: 3 }),
        battleRow({ avgScore: 15, batchId: "b", batchName: "Bravo", players: 5 }),
        battleRow({ avgScore: 18, batchId: "top", batchName: "Top", players: 4 }),
        battleRow({ avgScore: null, batchId: "idle", batchName: "Idle", players: 0 })
      ],
      new Set()
    );
    expect(res.rows.map((r) => [r.batchId, r.rank])).toEqual([
      ["top", 1],
      ["b", 2],
      ["a", 2],
      ["small", null]
    ]);
  });

  it("leaves out 1:1 and buddy batches unless turned on, and batches turned off", () => {
    const res = rankBatchBattles(
      [
        battleRow({ batchId: "solo", rosterSize: 1 }),
        battleRow({ batchId: "buddy", batchType: "BUDDY" }),
        battleRow({ batchId: "opted-in", battlesEnabled: true, rosterSize: 2 }),
        battleRow({ batchId: "opted-out", battlesEnabled: false }),
        battleRow({ batchId: "group" })
      ],
      new Set(["solo"])
    );
    expect(res.rows.map((r) => r.batchId).sort()).toEqual(["group", "opted-in"]);
    expect(res.myBatches).toEqual([
      { avgScore: 10, batchId: "solo", batchName: "Batch", players: 3, rank: null, takesPart: false }
    ]);
  });

  it("names another batch's top player only when that batch shows names", () => {
    const res = rankBatchBattles(
      [
        battleRow({ batchId: "mine" }),
        battleRow({ batchId: "hidden" }),
        battleRow({ batchId: "shown", battlesShowNames: true, topLastName: null })
      ],
      new Set(["mine"])
    );
    const names = Object.fromEntries(res.rows.map((r) => [r.batchId, r.topPlayerName]));
    expect(names).toEqual({ hidden: null, mine: "Arjun K.", shown: "Arjun" });
    expect(res.rows.find((r) => r.batchId === "hidden")?.topPlayerScore).toBe(20);
  });

  it("reports the viewer's batch even when it is past the 50-row board", () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      battleRow({ avgScore: 100 - i, batchId: `b${i}`, batchName: `B${String(i).padStart(2, "0")}` })
    );
    const res = rankBatchBattles(rows, new Set(["b59"]));
    expect(res.rows).toHaveLength(50);
    expect(res.myBatches).toEqual([expect.objectContaining({ batchId: "b59", rank: 60, takesPart: true })]);
  });
});

describe("leaderboardName", () => {
  it.each([
    [{ firstName: "Arjun", lastName: "Kumar" }, "Arjun K."],
    [{ firstName: "Arjun", lastName: null }, "Arjun"],
    [{ firstName: " Meera ", lastName: "  " }, "Meera"],
    [{ firstName: "", lastName: "Rao" }, "R."],
    [{ firstName: "", lastName: null }, "Student"]
  ])("%j → %s", (user, expected) => {
    expect(leaderboardName(user)).toBe(expected);
  });
});
