import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { TeachingDataAggregationService } from "./teaching-data-aggregation.service";

/**
 * Teaching-data aggregation.
 *
 * This service is read-only by design — it must never re-derive a duration
 * AttendanceService already computed, and it must correctly attribute a
 * cancellation to coach/student/admin so payroll cancellation rules apply to
 * the right party.
 */
describe("TeachingDataAggregationService", () => {
  const start = new Date("2026-09-01T00:00:00.000Z");
  const end = new Date("2026-10-01T00:00:00.000Z");

  const build = async (classes: Record<string, unknown>[], inFlightCount = 0) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachingDataAggregationService,
        {
          provide: PrismaService,
          useValue: {
            coachClass: {
              count: jest.fn().mockResolvedValue(inFlightCount),
              findMany: jest.fn().mockResolvedValue(classes)
            }
          }
        }
      ]
    }).compile();
    return module.get(TeachingDataAggregationService);
  };

  it("refuses to aggregate while a class in the window hasn't run yet", async () => {
    const service = await build([], 1);
    await expect(service.getTeachingData("coach1", start, end)).rejects.toThrow(ConflictException);
  });

  it("sums teaching/board seconds only from COMPLETED classes", async () => {
    const service = await build([
      {
        id: "c1",
        status: "COMPLETED",
        startsAt: new Date("2026-09-05T10:00:00Z"),
        endsAt: new Date("2026-09-05T11:00:00Z"),
        cancelledAt: null,
        cancelledBy: null,
        coachAttendance: { status: "PRESENT", totalDuration: 3000, boardDuration: 1200 }
      },
      {
        id: "c2",
        status: "CANCELLED",
        startsAt: new Date("2026-09-06T10:00:00Z"),
        endsAt: new Date("2026-09-06T11:00:00Z"),
        cancelledAt: new Date("2026-09-06T09:00:00Z"),
        cancelledBy: { role: "COACH" },
        coachAttendance: null
      }
    ]);
    const { summary } = await service.getTeachingData("coach1", start, end);
    expect(summary.completedClassesCount).toBe(1);
    expect(summary.totalTeachingSeconds).toBe(3000);
    expect(summary.totalBoardSeconds).toBe(1200);
  });

  it("attributes a cancellation to the acting user's role", async () => {
    const service = await build([
      {
        id: "byCoach",
        status: "CANCELLED",
        startsAt: new Date("2026-09-05T10:00:00Z"),
        endsAt: new Date("2026-09-05T11:00:00Z"),
        cancelledAt: new Date("2026-09-05T05:00:00Z"),
        cancelledBy: { role: "COACH" },
        coachAttendance: null
      },
      {
        id: "byAdmin",
        status: "CANCELLED",
        startsAt: new Date("2026-09-06T10:00:00Z"),
        endsAt: new Date("2026-09-06T11:00:00Z"),
        cancelledAt: new Date("2026-09-06T09:00:00Z"),
        cancelledBy: { role: "ADMIN" },
        coachAttendance: null
      },
      {
        id: "bySuperAdmin",
        status: "CANCELLED",
        startsAt: new Date("2026-09-07T10:00:00Z"),
        endsAt: new Date("2026-09-07T11:00:00Z"),
        cancelledAt: new Date("2026-09-07T09:00:00Z"),
        cancelledBy: { role: "SUPER_ADMIN" },
        coachAttendance: null
      },
      {
        id: "unattributed",
        status: "CANCELLED",
        startsAt: new Date("2026-09-08T10:00:00Z"),
        endsAt: new Date("2026-09-08T11:00:00Z"),
        cancelledAt: null,
        cancelledBy: null,
        coachAttendance: null
      }
    ]);
    const { summary, cancelledClasses } = await service.getTeachingData("coach1", start, end);

    expect(summary.cancelledByCoachCount).toBe(1);
    expect(summary.cancelledByAdminCount).toBe(2); // ADMIN + SUPER_ADMIN both bucket as ADMIN
    expect(summary.cancelledByStudentCount).toBe(0);
    expect(summary.scheduledClassesCount).toBe(4); // includes the unattributed row

    const unattributed = cancelledClasses.find((c) => c.classId === "unattributed");
    expect(unattributed?.cancelledBy).toBeNull();
    expect(unattributed?.noticeHours).toBeNull();
  });

  it("computes notice hours as the gap between cancellation and the original start time", async () => {
    const service = await build([
      {
        id: "c1",
        status: "CANCELLED",
        startsAt: new Date("2026-09-05T12:00:00Z"),
        endsAt: new Date("2026-09-05T13:00:00Z"),
        cancelledAt: new Date("2026-09-05T10:30:00Z"), // 1.5h before start
        cancelledBy: { role: "STUDENT" },
        coachAttendance: null
      }
    ]);
    const { cancelledClasses } = await service.getTeachingData("coach1", start, end);
    expect(cancelledClasses[0].noticeHours).toBeCloseTo(1.5);
    expect(cancelledClasses[0].cancelledBy).toBe("STUDENT");
  });

  it("flags a coach no-show — COMPLETED class, coach marked ABSENT", async () => {
    const service = await build([
      {
        id: "c1",
        status: "COMPLETED",
        startsAt: new Date("2026-09-05T10:00:00Z"),
        endsAt: new Date("2026-09-05T11:00:00Z"),
        cancelledAt: null,
        cancelledBy: null,
        coachAttendance: { status: "ABSENT", totalDuration: 0, boardDuration: 0 }
      }
    ]);
    const { summary } = await service.getTeachingData("coach1", start, end);
    expect(summary.noShowCount).toBe(1);
    // A no-show earns no per-class pay.
    expect(summary.completedClassesCount).toBe(0);
  });
});
