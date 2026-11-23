import { BadRequestException, ConflictException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { PreviewBatchScheduleRequest } from "@nexa-chess/types";
import type { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import type { PrismaService } from "../prisma/prisma.service";
import { BatchScheduleService } from "./batch-schedule.service";

/**
 * These specs exercise the scheduling logic (preview counts, conflict gating,
 * occurrence-action guards) with a hand-rolled Prisma stub. The recurrence math
 * itself is covered exhaustively in recurrence.util.spec.ts.
 */

const ADMIN = { id: "admin1", role: "ADMIN", status: "ACTIVE" };

function makeService(overrides: Record<string, unknown> = {}) {
  const jwt = {
    verifyAsync: jest.fn().mockResolvedValue({ type: "access", sub: ADMIN.id })
  };

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(ADMIN),
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "john", firstName: "John", lastName: "Doe" }]),
      findFirst: jest.fn().mockResolvedValue({ id: "john" })
    },
    batch: { findFirst: jest.fn().mockResolvedValue({ id: "batch1", name: "Batch A" }) },
    course: { findUnique: jest.fn().mockResolvedValue({ id: "c1", title: "Intermediate" }) },
    coachClass: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 })
    },
    batchClassSchedule: {
      create: jest.fn().mockResolvedValue({ id: "sched1", title: "Weekly" }),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    batchClassScheduleRule: {
      create: jest
        .fn()
        .mockImplementation((args: { data: { dayOfWeek: number } }) =>
          Promise.resolve({ id: `rule-${args.data.dayOfWeek}`, ...args.data })
        )
    },
    batchScheduleException: { createMany: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn()
  };
  Object.assign(prisma, overrides);
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));

  const messaging = { dispatchInBackground: jest.fn() };
  const service = new BatchScheduleService(
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService,
    messaging as unknown as MessagingDispatchService
  );
  return { messaging, prisma, service };
}

const baseBody: PreviewBatchScheduleRequest = {
  batchId: "batch1",
  timezone: "Asia/Kolkata",
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  rules: [
    { dayOfWeek: 1, startTime: "18:00", endTime: "19:00", coachId: "john" },
    { dayOfWeek: 3, startTime: "18:00", endTime: "19:00", coachId: "john" }
  ]
};

