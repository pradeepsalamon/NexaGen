import type { LiveKitService } from "../live-class/livekit.service";
import type { JobLockService } from "../prisma/job-lock.service";
import type { PrismaService } from "../prisma/prisma.service";
import { AttendanceRoomPresenceService, ROOM_JOIN_GRACE_MS } from "./attendance-room-presence.service";
import type { AttendanceService } from "./attendance.service";

describe("AttendanceRoomPresenceService", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  const old = new Date(now.getTime() - ROOM_JOIN_GRACE_MS - 1000);
  const fresh = new Date(now.getTime() - 10_000);
  const open = (at: Date) => ({ sessionStart: at, timestamp: at });

  let prisma: {
    classAttendance: { findMany: jest.Mock };
    coachAttendance: { findUnique: jest.Mock };
    liveSession: { findMany: jest.Mock };
  };
  let attendance: { recordCoachDisconnectEvent: jest.Mock; recordDisconnectEvent: jest.Mock };
  let listParticipants: jest.Mock;
  let service: AttendanceRoomPresenceService;

  beforeEach(() => {
    prisma = {
      classAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      coachAttendance: { findUnique: jest.fn().mockResolvedValue(null) },
      liveSession: {
        findMany: jest.fn().mockResolvedValue([{ classId: "class-1", roomName: "class_class-1" }])
      }
    };
    attendance = {
      recordCoachDisconnectEvent: jest.fn().mockResolvedValue(null),
      recordDisconnectEvent: jest.fn().mockResolvedValue(null)
    };
    listParticipants = jest.fn().mockResolvedValue([]);
    service = new AttendanceRoomPresenceService(
      prisma as unknown as PrismaService,
      {} as JobLockService,
      attendance as unknown as AttendanceService,
      { listParticipants } as unknown as LiveKitService
    );
  });

  it("closes every open session of a student who is not in the room, however fresh their heartbeat", async () => {
    prisma.classAttendance.findMany.mockResolvedValue([
      { logs: [open(old), open(old)], studentId: "student-1" }
    ]);

    await service.sweep(now);

    expect(attendance.recordDisconnectEvent).toHaveBeenCalledTimes(2);
    expect(attendance.recordDisconnectEvent).toHaveBeenCalledWith("class-1", "student-1", "not_in_room");
  });

  it("leaves a student who is in the room, on any tab", async () => {
    listParticipants.mockResolvedValue([{ identity: "student-1_tab-b" }]);
    prisma.classAttendance.findMany.mockResolvedValue([{ logs: [open(old)], studentId: "student-1" }]);

    await service.sweep(now);

    expect(attendance.recordDisconnectEvent).not.toHaveBeenCalled();
  });

  it("gives a just-issued token time to connect", async () => {
    prisma.classAttendance.findMany.mockResolvedValue([{ logs: [open(fresh)], studentId: "student-1" }]);

    await service.sweep(now);

    expect(attendance.recordDisconnectEvent).not.toHaveBeenCalled();
  });

  it("does not count the coach's board tab as the coach being in class", async () => {
    listParticipants.mockResolvedValue([{ identity: "coach-1_board" }]);
    prisma.coachAttendance.findUnique.mockResolvedValue({ coachId: "coach-1", logs: [open(old)] });

    await service.sweep(now);

    expect(attendance.recordCoachDisconnectEvent).toHaveBeenCalledWith("class-1", "coach-1", "not_in_room");
  });

  it("treats a LiveKit outage as unknown, not as an empty room", async () => {
    listParticipants.mockRejectedValue(new Error("connect ECONNREFUSED"));
    prisma.classAttendance.findMany.mockResolvedValue([{ logs: [open(old)], studentId: "student-1" }]);
    prisma.coachAttendance.findUnique.mockResolvedValue({ coachId: "coach-1", logs: [open(old)] });

    await service.sweep(now);

    expect(attendance.recordDisconnectEvent).not.toHaveBeenCalled();
    expect(attendance.recordCoachDisconnectEvent).not.toHaveBeenCalled();
  });
});
