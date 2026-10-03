import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { LiveBoardState } from "@nexa-chess/types";
import { LiveClassBoardStateService } from "./live-class-board-state.service";
import type { LiveClassAccessService } from "./live-class-access.service";
import type { PrismaService } from "../prisma/prisma.service";

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
  let service: LiveClassBoardStateService;

  beforeEach(() => {
    update = jest.fn().mockResolvedValue({});
    resolveParticipant = jest.fn();
    resolveClassManager = jest.fn().mockResolvedValue({ liveSession: { id: "session-1" } });
    service = new LiveClassBoardStateService(
      { liveSession: { update } } as unknown as PrismaService,
      { resolveParticipant, resolveClassManager } as unknown as LiveClassAccessService
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
});