describe("BatchScheduleService", () => {
  describe("preview", () => {
    it("returns occurrence counts and a weekly summary", async () => {
      const { service } = makeService();
      const res = await service.preview("token", baseBody);
      expect(res.totalCount).toBe(9);
      expect(res.weeklySummary).toHaveLength(2);
      expect(res.conflicts).toHaveLength(0);
      expect(res.firstClassAt).toBe(res.occurrences[0].startsAt);
    });

    it("flags a coach conflict against an existing overlapping class", async () => {
      const { service } = makeService({
        coachClass: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "existing1",
              title: "Other batch",
              topic: null,
              coachId: "john",
              batchId: "otherBatch",
              startsAt: new Date("2026-09-02T12:30:00Z"),
              endsAt: new Date("2026-09-02T13:30:00Z")
            }
          ]),
          groupBy: jest.fn().mockResolvedValue([])
        }
      });
      const res = await service.preview("token", baseBody);
      expect(res.conflicts.length).toBeGreaterThan(0);
      expect(res.conflicts[0].type).toBe("COACH");
      expect(res.occurrences.find((o) => o.date === "2026-09-02")?.hasConflict).toBe(true);
    });

    it("rejects overlapping rules on the same weekday", async () => {
      const { service } = makeService();
      await expect(
        service.preview("token", {
          ...baseBody,
          rules: [
            { dayOfWeek: 1, startTime: "18:00", endTime: "19:30", coachId: "john" },
            { dayOfWeek: 1, startTime: "19:00", endTime: "20:00", coachId: "john" }
          ]
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("create", () => {
    it("blocks creation when conflicts exist and force is not set", async () => {
      const { service } = makeService({
        coachClass: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: "existing1",
              title: "Clash",
              topic: null,
              coachId: "john",
              batchId: "batch1",
              startsAt: new Date("2026-09-02T12:30:00Z"),
              endsAt: new Date("2026-09-02T13:30:00Z")
            }
          ]),
          groupBy: jest.fn().mockResolvedValue([]),
          createMany: jest.fn().mockResolvedValue({ count: 0 })
        }
      });
      await expect(service.create("token", baseBody)).rejects.toThrow(ConflictException);
    });

    it("generates future sessions and numbers them from 1", async () => {
      const createMany = jest.fn().mockResolvedValue({ count: 0 });
      const { service } = makeService({
        coachClass: {
          findMany: jest.fn().mockResolvedValue([]),
          groupBy: jest.fn().mockResolvedValue([]),
          createMany
        },
        batchClassSchedule: {
          create: jest.fn().mockResolvedValue({ id: "sched1", title: "Weekly" }),
          findUnique: jest.fn().mockResolvedValue({
            id: "sched1",
            batchId: "batch1",
            title: "Weekly",
            timezone: "Asia/Kolkata",
            startDate: new Date("2099-09-01T00:00:00Z"),
            endDate: new Date("2099-09-30T00:00:00Z"),
            status: "ACTIVE",
            courseId: null,
            createdAt: new Date(),
            batch: { name: "Batch A" },
            course: null,
            rules: [],
            exceptions: [],
            _count: { rules: 2 }
          }),
          findMany: jest.fn().mockResolvedValue([])
        }
      });
      const res = await service.create("token", {
        ...baseBody,
        startDate: "2099-09-01",
        endDate: "2099-09-30"
      });
      expect(createMany).toHaveBeenCalledTimes(1);
      const rows = createMany.mock.calls[0][0].data as Array<{
        sessionNumber: number;
        status: string;
      }>;
      expect(rows).toHaveLength(9);
      expect(rows[0].sessionNumber).toBe(1);
      expect(rows[8].sessionNumber).toBe(9);
      expect(rows.every((r) => r.status === "SCHEDULED")).toBe(true);
      expect(res.generatedCount).toBe(9);
    });
  });

  describe("occurrenceAction", () => {
    it("refuses to cancel a completed class", async () => {
      const { service } = makeService({
        coachClass: {
          findUnique: jest.fn().mockResolvedValue({
            id: "cls1",
            scheduleId: "sched1",
            status: "COMPLETED",
            coachId: "john",
            batchId: "batch1",
            startsAt: new Date(),
            endsAt: new Date()
          })
        }
      });
      await expect(
        service.occurrenceAction("token", "cls1", { action: "CANCEL" })
      ).rejects.toThrow(ConflictException);
    });

    // Review M1: an admin's change reaches families like a coach's does.
    const scheduled = (over: Record<string, unknown> = {}) => ({
      batchId: "batch1",
      coachId: "john",
      endsAt: new Date("2099-01-01T11:00:00.000Z"),
      id: "cls1",
      scheduleId: "sched1",
      startsAt: new Date("2099-01-01T10:00:00.000Z"),
      status: "SCHEDULED",
      ...over
    });
    const classWith = (row: Record<string, unknown>) => ({
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(row),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...row, batch: { name: "A" }, coach: { firstName: "J", lastName: null }, liveSession: null }),
      update: jest.fn()
    });

    it("announces a cancelled class", async () => {
      const { messaging, service } = makeService({ coachClass: classWith(scheduled()) });
      await service.occurrenceAction("token", "cls1", { action: "CANCEL" });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "cls1", event: "CLASS_CANCELLED" });
    });

    it("announces a moved class and a new coach", async () => {
      const { messaging, service } = makeService({ coachClass: classWith(scheduled()) });
      await service.occurrenceAction("token", "cls1", {
        action: "RESCHEDULE",
        coachId: "mary",
        endsAt: "2099-01-02T11:00:00.000Z",
        startsAt: "2099-01-02T10:00:00.000Z"
      });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "cls1", event: "CLASS_RESCHEDULED" });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "cls1", event: "CLASS_SUBSTITUTE_ASSIGNED" });
    });

    it("says nothing about a time that didn't change", async () => {
      const { messaging, service } = makeService({ coachClass: classWith(scheduled()) });
      await service.occurrenceAction("token", "cls1", {
        action: "RESCHEDULE",
        endsAt: "2099-01-01T11:00:00.000Z",
        startsAt: "2099-01-01T10:00:00.000Z"
      });
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });
  });

  describe("deactivate", () => {
    it("cancels the schedule's future classes and announces each one", async () => {
      const { messaging, prisma, service } = makeService();
      prisma.batchClassSchedule.findUnique.mockResolvedValue({ id: "sched1" });
      (prisma.batchClassSchedule as Record<string, jest.Mock>).update = jest.fn();
      prisma.coachClass.findMany.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
      jest.spyOn(service as unknown as { loadDetail: () => Promise<unknown> }, "loadDetail").mockResolvedValue({});

      const res = await service.deactivate("token", "sched1");

      expect(res.cancelledCount).toBe(2);
      expect(prisma.coachClass.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ["c1", "c2"] }, status: "SCHEDULED" } })
      );
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "c1", event: "CLASS_CANCELLED" });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "c2", event: "CLASS_CANCELLED" });
    });
  });
});

// Business decision (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md, §3
// "Recurring schedules"): ADMIN and SUPER_ADMIN both manage recurring schedules;
// the web's /admin/schedule is open to both (STAFF_ROLES) to match.
describe("BatchScheduleService authority", () => {
  it.each(["ADMIN", "SUPER_ADMIN"])("lets %s manage recurring schedules", async (role) => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ ...ADMIN, role });
    await expect(service.preview("token", baseBody)).resolves.toBeDefined();
  });

  it.each(["COACH", "STUDENT"])("refuses %s", async (role) => {
    const { service, prisma } = makeService();
    prisma.user.findUnique.mockResolvedValue({ ...ADMIN, role });
    await expect(service.preview("token", baseBody)).rejects.toMatchObject({ status: 403 });
  });
});
