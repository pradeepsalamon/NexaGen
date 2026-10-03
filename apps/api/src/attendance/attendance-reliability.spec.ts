import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus, LiveSessionStatus, AttendanceEventType } from "@prisma/client";
import { AttendanceService } from "./attendance.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";

// P0 reliability Phase 5 (RELIABILITY_DESIGN.md §4.5): admin-only, cross-class
// view of every currently-LIVE session with a reconnecting/offline
// participant.

const ACCESS_TOKEN = "access-token";

type MockPrismaService = {
  attendancePolicy: { findFirst: jest.Mock };
  liveSession: { findMany: jest.Mock };
  user: { findUnique: jest.Mock };
};

describe("AttendanceService.getLiveReliabilityOverview", () => {
  let service: AttendanceService;
  let jwtService: { verifyAsync: jest.Mock };
  let prismaService: MockPrismaService;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    prismaService.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  const coachRow = (overrides: Partial<{ lastLog: { eventType: string } | null; lastHeartbeatAt: Date | null }> = {}) => ({
    coachId: "coach-1",
    coach: { firstName: "Cara", lastName: "Coach" },
    batch: { name: "Batch A" },
    title: "Opening theory",
    topic: null,
    coachAttendance: {
      lastHeartbeatAt: overrides.lastHeartbeatAt ?? null,
      logs: overrides.lastLog === null ? [] : [overrides.lastLog ?? { eventType: AttendanceEventType.JOIN }],
    },
    attendances: [],
  });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    prismaService = {
      attendancePolicy: {
        findFirst: jest.fn().mockResolvedValue({
          gracePeriodMinutes: 5,
          presentThreshold: 90,
          lateThreshold: 70,
          partialThreshold: 30,
        }),
      },
      liveSession: { findMany: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AttendanceService);
  });

  it("rejects a coach", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    await expect(service.getLiveReliabilityOverview(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(prismaService.liveSession.findMany).not.toHaveBeenCalled();
  });

  it("rejects a student", async () => {
    authenticateAs("student-1", UserRole.STUDENT);

    await expect(service.getLiveReliabilityOverview(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("allows an admin", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([]);

    await expect(service.getLiveReliabilityOverview(ACCESS_TOKEN)).resolves.toMatchObject({
      liveClassCount: 0,
      affectedClassCount: 0,
      classes: [],
    });
  });

  it("only queries LIVE sessions", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([]);

    await service.getLiveReliabilityOverview(ACCESS_TOKEN);

    expect(prismaService.liveSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: LiveSessionStatus.LIVE } })
    );
  });

  it("excludes a LIVE class where everyone is online", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([
      {
        classId: "class-1",
        startedAt: new Date(),
        class: {
          ...coachRow(),
          id: "class-1",
          attendances: [
            {
              studentId: "student-1",
              student: { firstName: "Sam", lastName: "Student" },
              lastHeartbeatAt: null,
              logs: [{ eventType: AttendanceEventType.JOIN }],
            },
          ],
        },
      },
    ]);

    const result = await service.getLiveReliabilityOverview(ACCESS_TOKEN);

    expect(result.liveClassCount).toBe(1);
    expect(result.affectedClassCount).toBe(0);
    expect(result.classes).toEqual([]);
  });

  it("surfaces a LIVE class with an offline student and counts by role", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    const staleHeartbeat = new Date(Date.now() - 60 * 60_000); // 1h old — well past any grace period

    prismaService.liveSession.findMany.mockResolvedValue([
      {
        classId: "class-1",
        startedAt: new Date(),
        class: {
          ...coachRow(),
          id: "class-1",
          attendances: [
            {
              studentId: "student-1",
              student: { firstName: "Sam", lastName: "Student" },
              lastHeartbeatAt: staleHeartbeat,
              logs: [{ eventType: AttendanceEventType.RECONNECT }],
            },
            {
              studentId: "student-2",
              student: { firstName: "Priya", lastName: "Present" },
              lastHeartbeatAt: null,
              logs: [{ eventType: AttendanceEventType.JOIN }],
            },
          ],
        },
      },
      {
        // A second LIVE class where nothing is wrong — must not appear in
        // `classes`, but must still count toward liveClassCount.
        classId: "class-2",
        startedAt: new Date(),
        class: { ...coachRow(), id: "class-2", coachId: "coach-2" },
      },
    ]);

    const result = await service.getLiveReliabilityOverview(ACCESS_TOKEN);

    expect(result.liveClassCount).toBe(2);
    expect(result.affectedClassCount).toBe(1);
    expect(result.totalOffline).toBe(1);
    expect(result.totalReconnecting).toBe(0);

    expect(result.classes).toHaveLength(1);
    const [affected] = result.classes;
    expect(affected.classId).toBe("class-1");
    expect(affected.offlineCount).toBe(1);
    expect(affected.affectedParticipants).toEqual([
      expect.objectContaining({ id: "student-1", role: "STUDENT", presence: "OFFLINE" }),
    ]);
    // The still-present second student never shows up in the affected list.
    expect(
      affected.affectedParticipants.some((p) => p.id === "student-2")
    ).toBe(false);
  });

  it("includes a stale coach heartbeat as an affected participant", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    const staleHeartbeat = new Date(Date.now() - 60 * 60_000);

    prismaService.liveSession.findMany.mockResolvedValue([
      {
        classId: "class-1",
        startedAt: new Date(),
        class: {
          ...coachRow({ lastHeartbeatAt: staleHeartbeat }),
          id: "class-1",
        },
      },
    ]);

    const result = await service.getLiveReliabilityOverview(ACCESS_TOKEN);

    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].affectedParticipants).toEqual([
      expect.objectContaining({ id: "coach-1", role: "COACH", presence: "OFFLINE" }),
    ]);
  });
});

