/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import { decodeLiveSimul } from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { LiveClassSimulService } from "./live-class-simul.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const COACH_ID = "coach-1";
const STUDENT_ID = "student-1";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const liveSession = { id: "ls-1", classId: CLASS_ID, coachId: COACH_ID, roomName: "room-1", status: "LIVE" };

const gameRow = (over: Record<string, unknown> = {}) => ({
  id: "g-1",
  simulId: "s-1",
  studentId: STUDENT_ID,
  coachIsWhite: true,
  fen: START,
  movesJson: [],
  ply: 0,
  status: "ONGOING",
  result: null,
  endReason: null,
  drawOfferedBy: null,
  engineMoves: 0,
  lastMoveAt: null,
  finishedAt: null,
  createdAt: new Date("2026-09-28T10:00:00Z"),
  updatedAt: new Date("2026-09-28T10:00:00Z"),
  simul: { id: "s-1", liveClassId: CLASS_ID, startFen: START, status: "ACTIVE" },
  student: { firstName: "Sam", lastName: "Student" },
  ...over
});

describe("LiveClassSimulService", () => {
  let service: LiveClassSimulService;
  let prisma: any;
  let liveClass: any;
  let livekit: any;
  let stockfish: any;

  const asCoach = () =>
    liveClass.resolveParticipant.mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession });

  beforeEach(async () => {
    prisma = {
      liveClassSimul: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }: any) => ({
          id: "s-1",
          status: "ACTIVE",
          colorMode: data.colorMode,
          startFen: data.startFen,
          startedAt: new Date("2026-09-28T10:00:00Z"),
          endedAt: null,
          games: data.games.create.map((g: any, i: number) => gameRow({ id: `g-${i}`, ...g }))
        })),
        update: jest.fn()
      },
      liveClassSimulGame: {
        findUnique: jest.fn().mockResolvedValue(gameRow()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(gameRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn()
      },
      liveSession: {
        findUnique: jest.fn().mockResolvedValue({
          batch: { students: [{ studentId: STUDENT_ID }, { studentId: "student-2" }] }
        })
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma))
    };
    liveClass = {
      resolveClassManager: jest
        .fn()
        .mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession }),
      resolveParticipant: jest
        .fn()
        .mockResolvedValue({ user: asUser(STUDENT_ID, UserRole.STUDENT), liveSession })
    };
    livekit = { broadcastData: jest.fn().mockResolvedValue(undefined) };
    stockfish = { getBestMove: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveClassSimulService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveClassService, useValue: liveClass },
        { provide: LiveKitService, useValue: livekit },
        { provide: StockfishService, useValue: stockfish }
      ]
    }).compile();
    service = moduleRef.get(LiveClassSimulService);
  });

  describe("start", () => {
    it("alternates colours and broadcasts a refetch nudge", async () => {
      const { simul } = await service.start(TOKEN, CLASS_ID, {
        studentIds: [STUDENT_ID, "student-2"],
        colorMode: "ALTERNATE"
      });
      expect(simul?.games.map((g) => g.coachColor)).toEqual(["white", "black"]);
      expect(simul?.games.map((g) => g.turn)).toEqual(["COACH", "STUDENT"]);
      const packet = decodeLiveSimul(livekit.broadcastData.mock.calls[0][1]);
      expect(packet).toEqual({ type: "SIMUL_CHANGED", simulId: "s-1" });
    });

    it("rejects a student outside the class batch", async () => {
      await expect(
        service.start(TOKEN, CLASS_ID, { studentIds: ["stranger"] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects an illegal starting position", async () => {
      await expect(
        service.start(TOKEN, CLASS_ID, { studentIds: [STUDENT_ID], startFen: "8/8/8/8/8/8/8/8 w - - 0 1" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("move", () => {
    it("lets the coach move on the coach's turn and broadcasts the game", async () => {
      asCoach();
      await service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 0 });
      const { where, data } = prisma.liveClassSimulGame.updateMany.mock.calls[0][0];
      expect(where).toEqual({ id: "g-1", ply: 0, status: "ONGOING" });
      expect(data.ply).toBe(1);
      expect(data.movesJson).toEqual([{ by: "COACH", san: "e4", uci: "e2e4" }]);
      expect(decodeLiveSimul(livekit.broadcastData.mock.calls[0][1])?.type).toBe("SIMUL_GAME");
    });

    it("refuses a student moving on the coach's turn", async () => {
      await expect(
        service.move(TOKEN, CLASS_ID, "g-1", { uci: "e7e5", ply: 0 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses another student's game", async () => {
      liveClass.resolveParticipant.mockResolvedValue({
        user: asUser("student-2", UserRole.STUDENT),
        liveSession
      });
      await expect(
        service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 0 })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects a stale ply", async () => {
      asCoach();
      await expect(
        service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 3 })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects an illegal move", async () => {
      asCoach();
      await expect(
        service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e5", ply: 0 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("finishes the game on checkmate", async () => {
      // Fool's mate: the student (black) mates the coach.
      const fen = "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2";
      prisma.liveClassSimulGame.findUnique.mockResolvedValue(
        gameRow({
          fen,
          ply: 3,
          movesJson: [
            { by: "COACH", san: "f3", uci: "f2f3" },
            { by: "STUDENT", san: "e5", uci: "e7e5" },
            { by: "COACH", san: "g4", uci: "g2g4" }
          ]
        })
      );
      await service.move(TOKEN, CLASS_ID, "g-1", { uci: "d8h4", ply: 3 });
      const { data } = prisma.liveClassSimulGame.updateMany.mock.calls[0][0];
      expect(data).toMatchObject({ status: "FINISHED", result: "STUDENT_WON", endReason: "CHECKMATE" });
    });

    it("reports a lost race as a conflict", async () => {
      asCoach();
      prisma.liveClassSimulGame.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.move(TOKEN, CLASS_ID, "g-1", { uci: "e2e4", ply: 0 })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("engineMove", () => {
    it("plays Stockfish's move for the coach and counts it", async () => {
      asCoach();
      stockfish.getBestMove.mockResolvedValue({ uci: "d2d4", san: "d4" });
      await service.engineMove(TOKEN, CLASS_ID, "g-1", { ply: 0, skillLevel: 5 });
      expect(stockfish.getBestMove).toHaveBeenCalledWith(START, { skillLevel: 5 });
      const { data } = prisma.liveClassSimulGame.updateMany.mock.calls[0][0];
      expect(data.engineMoves).toEqual({ increment: 1 });
      expect(data.movesJson).toEqual([{ by: "COACH", san: "d4", uci: "d2d4", engine: true }]);
    });

    it("is coach-only", async () => {
      await expect(
        service.engineMove(TOKEN, CLASS_ID, "g-1", { ply: 0 })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(stockfish.getBestMove).not.toHaveBeenCalled();
    });
  });

  describe("action", () => {
    it("a student's resignation is a coach win", async () => {
      await service.action(TOKEN, CLASS_ID, "g-1", { action: "RESIGN" });
      const { data } = prisma.liveClassSimulGame.updateMany.mock.calls[0][0];
      expect(data).toMatchObject({ result: "COACH_WON", endReason: "RESIGNATION", status: "FINISHED" });
    });

    it("the coach accepts a student's draw offer", async () => {
      asCoach();
      prisma.liveClassSimulGame.findUnique.mockResolvedValue(gameRow({ drawOfferedBy: "STUDENT" }));
      await service.action(TOKEN, CLASS_ID, "g-1", { action: "ACCEPT_DRAW" });
      const { where, data } = prisma.liveClassSimulGame.updateMany.mock.calls[0][0];
      expect(where.drawOfferedBy).toBe("STUDENT");
      expect(data).toMatchObject({ result: "DRAW", endReason: "DRAW_AGREED" });
    });

    it("cannot accept your own draw offer", async () => {
      prisma.liveClassSimulGame.findUnique.mockResolvedValue(gameRow({ drawOfferedBy: "STUDENT" }));
      await expect(
        service.action(TOKEN, CLASS_ID, "g-1", { action: "ACCEPT_DRAW" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("only the coach adjudicates", async () => {
      await expect(
        service.action(TOKEN, CLASS_ID, "g-1", { action: "ADJUDICATE", result: "STUDENT_WON" })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("getCurrent", () => {
    it("shows a student only their own game", async () => {
      prisma.liveClassSimul.findFirst.mockResolvedValueOnce({
        id: "s-1",
        status: "ACTIVE",
        colorMode: "WHITE",
        startFen: START,
        startedAt: new Date(),
        endedAt: null,
        games: [gameRow(), gameRow({ id: "g-2", studentId: "student-2" })]
      });
      const { simul } = await service.getCurrent(TOKEN, CLASS_ID);
      expect(simul?.games.map((g) => g.id)).toEqual(["g-1"]);
    });
  });
});
