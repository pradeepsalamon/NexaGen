import { BadRequestException, ConflictException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { PreviewBatchScheduleRequest } from "@nexa-chess/types";
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

  const service = new BatchScheduleService(
    jwt as unknown as JwtService,
    prisma as unknown as PrismaService
  );
  return { service, prisma };
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
  });
});
