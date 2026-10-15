import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";
import { gameLibraryQuerySchema } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { GameLibraryService } from "./game-library.service";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function row(overrides: Record<string, unknown> = {}) {
  return {
    batch: { name: "Batch A" },
    batchId: "batch-1",
    blackName: "Black",
    blackPlayerId: null,
    class: { coachId: "coach-1", title: "Openings", topic: null },
    classId: "class-1",
    createdBy: null,
    createdById: null,
    endedAt: null,
    hasVariations: false,
    id: "game-1",
    moveCount: 2,
    pgn: '[White "W"]\n[Black "B"]\n[Result "1-0"]\n\n1. e4 e5 1-0\n',
    result: "1-0",
    source: "MATCH",
    startFen: START,
    startedAt: new Date("2026-10-15T10:00:00Z"),
    status: "COMPLETED",
    termination: null,
    title: "W vs B",
    updatedAt: new Date("2026-10-15T10:30:00Z"),
    version: 3,
    whiteName: "White",
    whitePlayerId: null,
    ...overrides,
  };
}

describe("GameLibraryService", () => {
  let prisma: {
    batchCoach: { findFirst: jest.Mock };
    chessGame: {
      count: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
  };
  let service: GameLibraryService;
  const as = (id: string, role: string) =>
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE, timezone: "Asia/Kolkata" });

  beforeEach(() => {
    prisma = {
      batchCoach: { findFirst: jest.fn().mockResolvedValue(null) },
      chessGame: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(row()),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn() },
    };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "u", type: "access" }) };
    service = new GameLibraryService(jwt as unknown as JwtService, prisma as unknown as PrismaService);
  });

  const query = (extra: Record<string, unknown> = {}) => gameLibraryQuerySchema.parse(extra);
  const visibility = () => prisma.chessGame.findMany.mock.calls[0][0].where.AND[0];

  it("scopes a student to games they played and class boards they attended", async () => {
    as("student-1", "STUDENT");
    await service.list("t", query());
    expect(visibility()).toEqual({
      OR: [
        { whitePlayerId: "student-1" },
        { blackPlayerId: "student-1" },
        {
          class: { attendances: { some: { status: { not: "ABSENT" }, studentId: "student-1" } } },
          source: "LIVE_BOARD",
        },
      ],
    });
  });

  it("scopes a coach to their own, their classes' and their batches' games", async () => {
    as("coach-1", "COACH");
    await service.list("t", query());
    expect(visibility().OR).toEqual(
      expect.arrayContaining([
        { createdById: "coach-1" },
        { class: { coachId: "coach-1" } },
        { batch: { coaches: { some: { coachId: "coach-1", isDeleted: false } } } },
      ]),
    );
  });

  it("lets an admin see everything and filters by student, batch, result and date", async () => {
    as("admin-1", "ADMIN");
    await service.list("t", query({ batchId: "batch-1", from: "2026-10-01", result: "1-0", studentId: "student-9", to: "2026-10-15" }));
    const [scope, ...filters] = prisma.chessGame.findMany.mock.calls[0][0].where.AND;
    expect(scope).toEqual({});
    expect(filters).toEqual(
      expect.arrayContaining([
        { batchId: "batch-1" },
        { result: "1-0" },
        // IST midnight of Oct 1 → Oct 16 (exclusive)
        { startedAt: { gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-15T18:30:00.000Z") } },
      ]),
    );
    expect(filters[0].OR).toEqual(expect.arrayContaining([{ whitePlayerId: "student-9" }]));
  });

  it("answers 404 (not 403) for a game outside the caller's scope", async () => {
    as("student-1", "STUDENT");
    prisma.chessGame.findFirst.mockResolvedValue(null);
    await expect(service.get("t", "someone-elses")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chessGame.findFirst.mock.calls[0][0].where.AND[0]).toEqual({ id: "someone-elses" });
  });

  it("never lets a student edit, import or delete", async () => {
    as("student-1", "STUDENT");
    prisma.chessGame.findFirst.mockResolvedValue(row({ whitePlayerId: "student-1" }));
    await expect(service.get("t", "game-1")).resolves.toMatchObject({ canDelete: false, canEdit: false });
    await expect(service.saveAnalysis("t", "game-1", { pgn: "1. e4 *", version: 3 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.importGame("t", { pgn: "1. e4 *" })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("saves a coach's analysis with a version guard", async () => {
    as("coach-1", "COACH");
    await service.saveAnalysis("t", "game-1", { pgn: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *", version: 3 });
    const call = prisma.chessGame.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "game-1", version: 3 });
    expect(call.data).toMatchObject({ hasVariations: true, moveCount: 3, version: { increment: 1 } });
    // The game's own result survives whatever the editor sent.
    expect(call.data.pgn).toContain("(1... c5 2. Nf3) 2. Nf3 1-0");
    expect(call.data.pgn).toContain('[White "W"]');

    prisma.chessGame.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.saveAnalysis("t", "game-1", { pgn: "1. e4 *", version: 2 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("refuses analysis on a game still being played, or from another position", async () => {
    as("coach-1", "COACH");
    prisma.chessGame.findFirst.mockResolvedValue(row({ status: "IN_PROGRESS" }));
    await expect(service.saveAnalysis("t", "game-1", { pgn: "1. e4 *", version: 3 })).rejects.toBeInstanceOf(
      ConflictException,
    );
    prisma.chessGame.findFirst.mockResolvedValue(row());
    await expect(
      service.saveAnalysis("t", "game-1", { pgn: '[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. Kd2 *', version: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not let a coach of another batch edit", async () => {
    as("coach-2", "COACH");
    prisma.batchCoach.findFirst.mockResolvedValue(null);
    await expect(service.saveAnalysis("t", "game-1", { pgn: "1. e4 *", version: 3 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("imports a PGN with variations and rejects an invalid one", async () => {
    as("coach-1", "COACH");
    prisma.chessGame.create.mockImplementation(({ data }) => Promise.resolve(row({ ...data, id: "new" })));
    const detail = await service.importGame("t", {
      pgn: '[White "Carlsen"]\n[Black "Nepo"]\n[Date "2021.12.03"]\n[Result "1-0"]\n\n1. e4 (1. d4 d5) 1... e5 1-0',
    });
    const data = prisma.chessGame.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ createdById: "coach-1", hasVariations: true, moveCount: 2, result: "1-0", source: "IMPORT", title: "Carlsen vs Nepo" });
    expect(data.startedAt.toISOString()).toBe("2021-12-03T12:00:00.000Z");
    expect(detail.canDelete).toBe(true);

    await expect(service.importGame("t", { pgn: "1. e4 e5 2. Ke3 *" })).rejects.toThrow(/Illegal move "Ke3"/);
  });

  it("only deletes imports, by their importer or an admin", async () => {
    as("coach-1", "COACH");
    await expect(service.remove("t", "game-1")).rejects.toBeInstanceOf(ForbiddenException);
    prisma.chessGame.findFirst.mockResolvedValue(row({ createdById: "coach-1", source: "IMPORT" }));
    await expect(service.remove("t", "game-1")).resolves.toEqual({ id: "game-1" });
    expect(prisma.chessGame.delete).toHaveBeenCalledWith({ where: { id: "game-1" } });
  });
});
