/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConflictException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import {
  comboBonus,
  comboLevel,
  decodePuzzleRushMessage,
  maxComboBonus,
  PUZZLE_RACER_CONFIG,
  PUZZLE_RUSH_POOL_SIZE,
  PUZZLE_STORM_CONFIG,
  rankPuzzleRushStandings
} from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassPuzzleRushService } from "./live-class-puzzle-rush.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const COACH_ID = "coach-1";
const STUDENT_ID = "student-1";
const FEN = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const liveSession = { id: "ls-1", classId: CLASS_ID, coachId: COACH_ID, roomName: "room-1", status: "LIVE" };

/** Ten 4-ply puzzles (2 player moves each), rated 1000, 1100, … */
const PUZZLES = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  fen: FEN,
  moves: ["f1c4", "g8f6", "d2d3", "f8c5"],
  rating: 1000 + i * 100
}));

const rushRow = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  liveClassId: CLASS_ID,
  startedById: COACH_ID,
  mode: "STORM",
  puzzles: PUZZLES,
  startsAt: new Date(Date.now() - 1000),
  endsAt: null,
  endedAt: null,
  createdAt: new Date(Date.now() - 1000),
  updatedAt: new Date(),
  entries: [],
  ...over
});

const entryRow = (over: Record<string, unknown> = {}) => ({
  id: "e-1",
  rushId: "r-1",
  studentId: STUDENT_ID,
  score: 0,
  moves: 0,
  errors: 0,
  solved: 0,
  bestCombo: 0,
  highestRating: null,
  puzzleIndex: 0,
  skipsUsed: 0,
  startedAt: null,
  clockEndsAt: null,
  finishedAt: null,
  student: { firstName: "Sam", lastName: null },
  ...over
});

const progress = (over: Record<string, unknown> = {}) => ({
  rushId: "r-1",
  score: 0,
  moves: 0,
  errors: 0,
  solved: 0,
  bestCombo: 0,
  highestRating: null,
  puzzleIndex: 0,
  skipsUsed: 0,
  clockEndsAt: null,
  finished: false,
  ...over
});

describe("Puzzle Storm / Racer rules (Lichess)", () => {
  it("awards combo bonuses at 5, 12, 20, 30 and then every 10", () => {
    const levels = PUZZLE_STORM_CONFIG.combo;
    const bonuses = Array.from({ length: 60 }, (_, i) => [i + 1, comboBonus(levels, i + 1)] as const).filter(
      ([, b]) => b > 0
    );
    expect(bonuses).toEqual([
      [5, 3],
      [12, 5],
      [20, 7],
      [30, 10],
      [40, 10],
      [50, 10],
      [60, 10]
    ]);
    expect(comboLevel(levels, 4)).toBe(0);
    expect(comboLevel(levels, 29)).toBe(3);
  });

  it("Racer bonuses are points: +1 / +2 / +3 / +4", () => {
    const levels = PUZZLE_RACER_CONFIG.combo;
    expect([5, 12, 20, 30, 40].map((c) => comboBonus(levels, c))).toEqual([1, 2, 3, 4, 4]);
    expect(maxComboBonus(levels, 20)).toBe(1 + 2 + 3);
  });

  it("uses the Lichess Storm ladder of 137 puzzles", () => {
    expect(PUZZLE_RUSH_POOL_SIZE).toBe(137);
  });

  it("ranks by score, then fewer errors, sharing a rank on a tie", () => {
    const ranked = rankPuzzleRushStandings([
      { name: "A", score: 5, errors: 1, moves: 9, finishedAt: null },
      { name: "B", score: 7, errors: 2, moves: 12, finishedAt: null },
      { name: "C", score: 5, errors: 1, moves: 9, finishedAt: null },
      { name: "D", score: 5, errors: 0, moves: 9, finishedAt: null }
    ]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ["B", 1],
      ["D", 2],
      ["A", 3],
      ["C", 3]
    ]);
  });
});

