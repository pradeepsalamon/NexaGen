import { Prisma } from "@prisma/client";
import type { LiveBoardState } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { GameRecorderService } from "./game-recorder.service";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const cls = { batch: { name: "Batch A" }, batchId: "batch-1", coach: { firstName: "Cara", lastName: "Coach" }, id: "class-1", title: "Openings", topic: null };

function matchGame(overrides: Record<string, unknown> = {}) {
  return {
    black: { firstName: "Bo", lastName: "Black" },
    blackId: "student-b",
    createdAt: new Date("2026-10-15T10:00:00Z"),
    endReason: null,
    finishedAt: null,
    id: "mg-1",
    movesJson: [
      { san: "e4", uci: "e2e4" },
      { san: "e5", uci: "e7e5" },
    ],
    ply: 2,
    result: null,
    round: { liveClass: cls, startFen: START },
    status: "ONGOING",
    white: { firstName: "Wu", lastName: "White" },
    whiteId: "student-w",
    ...overrides,
  };
}

function makePrisma() {
  return {
    chessGame: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    coachClass: { findUnique: jest.fn().mockResolvedValue(cls) },
    liveClassMatchGame: { findUnique: jest.fn() },
    liveClassSimulGame: { findUnique: jest.fn() },
  };
}

describe("GameRecorderService", () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: GameRecorderService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new GameRecorderService(prisma as unknown as PrismaService);
  });

  it("creates one library game per match game, keyed by source", async () => {
    prisma.liveClassMatchGame.findUnique.mockResolvedValue(matchGame());
    await service.recordMatchGame("mg-1");

    const data = prisma.chessGame.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      batchId: "batch-1",
      blackPlayerId: "student-b",
      classId: "class-1",
      moveCount: 2,
      result: "*",
      source: "MATCH",
      sourceKey: "match:mg-1",
      sourceRevision: BigInt(4),
      status: "IN_PROGRESS",
      title: "Wu White vs Bo Black",
      whitePlayerId: "student-w",
    });
    expect(data.pgn).toContain("1. e4 e5 *");
    expect(data.pgn).toContain('[White "Wu White"]');
  });

  it("updates the same row later, and never with an older revision", async () => {
    prisma.liveClassMatchGame.findUnique.mockResolvedValue(
      matchGame({ endReason: "RESIGNATION", finishedAt: new Date(), result: "WHITE_WON", status: "FINISHED" }),
    );
    prisma.chessGame.findUnique.mockResolvedValue({ sourceRevision: BigInt(4) });
    await service.recordMatchGame("mg-1");
    expect(prisma.chessGame.create).not.toHaveBeenCalled();
    expect(prisma.chessGame.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ result: "1-0", status: "COMPLETED", termination: "Resignation" }),
      where: { sourceKey: "match:mg-1", sourceRevision: { lt: BigInt(5) } },
    });

    // A stale call (the stored row is already newer) writes nothing.
    prisma.chessGame.updateMany.mockClear();
    prisma.liveClassMatchGame.findUnique.mockResolvedValue(matchGame({ ply: 1, movesJson: [{ san: "e4", uci: "e2e4" }] }));
    prisma.chessGame.findUnique.mockResolvedValue({ sourceRevision: BigInt(5) });
    await service.recordMatchGame("mg-1");
    expect(prisma.chessGame.updateMany).not.toHaveBeenCalled();
  });

  it("falls back to the guarded update when a concurrent call created the row first", async () => {
    prisma.liveClassMatchGame.findUnique.mockResolvedValue(matchGame());
    prisma.chessGame.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "x", code: "P2002" }),
    );
    await service.recordMatchGame("mg-1");
    expect(prisma.chessGame.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { sourceKey: "match:mg-1", sourceRevision: { lt: BigInt(4) } } }),
    );
  });

  it("skips a pairing nobody moved in", async () => {
    prisma.liveClassMatchGame.findUnique.mockResolvedValue(matchGame({ movesJson: [], ply: 0 }));
    await service.recordMatchGame("mg-1");
    expect(prisma.chessGame.create).not.toHaveBeenCalled();
  });

  it("maps a simul result to the coach's colour", async () => {
    prisma.liveClassSimulGame.findUnique.mockResolvedValue({
      coachIsWhite: false,
      createdAt: new Date(),
      endReason: "CHECKMATE",
      finishedAt: new Date(),
      id: "sg-1",
      movesJson: [{ san: "e4", uci: "e2e4" }],
      ply: 1,
      result: "COACH_WON",
      simul: { liveClass: { ...cls, coach: { firstName: "Cara", id: "coach-1", lastName: "Coach" } }, startFen: START, startedBy: null },
      status: "FINISHED",
      student: { firstName: "Sam", lastName: "Student" },
      studentId: "student-1",
    });
    await service.recordSimulGame("sg-1");
    expect(prisma.chessGame.create.mock.calls[0][0].data).toMatchObject({
      blackPlayerId: "coach-1",
      result: "0-1",
      source: "SIMUL",
      whitePlayerId: "student-1",
    });
  });

  describe("class board", () => {
    const state = (overrides: Partial<LiveBoardState> = {}): LiveBoardState => ({
      arrows: [],
      fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
      gameId: "g-1",
      historyIndex: 1,
      orientation: "white",
      pgn: "1. e4 e5",
      savedAt: 1_000,
      squares: {},
      ...overrides,
    });

    it("records the board's variations and closes the previous board game", async () => {
      await service.recordBoardState("session-1", "class-1", state({ treePgn: "1. e4 e5 (1... c5) *" }));
      expect(prisma.chessGame.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: "COMPLETED" }),
        where: {
          source: "LIVE_BOARD",
          sourceKey: { not: "board:session-1:g-1", startsWith: "board:session-1:" },
          status: "IN_PROGRESS",
        },
      });
      const data = prisma.chessGame.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ hasVariations: true, moveCount: 2, sourceKey: "board:session-1:g-1", sourceRevision: BigInt(1000) });
      expect(data.pgn).toContain("1. e4 e5 (1... c5) *");
    });

    it("ignores a set-up position with no moves", async () => {
      await service.recordBoardState("session-1", "class-1", state({ historyIndex: -1, pgn: "" }));
      expect(prisma.chessGame.create).not.toHaveBeenCalled();
    });

    it("never re-opens a board game that the class end already closed", async () => {
      prisma.chessGame.findUnique.mockResolvedValue({ sourceRevision: BigInt(10) });
      await service.recordBoardState("session-1", "class-1", state({ savedAt: 2_000 }));
      const update = prisma.chessGame.updateMany.mock.calls.find((c) => c[0].where.sourceKey === "board:session-1:g-1");
      expect(update?.[0].data).not.toHaveProperty("status");
      expect(update?.[0].data).not.toHaveProperty("endedAt");
    });
  });
});
