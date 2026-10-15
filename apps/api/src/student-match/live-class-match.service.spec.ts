/* eslint-disable @typescript-eslint/no-explicit-any */
import { GameRecorderService } from "../game-library/game-recorder.service";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import { autoPairPlayers, decodeLiveMatch } from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassMatchService } from "./live-class-match.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const COACH_ID = "coach-1";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const T0 = new Date("2026-10-03T10:00:00Z");

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const liveSession = { id: "ls-1", classId: CLASS_ID, coachId: COACH_ID, roomName: "room-1", status: "LIVE" };
const student = (id: string) => ({ id, firstName: id, lastName: null });

const roundRow = (over: Record<string, unknown> = {}) => ({
  id: "r-1",
  liveClassId: CLASS_ID,
  status: "ACTIVE",
  pairingMode: "AUTO",
  startFen: START,
  clockInitialMs: null,
  clockIncrementMs: 0,
  startedAt: T0,
  endedAt: null,
  games: [],
  challenges: [],
  ...over
});

const gameRow = (over: Record<string, unknown> = {}) => ({
  id: "g-1",
  roundId: "r-1",
  whiteId: "s1",
  blackId: "s2",
  white: student("s1"),
  black: student("s2"),
  fen: START,
  movesJson: [],
  ply: 0,
  whiteClockMs: null,
  blackClockMs: null,
  turnSince: T0,
  status: "ONGOING",
  result: null,
  endReason: null,
  drawOfferedBy: null,
  finishedAt: null,
  createdAt: T0,
  updatedAt: T0,
  round: { id: "r-1", liveClassId: CLASS_ID, startFen: START, status: "ACTIVE", clockIncrementMs: 0 },
  ...over
});

