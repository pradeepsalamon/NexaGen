import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "../prisma/prisma.service";

type MockPrismaService = {
  attendancePolicy: { findFirst: jest.Mock };
  batchStudent: { findFirst: jest.Mock };
  classAttendance: { findUnique: jest.Mock };
  coachClass: { findMany: jest.Mock };
};

const ACCESS_TOKEN = "access-token";

describe("AttendanceService authorization", () => {
  let service: AttendanceService;
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
      coachClass: { findMany: jest.fn() }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: PrismaService,
          useValue: { ...prismaService, user: { findUnique: userFindUnique } }
        },
        { provide: JwtService, useValue: jwtService }
      ]
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
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
});
