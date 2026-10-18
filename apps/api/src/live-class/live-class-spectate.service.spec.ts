import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { LiveClassSpectateService } from "./live-class-spectate.service";
import type { LiveClassAccessService } from "./live-class-access.service";
import type { LiveKitService } from "./livekit.service";
import type { PrismaService } from "../prisma/prisma.service";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "session-1",
  classId: "class-1",
  coachId: "coach-1",
  roomName: "class_class-1",
  status: "LIVE",
  startedAt: new Date("2026-10-11T10:00:00.000Z"),
  recordingStatus: null,
  boardState: null,
  batch: { id: "batch-1", name: "Knights", _count: { students: 6 } },
  class: {
    id: "class-1",
    title: "Endgames",
    topic: "Rook endings",
    isDemo: false,
    startsAt: new Date("2026-10-11T10:00:00.000Z"),
    endsAt: new Date("2026-10-11T11:00:00.000Z"),
  },
  coach: { id: "coach-1", firstName: "Asha", lastName: "Rao" },
  ...overrides,
});

const meta = (role: string) => JSON.stringify({ role });

describe("LiveClassSpectateService", () => {
  let service: LiveClassSpectateService;
  let authenticate: jest.Mock;
  let findMany: jest.Mock;
  let findUnique: jest.Mock;
  let listParticipants: jest.Mock;
  let generateSpectatorToken: jest.Mock;
  let broadcastData: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    authenticate = jest.fn().mockResolvedValue({ id: "admin-1", role: UserRole.ADMIN, firstName: "Ada", lastName: null });
    findMany = jest.fn().mockResolvedValue([session()]);
    findUnique = jest.fn().mockResolvedValue(session());
    listParticipants = jest.fn().mockResolvedValue([
      { identity: "coach-1_tab", metadata: meta("COACH") },
      { identity: "stu-1_tabA", metadata: meta("STUDENT") },
      { identity: "stu-1_tabB", metadata: meta("STUDENT") },
      { identity: "stu-2", metadata: meta("STUDENT") },
      { identity: "guest_reg-1", metadata: meta("STUDENT") },
      { identity: "spectator_admin-9_x", metadata: meta("SPECTATOR") },
      { identity: "EG_abc", metadata: "" },
    ]);
    generateSpectatorToken = jest.fn().mockResolvedValue("lk-token");
    broadcastData = jest.fn().mockResolvedValue(undefined);

    service = new LiveClassSpectateService(
      { liveSession: { findMany, findUnique } } as unknown as PrismaService,
      { listParticipants, generateSpectatorToken, broadcastData } as unknown as LiveKitService,
      { authenticate } as unknown as LiveClassAccessService
    );
  });

  afterEach(() => jest.useRealTimers());

  it.each([UserRole.COACH, UserRole.STUDENT])("refuses a %s", async (role) => {
    authenticate.mockResolvedValue({ id: "u", role });
    await expect(service.listLiveClasses("t")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.spectate("t", "class-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(generateSpectatorToken).not.toHaveBeenCalled();
  });

  it("lists every live class with people (not tabs) counted, spectators and the recorder excluded", async () => {
    const { classes } = await service.listLiveClasses("t");
    expect(classes).toHaveLength(1);
    expect(classes[0]).toMatchObject({
      classId: "class-1",
      title: "Endgames",
      coachName: "Asha Rao",
      batchName: "Knights",
      enrolledCount: 6,
      studentsInRoom: 3,
      coachInRoom: true,
      startedAt: "2026-10-11T10:00:00.000Z",
    });
  });

  it("reports unknown counts rather than an empty room when LiveKit is down", async () => {
    listParticipants.mockRejectedValue(new Error("down"));
    const { classes } = await service.listLiveClasses("t");
    expect(classes[0].studentsInRoom).toBeNull();
    expect(classes[0].coachInRoom).toBeNull();
  });

  it("mints a hidden spectator seat for a super admin with no enrolment or approval", async () => {
    authenticate.mockResolvedValue({ id: "sa-1", role: UserRole.SUPER_ADMIN, firstName: "Sam", lastName: "Lee" });
    const res = await service.spectate("t", "class-1", "tab-7");
    expect(generateSpectatorToken).toHaveBeenCalledWith({
      roomName: "class_class-1",
      participantIdentity: "spectator_sa-1_tab-7",
      participantName: "Sam Lee",
    });
    expect(res.token).toBe("lk-token");
    expect(res.class.classId).toBe("class-1");
    expect(res.boardState).toBeNull();

    // The coach is asked to re-broadcast the board for the new seat.
    jest.runAllTimers();
    expect(broadcastData).toHaveBeenCalledWith("class_class-1", expect.any(Uint8Array), "board_sync");
  });

  it("returns a saved board snapshot so the board paints immediately", async () => {
    const boardState = {
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      pgn: "",
      historyIndex: -1,
      orientation: "white",
      arrows: [],
      squares: {},
    };
    findUnique.mockResolvedValue(session({ boardState }));
    const res = await service.spectate("t", "class-1");
    expect(res.boardState).toEqual(boardState);
  });

  it("404s a class that is not live", async () => {
    findUnique.mockResolvedValue(session({ status: "ENDED" }));
    await expect(service.spectate("t", "class-1")).rejects.toBeInstanceOf(NotFoundException);
    findUnique.mockResolvedValue(null);
    await expect(service.spectate("t", "class-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