describe("LiveClassPuzzleRushService", () => {
  let service: LiveClassPuzzleRushService;
  let prisma: any;
  let liveClass: any;
  let livekit: any;
  let entry: any;

  beforeEach(async () => {
    entry = entryRow();
    prisma = {
      liveClassPuzzleRush: {
        findFirst: jest.fn().mockResolvedValue(rushRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockImplementation(async ({ data }: any) => rushRow({ ...data, id: "r-2" }))
      },
      liveClassPuzzleRushEntry: {
        findUnique: jest.fn().mockImplementation(async () => entry),
        create: jest.fn(),
        updateMany: jest.fn().mockImplementation(async ({ data }: any) => {
          entry = { ...entry, ...data };
          return { count: 1 };
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(async () => entry)
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockImplementation(async () =>
        Array.from({ length: 30 }, (_, i) => ({
          id: `lp${Math.random()}-${i}`,
          fen: FEN,
          moves: "f1c4 g8f6 d2d3 f8c5",
          rating: 1000 + i,
          randKey: i
        }))
      ),
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma))
    };
    liveClass = {
      resolveClassManager: jest.fn().mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession }),
      resolveParticipant: jest.fn().mockResolvedValue({ user: asUser(STUDENT_ID, UserRole.STUDENT), liveSession })
    };
    livekit = { broadcastData: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveClassPuzzleRushService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveClassService, useValue: liveClass },
        { provide: LiveKitService, useValue: livekit }
      ]
    }).compile();
    service = moduleRef.get(LiveClassPuzzleRushService);
  });

  describe("start", () => {
    it("needs the class live, ends the current round and freezes a rising run", async () => {
      const res = await service.start(TOKEN, CLASS_ID, { mode: "STORM" });

      expect(liveClass.resolveClassManager).toHaveBeenCalledWith(TOKEN, CLASS_ID, { requireLive: true });
      expect(prisma.liveClassPuzzleRush.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { liveClassId: CLASS_ID, endedAt: null } })
      );
      const data = prisma.liveClassPuzzleRush.create.mock.calls[0][0].data;
      const ratings = data.puzzles.map((p: any) => p.rating);
      expect(ratings).toEqual([...ratings].sort((a: number, b: number) => a - b));
      expect(data.puzzles[0].moves).toEqual(["f1c4", "g8f6", "d2d3", "f8c5"]);
      expect(data.endsAt).toBeNull();
      expect(res.rush?.status).toBe("RUNNING");
      expect(decodePuzzleRushMessage(livekit.broadcastData.mock.calls[0][1])).toEqual({
        type: "RUSH_CHANGED",
        rushId: "r-2"
      });
    });

    it("Racer gets a countdown, a 90-second race and hides the puzzles until it starts", async () => {
      const res = await service.start(TOKEN, CLASS_ID, { mode: "RACER" });
      const data = prisma.liveClassPuzzleRush.create.mock.calls[0][0].data;
      expect(data.endsAt.getTime() - data.startsAt.getTime()).toBe(90_000);
      expect(data.startsAt.getTime()).toBeGreaterThan(Date.now() + 8_000);
      expect(res.rush?.status).toBe("COUNTDOWN");
      expect(res.rush?.puzzles).toEqual([]);
    });

    it("refuses when the Lichess catalogue isn't loaded", async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(service.start(TOKEN, CLASS_ID, { mode: "STORM" })).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
    });
  });

  describe("reportProgress", () => {
    it("is students only", async () => {
      liveClass.resolveParticipant.mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession });
      await expect(service.reportProgress(TOKEN, CLASS_ID, progress())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("Storm scores puzzles solved, whatever the client claims, and caps the clock", async () => {
      const res = await service.reportProgress(
        TOKEN,
        CLASS_ID,
        progress({
          score: 99,
          moves: 4,
          solved: 2,
          puzzleIndex: 2,
          highestRating: 3000,
          clockEndsAt: new Date(Date.now() + 60 * 60_000).toISOString()
        })
      );
      expect(res.standing.score).toBe(2);
      // Highest solved can't exceed the hardest puzzle actually behind them.
      expect(res.standing.highestRating).toBe(1100);
      const clock = Date.parse(res.standing.clockEndsAt!);
      expect(clock).toBeLessThanOrEqual(Date.now() + (180 + 5) * 1000 + 50);
      expect(livekit.broadcastData).toHaveBeenCalled();
    });

    it("never accepts more moves than the run has reached", async () => {
      const res = await service.reportProgress(TOKEN, CLASS_ID, progress({ moves: 50, solved: 1, puzzleIndex: 1 }));
      // Puzzles 0 and 1 hold two player moves each.
      expect(res.standing.moves).toBe(4);
    });

    it("drops an older report that arrives after a newer one", async () => {
      entry = entryRow({ moves: 6, puzzleIndex: 3, solved: 3, score: 3 });
      const res = await service.reportProgress(TOKEN, CLASS_ID, progress({ moves: 2, puzzleIndex: 1, solved: 1 }));
      expect(prisma.liveClassPuzzleRushEntry.updateMany).not.toHaveBeenCalled();
      expect(res.standing.moves).toBe(6);
    });

    it("Racer caps the score at moves plus the most combo bonus they could earn", async () => {
      prisma.liveClassPuzzleRush.findFirst.mockResolvedValue(
        rushRow({ mode: "RACER", endsAt: new Date(Date.now() + 60_000) })
      );
      const res = await service.reportProgress(
        TOKEN,
        CLASS_ID,
        progress({ score: 40, moves: 6, solved: 3, puzzleIndex: 3, skipsUsed: 3 })
      );
      expect(res.standing.score).toBe(6 + 1);
      expect(res.standing.skipsUsed).toBe(1);
    });

    it("refuses a Racer report once the race is over", async () => {
      prisma.liveClassPuzzleRush.findFirst.mockResolvedValue(
        rushRow({ mode: "RACER", endsAt: new Date(Date.now() - 30_000) })
      );
      await expect(service.reportProgress(TOKEN, CLASS_ID, progress({ moves: 2 }))).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it("leaves a finished run alone", async () => {
      entry = entryRow({ moves: 4, puzzleIndex: 2, solved: 2, score: 2, finishedAt: new Date() });
      await service.reportProgress(TOKEN, CLASS_ID, progress({ moves: 8, puzzleIndex: 4, solved: 4 }));
      expect(prisma.liveClassPuzzleRushEntry.updateMany).not.toHaveBeenCalled();
    });
  });
});
