import { Test, TestingModule } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import { AttendanceStatus, UserRole, UserStatus } from "@prisma/client";
import { AttendanceReportService } from "./attendance-report.service";
import { AttendanceService } from "./attendance.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";

const ACCESS_TOKEN = "access-token";

/**
 * `getStudentAttendance` reads classes newest-first, so the streak counters are
 * easy to get wrong. These drive the real service against a mocked Prisma.
 */
describe("AttendanceReportService.getStudentAttendance stats", () => {
  let service: AttendanceReportService;
  let coachClassFindMany: jest.Mock;

  /** One completed class, `attended` deciding whether a record exists. */
  const completedClass = (index: number, status: AttendanceStatus | null) => {
    const startsAt = new Date(2026, 0, 30 - index, 10, 0, 0);
    const endsAt = new Date(2026, 0, 30 - index, 11, 0, 0);
    return {
      id: `class-${index}`,
      topic: `Class ${index}`,
      startsAt,
      endsAt,
      batch: { name: "Batch A" },
      coach: { firstName: "Ada", lastName: "Coach" },
      attendances: status
        ? [
            {
              status,
              totalDuration: 3600,
              attendancePercent: 100,
              reconnectCount: 0,
              joinedAt: startsAt,
              leftAt: endsAt,
              logs: []
            }
          ]
        : []
    };
  };

  /** `P` = present, `-` = absent, read newest-first. */
  const fromPattern = (pattern: string) =>
    pattern
      .split("")
      .map((c, i) =>
        completedClass(i, c === "P" ? AttendanceStatus.PRESENT : null)
      );

  beforeEach(async () => {
    coachClassFindMany = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReportService,
        AttendanceService,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            attendancePolicy: { findFirst: jest.fn() },
            batchStudent: { findFirst: jest.fn() },
            classAttendance: { findUnique: jest.fn() },
            coachClass: { findMany: coachClassFindMany },
            user: {
              findUnique: jest.fn().mockResolvedValue({
                id: "student-1",
                role: UserRole.STUDENT,
                status: UserStatus.ACTIVE
              })
            }
          }
        },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest
              .fn()
              .mockResolvedValue({ sub: "student-1", type: "access" })
          }
        }
      ]
    }).compile();

    service = module.get(AttendanceReportService);
  });

  const statsFor = async (pattern: string) => {
    coachClassFindMany.mockResolvedValue(fromPattern(pattern));
    const { stats } = await service.getStudentAttendance(ACCESS_TOKEN);
    return stats;
  };

  it("finds a long streak buried earlier in the history", async () => {
    // Newest-first: 1 recent attendance, a miss, then a run of 4.
    const stats = await statsFor("P-PPPP");

    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(4);
  });

  it("reports the current streak when it is also the longest", async () => {
    const stats = await statsFor("PPP-P");

    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
  });

  it("resets the run on every miss", async () => {
    const stats = await statsFor("-P-PP-P");

    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(2);
  });

  it("counts nothing when the student never attended", async () => {
    const stats = await statsFor("---");

    expect(stats.attended).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.percentage).toBe(0);
  });

  it("counts PRESENT, LATE and PARTIAL alike as attended", async () => {
    coachClassFindMany.mockResolvedValue([
      completedClass(0, AttendanceStatus.PRESENT),
      completedClass(1, AttendanceStatus.LATE),
      completedClass(2, AttendanceStatus.PARTIAL),
      completedClass(3, AttendanceStatus.ABSENT)
    ]);

    const { stats } = await service.getStudentAttendance(ACCESS_TOKEN);

    expect(stats.attended).toBe(3);
    expect(stats.total).toBe(4);
    expect(stats.percentage).toBe(75);
    expect(stats.longestStreak).toBe(3);
  });
});
