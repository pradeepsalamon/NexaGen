import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { LiveBoardState } from "@nexa-chess/types";
import { LiveClassBoardStateService } from "./live-class-board-state.service";
import type { LiveClassAccessService } from "./live-class-access.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { GameRecorderService } from "../game-library/game-recorder.service";
import type { LiveKitService } from "./livekit.service";

const STATE: LiveBoardState = {
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  pgn: "1. e4",
  historyIndex: 0,
  orientation: "white",
  arrows: [["e2", "e4", "green"]],
  squares: {},
};

describe("LiveClassBoardStateService", () => {
  let update: jest.Mock;
  let resolveParticipant: jest.Mock;
  let resolveClassManager: jest.Mock;
  let recordBoardStateInBackground: jest.Mock;
  let findUnique: jest.Mock;
  let verifyToken: jest.Mock;
  let service: LiveClassBoardStateService;

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({});
    resolveParticipant = jest.fn();
    resolveClassManager = jest.fn().mockResolvedValue({ liveSession: { id: "session-1" } });
    recordBoardStateInBackground = jest.fn();
    findUnique = jest.fn();
    verifyToken = jest.fn();
    service = new LiveClassBoardStateService(
      { liveSession: { findUnique, update } } as unknown as PrismaService,
      { resolveParticipant, resolveClassManager } as unknown as LiveClassAccessService,
      { recordBoardStateInBackground } as unknown as GameRecorderService,
      { verifyToken } as unknown as LiveKitService
    );
  });

  it("returns the saved snapshot to a participant", async () => {
    const savedAt = new Date("2026-03-02T10:05:00.000Z");
    resolveParticipant.mockResolvedValue({ liveSession: { boardState: STATE, boardStateUpdatedAt: savedAt } });

    await expect(service.getBoardState("token", "class-1")).resolves.toEqual({
      state: STATE,
      updatedAt: savedAt.toISOString(),
    });
  });

  it("returns null when nothing (or something unreadable) was saved", async () => {
    resolveParticipant.mockResolvedValue({ liveSession: { boardState: null, boardStateUpdatedAt: null } });
    await expect(service.getBoardState("token", "class-1")).resolves.toEqual({ state: null, updatedAt: null });

    resolveParticipant.mockResolvedValue({ liveSession: { boardState: { fen: 42 }, boardStateUpdatedAt: new Date() } });
    await expect(service.getBoardState("token", "class-1")).resolves.toEqual({ state: null, updatedAt: null });
  });

  it("saves only for the class manager of a live class", async () => {
    await service.saveBoardState("token", "class-1", STATE);

    expect(resolveClassManager).toHaveBeenCalledWith("token", "class-1", { requireLive: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: { boardState: STATE, boardStateUpdatedAt: expect.any(Date) },
    });
    // ...and hands the board to the Game Library recorder.
    expect(recordBoardStateInBackground).toHaveBeenCalledWith("session-1", "class-1", STATE);
  });

  it("does not write when the caller may not manage the class", async () => {
    resolveClassManager.mockRejectedValue(new ForbiddenException());

    await expect(service.saveBoardState("token", "class-1", STATE)).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an oversized snapshot", async () => {
    const huge = { ...STATE, squares: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, "x".repeat(100)])) };

    await expect(service.saveBoardState("token", "class-1", huge)).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  describe("getBoardStateForRecorder (egress template, LiveKit token)", () => {
    const savedAt = new Date("2026-10-31T09:00:00.000Z");
    const session = { boardState: STATE, boardStateUpdatedAt: savedAt, livekitRoomName: null, roomName: "class_1" };

    it("returns the saved board to the class's recorder", async () => {
      verifyToken.mockResolvedValue({ hidden: true, recorder: true, room: "class_1" });
      findUnique.mockResolvedValue(session);
      await expect(service.getBoardStateForRecorder("Bearer egress.jwt", "class-1")).resolves.toEqual({
        state: STATE,
        updatedAt: savedAt.toISOString(),
      });
      expect(verifyToken).toHaveBeenCalledWith("egress.jwt");
      expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: "class-1" } }));
    });

    it.each([[undefined], [""], ["Basic abc"], ["Bearer"]])("needs a bearer token (%p)", async (header) => {
      await expect(service.getBoardStateForRecorder(header, "class-1")).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verifyToken).not.toHaveBeenCalled();
    });

    it("refuses a token that doesn't verify", async () => {
      verifyToken.mockResolvedValue(null);
      await expect(service.getBoardStateForRecorder("Bearer forged", "class-1")).rejects.toBeInstanceOf(
        UnauthorizedException
      );
      expect(findUnique).not.toHaveBeenCalled();
    });

    it("refuses a recorder token for another class's room", async () => {
      verifyToken.mockResolvedValue({ hidden: true, recorder: true, room: "class_2" });
      findUnique.mockResolvedValue(session);
      await expect(service.getBoardStateForRecorder("Bearer t", "class-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a participant's (not hidden) token for the right room", async () => {
      verifyToken.mockResolvedValue({ room: "class_1" });
      findUnique.mockResolvedValue(session);
      await expect(service.getBoardStateForRecorder("Bearer t", "class-1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("answers an unknown class like a wrong room", async () => {
      verifyToken.mockResolvedValue({ hidden: true, recorder: true, room: "class_1" });
      findUnique.mockResolvedValue(null);
      await expect(service.getBoardStateForRecorder("Bearer t", "nope")).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
