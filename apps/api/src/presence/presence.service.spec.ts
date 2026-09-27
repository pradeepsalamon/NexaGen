import { UnauthorizedException } from "@nestjs/common";
import { UserRole, UserStatus } from "@prisma/client";
import { PresenceService } from "./presence.service";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ JWT_ACCESS_SECRET: "secret" })
}));

describe("PresenceService.heartbeat", () => {
  const jwt = { verifyAsync: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    liveSession: { findFirst: jest.fn() },
    liveClassPull: { findFirst: jest.fn() }
  };
  const service = new PresenceService(jwt as never, prisma as never);

  const signedInAs = (role: UserRole) => {
    jwt.verifyAsync.mockResolvedValue({ sub: "u-1", type: "access" });
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", role, status: UserStatus.ACTIVE });
  };

  beforeEach(() => jest.clearAllMocks());

  it("rejects a missing token", async () => {
    await expect(service.heartbeat(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("marks a coach online without looking up classes", async () => {
    signedInAs(UserRole.COACH);
    await expect(service.heartbeat("t")).resolves.toEqual({ liveClass: null, pull: null });
    expect(prisma.user.updateMany).toHaveBeenCalled();
    expect(prisma.liveSession.findFirst).not.toHaveBeenCalled();
  });

  it("hands a student their live class and a pending pull", async () => {
    signedInAs(UserRole.STUDENT);
    const startedAt = new Date("2026-09-28T10:00:00Z");
    const session = {
      classId: "class-1",
      startedAt,
      class: { id: "class-1", title: "Weekly", topic: "Endgames" },
      coach: { firstName: "Test", lastName: "Coach" }
    };
    prisma.liveSession.findFirst.mockResolvedValue(session);
    prisma.liveClassPull.findFirst.mockResolvedValue({
      id: "pull-1",
      requestedAt: startedAt,
      liveSession: session
    });

    const res = await service.heartbeat("t");
    expect(res.liveClass).toEqual({
      classId: "class-1",
      topic: "Endgames",
      coachName: "Test Coach",
      startedAt: startedAt.toISOString()
    });
    expect(res.pull).toMatchObject({ id: "pull-1", classId: "class-1", topic: "Endgames" });
  });
});
