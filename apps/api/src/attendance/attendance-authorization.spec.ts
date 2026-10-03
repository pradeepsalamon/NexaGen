import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { AttendanceReportService } from "./attendance-report.service";
import { AttendanceService } from "./attendance.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";

type MockPrismaService = {
  attendancePolicy: { findFirst: jest.Mock };
  batchStudent: { findFirst: jest.Mock };
  classAttendance: { findUnique: jest.Mock };
  coachClass: { findMany: jest.Mock; findUnique: jest.Mock };
  liveSession: { updateMany: jest.Mock };
};

const ACCESS_TOKEN = "access-token";

describe("AttendanceReportService authorization", () => {
  let service: AttendanceReportService;
  let attendance: AttendanceService;
  let jwtService: { verifyAsync: jest.Mock };
  let prismaService: MockPrismaService;
  let userFindUnique: jest.Mock;

  const authenticateAs = (id: string, role: UserRole) => {
    jwtService.verifyAsync.mockResolvedValue({ sub: id, type: "access" });
    userFindUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE });
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    userFindUnique = jest.fn();

    prismaService = {
      attendancePolicy: { findFirst: jest.fn() },
      batchStudent: { findFirst: jest.fn() },
      classAttendance: { findUnique: jest.fn() },
      coachClass: { findMany: jest.fn(), findUnique: jest.fn() },
      liveSession: { updateMany: jest.fn() }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReportService,
        AttendanceService,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: { ...prismaService, user: { findUnique: userFindUnique } }
        },
        { provide: JwtService, useValue: jwtService }
      ]
    }).compile();

    service = module.get(AttendanceReportService);
    attendance = module.get(AttendanceService);
  });

  describe("getStudentAttendance", () => {
    it("rejects a coach who does not teach the student", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      prismaService.batchStudent.findFirst.mockResolvedValue(null);

      await expect(
        service.getStudentAttendance(ACCESS_TOKEN, "student-1")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prismaService.coachClass.findMany).not.toHaveBeenCalled();
    });

    it("allows a coach who shares a batch with the student", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      prismaService.batchStudent.findFirst.mockResolvedValue({ id: "enrolment-1" });
      prismaService.coachClass.findMany.mockResolvedValue([]);

      await expect(
        service.getStudentAttendance(ACCESS_TOKEN, "student-1")
      ).resolves.toMatchObject({ history: [] });
    });

    it("allows an admin without a batch check", async () => {
      authenticateAs("admin-1", UserRole.ADMIN);
      prismaService.coachClass.findMany.mockResolvedValue([]);

      await expect(
        service.getStudentAttendance(ACCESS_TOKEN, "student-1")
      ).resolves.toMatchObject({ history: [] });

      expect(prismaService.batchStudent.findFirst).not.toHaveBeenCalled();
    });

    it("rejects a student asking for someone else", async () => {
      authenticateAs("student-2", UserRole.STUDENT);

      await expect(
        service.getStudentAttendance(ACCESS_TOKEN, "student-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("getAttendanceLogs", () => {
    const attendanceFor = (coachId: string) => ({
      id: "attendance-1",
      logs: [],
      joinedAt: null,
      leftAt: null,
      totalDuration: 0,
      attendancePercent: 0,
      status: "PRESENT",
      reconnectCount: 0,
      class: { id: "class-1", coachId, startsAt: new Date(), endsAt: new Date() }
    });

    it("rejects a coach who does not own the class", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      prismaService.classAttendance.findUnique.mockResolvedValue(
        attendanceFor("coach-2")
      );

      await expect(
        service.getAttendanceLogs(ACCESS_TOKEN, "class-1", "student-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("allows the coach who owns the class", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      prismaService.classAttendance.findUnique.mockResolvedValue(
        attendanceFor("coach-1")
      );

      await expect(
        service.getAttendanceLogs(ACCESS_TOKEN, "class-1", "student-1")
      ).resolves.toBeDefined();
    });

    it("rejects a student reading another student's logs", async () => {
      authenticateAs("student-2", UserRole.STUDENT);

      await expect(
        service.getAttendanceLogs(ACCESS_TOKEN, "class-1", "student-1")
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prismaService.classAttendance.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("getClassSummary", () => {
    const baseClass = (overrides: Record<string, unknown> = {}) => ({
      id: "class-1",
      coachId: "coach-1",
      topic: "Endgames",
      status: "COMPLETED",
      startsAt: new Date("2026-01-01T10:00:00Z"),
      endsAt: new Date("2026-01-01T11:00:00Z"),
      coach: { firstName: "Coach", lastName: "One" },
      batch: {
        name: "Batch A",
        students: [
          { studentId: "student-1", student: { firstName: "Stu", lastName: "One", email: "s1@x.io" } }
        ]
      },
      liveSession: {
        status: "ENDED",
        startedAt: new Date("2026-01-01T10:00:00Z"),
        endedAt: new Date("2026-01-01T10:55:00Z"),
        attendanceFinalizedAt: new Date("2026-01-01T10:56:00Z")
      },
      coachAttendance: null,
      attendances: [
        {
          studentId: "student-1",
          status: "PRESENT",
          attendancePercent: 92,
          totalDuration: 3000,
          joinedAt: new Date("2026-01-01T10:01:00Z"),
          leftAt: new Date("2026-01-01T10:55:00Z"),
          reconnectCount: 1,
          logs: [],
          student: { firstName: "Stu", lastName: "One", email: "s1@x.io" }
        }
      ],
      ...overrides
    });

    it("rejects a student not enrolled in the batch", async () => {
      authenticateAs("student-2", UserRole.STUDENT);
      prismaService.coachClass.findUnique.mockResolvedValue(baseClass());

      await expect(
        service.getClassSummary(ACCESS_TOKEN, "class-1")
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns the enrolled student's own attendance and no full report", async () => {
      authenticateAs("student-1", UserRole.STUDENT);
      prismaService.coachClass.findUnique.mockResolvedValue(baseClass());

      const res = await service.getClassSummary(ACCESS_TOKEN, "class-1");

      expect(res.viewerRole).toBe("STUDENT");
      expect(res.report).toBeNull();
      expect(res.finalized).toBe(true);
      expect(res.myAttendance).toMatchObject({ status: "PRESENT", attendancePercent: 92 });
    });

    it("returns the full report for the owning coach", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      prismaService.coachClass.findUnique.mockResolvedValue(baseClass());

      const res = await service.getClassSummary(ACCESS_TOKEN, "class-1");

      expect(res.viewerRole).toBe("COACH");
      expect(res.myAttendance).toBeNull();
      expect(res.report).toMatchObject({ totalStudents: 1, presentCount: 1 });
    });

    it("lazy-finalizes when the class ended but the marker is unset", async () => {
      authenticateAs("coach-1", UserRole.COACH);
      const unfinalized = baseClass({
        liveSession: { status: "ENDED", startedAt: new Date(), endedAt: new Date(), attendanceFinalizedAt: null }
      });
      prismaService.coachClass.findUnique
        .mockResolvedValueOnce(unfinalized)
        .mockResolvedValue(baseClass());
      const finalizeSpy = jest
        .spyOn(attendance, "finalizeClassAttendance")
        .mockResolvedValue(undefined);

      const res = await service.getClassSummary(ACCESS_TOKEN, "class-1");

      expect(finalizeSpy).toHaveBeenCalledWith("class-1");
      expect(res.finalized).toBe(true);
    });
  });
});