// P0 reliability Phase 6 (RELIABILITY_DESIGN.md §6): admin-only,
// webhook-loss / heartbeat-fallback rate over a trailing window.
describe("AttendanceService.getReliabilityMetrics", () => {
  let service: AttendanceService;
  let jwtService: { verifyAsync: jest.Mock };
  let prismaService: {
    liveSession: { findMany: jest.Mock };
    classAttendance: { findMany: jest.Mock };
    coachAttendance: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    prismaService.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    prismaService = {
      liveSession: { findMany: jest.fn() },
      classAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      coachAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AttendanceService);
  });

  it("rejects a coach", async () => {
    authenticateAs("coach-1", UserRole.COACH);

    await expect(service.getReliabilityMetrics(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("returns zeroed metrics when there are no ended sessions in the window", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([]);

    await expect(service.getReliabilityMetrics(ACCESS_TOKEN)).resolves.toEqual({
      windowDays: 30,
      sampledClasses: 0,
      totalParticipantSessions: 0,
      webhookLossCount: 0,
      webhookLossRate: 0,
      heartbeatFallbackCount: 0,
      heartbeatFallbackRate: 0,
    });
    expect(prismaService.classAttendance.findMany).not.toHaveBeenCalled();
  });

  it("clamps an out-of-range days value and queries only ENDED sessions", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([]);

    const result = await service.getReliabilityMetrics(ACCESS_TOKEN, 9999);

    expect(result.windowDays).toBe(365);
    expect(prismaService.liveSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: LiveSessionStatus.ENDED }),
      })
    );
  });

  it("counts a clean webhook leave as neither a loss nor a fallback", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([{ classId: "class-1" }]);
    prismaService.classAttendance.findMany.mockResolvedValue([
      {
        logs: [
          { eventType: AttendanceEventType.JOIN, reason: null },
          { eventType: AttendanceEventType.LEAVE, reason: "Left voluntarily" },
        ],
      },
    ]);

    const result = await service.getReliabilityMetrics(ACCESS_TOKEN);

    expect(result.totalParticipantSessions).toBe(1);
    expect(result.webhookLossCount).toBe(0);
    expect(result.heartbeatFallbackCount).toBe(0);
  });

  it("counts a heartbeat-timeout disconnect as both a loss and a fallback", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([{ classId: "class-1" }]);
    prismaService.classAttendance.findMany.mockResolvedValue([
      {
        logs: [
          { eventType: AttendanceEventType.JOIN, reason: null },
          { eventType: AttendanceEventType.DISCONNECT, reason: "heartbeat_timeout" },
        ],
      },
    ]);

    const result = await service.getReliabilityMetrics(ACCESS_TOKEN);

    expect(result.totalParticipantSessions).toBe(1);
    expect(result.webhookLossCount).toBe(1);
    expect(result.webhookLossRate).toBe(1);
    expect(result.heartbeatFallbackCount).toBe(1);
    expect(result.heartbeatFallbackRate).toBe(1);
  });

  it("counts a silently force-closed session (no LEAVE, no DISCONNECT) as a loss but not a fallback", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([{ classId: "class-1" }]);
    prismaService.classAttendance.findMany.mockResolvedValue([
      { logs: [{ eventType: AttendanceEventType.JOIN, reason: null }] },
    ]);

    const result = await service.getReliabilityMetrics(ACCESS_TOKEN);

    expect(result.webhookLossCount).toBe(1);
    expect(result.heartbeatFallbackCount).toBe(0);
  });

  it("ignores a row that never actually joined", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([{ classId: "class-1" }]);
    prismaService.classAttendance.findMany.mockResolvedValue([{ logs: [] }]);

    const result = await service.getReliabilityMetrics(ACCESS_TOKEN);

    expect(result.totalParticipantSessions).toBe(0);
    expect(result.webhookLossCount).toBe(0);
  });

  it("combines student and coach rows into one rate", async () => {
    authenticateAs("admin-1", UserRole.ADMIN);
    prismaService.liveSession.findMany.mockResolvedValue([{ classId: "class-1" }]);
    prismaService.classAttendance.findMany.mockResolvedValue([
      {
        logs: [
          { eventType: AttendanceEventType.JOIN, reason: null },
          { eventType: AttendanceEventType.LEAVE, reason: null },
        ],
      },
    ]);
    prismaService.coachAttendance.findMany.mockResolvedValue([
      {
        logs: [
          { eventType: "JOIN", reason: null },
          { eventType: "DISCONNECT", reason: "heartbeat_timeout" },
        ],
      },
    ]);

    const result = await service.getReliabilityMetrics(ACCESS_TOKEN);

    expect(result.totalParticipantSessions).toBe(2);
    expect(result.webhookLossCount).toBe(1);
    expect(result.webhookLossRate).toBe(0.5);
    expect(result.heartbeatFallbackCount).toBe(1);
  });
});