describe("LiveClassMatchService", () => {
  let service: LiveClassMatchService;
  let prisma: any;
  let liveClass: any;
  let livekit: any;

  const as = (id: string, role: UserRole) =>
    liveClass.resolveParticipant.mockResolvedValue({ user: asUser(id, role), liveSession });

  beforeEach(async () => {
    prisma = {
      liveClassMatchRound: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }: any) =>
          roundRow({
            pairingMode: data.pairingMode,
            games: data.games.create.map((g: any, i: number) =>
              gameRow({ id: `g-${i}`, ...g, white: student(g.whiteId), black: student(g.blackId) })
            )
          })
        ),
        update: jest.fn()
      },
      liveClassMatchGame: {
        findUnique: jest.fn().mockResolvedValue(gameRow()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(gameRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn()
      },
      liveClassMatchChallenge: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          batch: { students: [{ studentId: "s1" }, { studentId: "s2" }, { studentId: "s3" }, { studentId: "s4" }] }
        })
      },
      user: {
        findMany: jest.fn().mockImplementation(async ({ where }: any) =>
          where.id.in.filter((id: string) => id !== COACH_ID).map(student)
        )
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma))
    };
    liveClass = {
      resolveClassManager: jest.fn().mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession }),
      resolveParticipant: jest.fn().mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession }),
      connectedUserIds: jest.fn().mockResolvedValue(new Set(["s1", "s2", "s3", "s4", COACH_ID]))
    };
    livekit = { broadcastData: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveClassMatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveClassService, useValue: liveClass },
        { provide: LiveKitService, useValue: livekit },
        { provide: GameRecorderService, useValue: { recordMatchGameInBackground: jest.fn(), recordMatchRoundInBackground: jest.fn(), recordSimulGameInBackground: jest.fn(), recordSimulInBackground: jest.fn() } }
      ]
    }).compile();
    service = moduleRef.get(LiveClassMatchService);
  });

  describe("autoPairPlayers", () => {
    it("pairs everyone once, leaves the odd player out, and avoids rematches", () => {
      const { pairs, bye } = autoPairPlayers(
        ["a", "b", "c", "d", "e"].map((id) => ({ id, points: 0 })),
        [{ whiteId: "a", blackId: "b" }],
        () => 0.1
      );
      expect(pairs).toHaveLength(2);
      expect(bye).not.toBeNull();
      const ids = pairs.flatMap((p) => [p.whiteId, p.blackId]);
      expect(new Set(ids).size).toBe(4);
      expect(pairs.some((p) => [p.whiteId, p.blackId].sort().join() === "a,b")).toBe(false);
    });
  });

  describe("start", () => {
    it("AUTO pairs every student in class and broadcasts the round", async () => {
      const result = await service.start(TOKEN, CLASS_ID, { pairingMode: "AUTO" });

      expect(result.round?.games).toHaveLength(2);
      const playing = result.round!.games.flatMap((g) => [g.white.id, g.black.id]).sort();
      expect(playing).toEqual(["s1", "s2", "s3", "s4"]);
      const packet = decodeLiveMatch(livekit.broadcastData.mock.calls[0][1]);
      expect(packet?.type).toBe("ROUND_CHANGED");
    });

    it("rejects a coach pair with a student who is not in the class", async () => {
      await expect(
        service.start(TOKEN, CLASS_ID, { pairingMode: "COACH", pairs: [{ whiteId: "s1", blackId: "outsider" }] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a student used in two pairs", async () => {
      await expect(
        service.start(TOKEN, CLASS_ID, {
          pairingMode: "COACH",
          pairs: [
            { whiteId: "s1", blackId: "s2" },
            { whiteId: "s1", blackId: "s3" }
          ]
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lets students choose without creating games", async () => {
      const result = await service.start(TOKEN, CLASS_ID, { pairingMode: "STUDENT_CHOICE" });
      expect(result.round?.games).toHaveLength(0);
    });
  });

  describe("challenge", () => {
    it("is refused while the coach is pairing", async () => {
      as("s1", UserRole.STUDENT);
      prisma.liveClassMatchRound.findFirst.mockResolvedValue(roundRow({ pairingMode: "COACH" }));
      await expect(service.challenge(TOKEN, CLASS_ID, { opponentId: "s2" })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it("accepts a crossing challenge on the spot", async () => {
      as("s1", UserRole.STUDENT);
      prisma.liveClassMatchRound.findFirst.mockResolvedValue(roundRow({ pairingMode: "STUDENT_CHOICE" }));
      prisma.liveClassMatchChallenge.findFirst.mockResolvedValue({ id: "c-1", fromId: "s2", toId: "s1" });

      await service.challenge(TOKEN, CLASS_ID, { opponentId: "s2" });

      expect(prisma.liveClassMatchChallenge.create).not.toHaveBeenCalled();
      expect(prisma.liveClassMatchGame.create).toHaveBeenCalledTimes(1);
      const pair = prisma.liveClassMatchGame.create.mock.calls[0][0].data;
      expect([pair.whiteId, pair.blackId].sort()).toEqual(["s1", "s2"]);
    });

    it("is refused when either student is already playing", async () => {
      as("s1", UserRole.STUDENT);
      prisma.liveClassMatchRound.findFirst.mockResolvedValue(roundRow({ pairingMode: "STUDENT_CHOICE" }));
      prisma.liveClassMatchGame.findFirst.mockResolvedValue(gameRow());
      await expect(service.challenge(TOKEN, CLASS_ID, { opponentId: "s2" })).rejects.toBeInstanceOf(
        ConflictException
      );
    });
  });

  describe("move", () => {
    it("plays a legal move guarded by ply", async () => {
      as("s1", UserRole.STUDENT);
      await service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 0 });

      const call = prisma.liveClassMatchGame.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: "g-1", ply: 0, status: "ONGOING" });
      expect(call.data.ply).toBe(1);
      expect(call.data.movesJson).toEqual([{ san: "e4", uci: "e2e4" }]);
    });

    it("refuses the player whose turn it is not", async () => {
      as("s2", UserRole.STUDENT);
      await expect(service.move(TOKEN, CLASS_ID, "g-1", { uci: "e7e5", ply: 0 })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it("refuses a student from another game", async () => {
      as("s3", UserRole.STUDENT);
      await expect(service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 0 })).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("refuses a stale ply", async () => {
      as("s1", UserRole.STUDENT);
      await expect(service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 3 })).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it("loses on time instead of moving once the clock has run out", async () => {
      as("s1", UserRole.STUDENT);
      const afterTwo = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
      prisma.liveClassMatchGame.findUnique.mockResolvedValue(
        gameRow({
          fen: afterTwo,
          movesJson: [
            { san: "e4", uci: "e2e4" },
            { san: "e5", uci: "e7e5" }
          ],
          ply: 2,
          whiteClockMs: 1000,
          blackClockMs: 60_000,
          turnSince: new Date(Date.now() - 5000)
        })
      );

      await service.move(TOKEN, CLASS_ID, "g-1", { uci: "g1f3", ply: 2 });

      const data = prisma.liveClassMatchGame.updateMany.mock.calls[0][0].data;
      expect(data.endReason).toBe("TIMEOUT");
      expect(data.result).toBe("BLACK_WON");
      expect(data.whiteClockMs).toBe(0);
    });
  });

  describe("action", () => {
    it("does not let a player adjudicate their own game", async () => {
      as("s1", UserRole.STUDENT);
      await expect(
        service.action(TOKEN, CLASS_ID, "g-1", { action: "ADJUDICATE", result: "WHITE_WON" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("lets the coach decide a game", async () => {
      await service.action(TOKEN, CLASS_ID, "g-1", { action: "ADJUDICATE", result: "DRAW" });
      const data = prisma.liveClassMatchGame.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({ endReason: "ADJUDICATED", result: "DRAW", status: "FINISHED" });
    });

    it("accepts a crossing draw offer", async () => {
      as("s1", UserRole.STUDENT);
      prisma.liveClassMatchGame.findUnique.mockResolvedValue(gameRow({ drawOfferedBy: "BLACK" }));
      await service.action(TOKEN, CLASS_ID, "g-1", { action: "OFFER_DRAW" });
      const data = prisma.liveClassMatchGame.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({ endReason: "DRAW_AGREED", result: "DRAW" });
    });
  });
});
