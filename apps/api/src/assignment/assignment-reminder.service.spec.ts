import { ForbiddenException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";
import { resolveAssignmentDueStatus } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { AssignmentReminderService } from "./assignment-reminder.service";

const KOLKATA = "Asia/Kolkata";
// 10:00 IST on 15 Oct 2026.
const NOW = new Date("2026-10-15T04:30:00.000Z");
const HOUR = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * HOUR);

describe("resolveAssignmentDueStatus", () => {
  const status = (due: Date, completed = false, tz = KOLKATA) =>
    resolveAssignmentDueStatus({ completed, dueDate: due }, NOW, tz);

  it("calls finished work completed whatever the date", () => {
    expect(status(at(-100), true)).toBe("COMPLETED");
  });
  it("is overdue the moment the deadline passes", () => {
    expect(status(at(-0.01))).toBe("OVERDUE");
    expect(status(NOW)).toBe("OVERDUE");
  });
  it("is due today until the viewer's own midnight", () => {
    // 23:59 IST the same day.
    expect(status(new Date("2026-10-15T18:29:00.000Z"))).toBe("DUE_TODAY");
    // 00:30 IST the next day — tomorrow in Kolkata, but still today in UTC.
    expect(status(new Date("2026-10-15T19:00:00.000Z"))).toBe("DUE_SOON");
    expect(status(new Date("2026-10-15T19:00:00.000Z"), false, "UTC")).toBe("DUE_TODAY");
  });
  it("is due soon within 48 hours and upcoming after", () => {
    expect(status(at(47))).toBe("DUE_SOON");
    expect(status(at(49))).toBe("UPCOMING");
  });
  it("accepts ISO strings", () => {
    expect(resolveAssignmentDueStatus({ completed: false, dueDate: at(-1).toISOString() }, NOW, KOLKATA)).toBe(
      "OVERDUE"
    );
  });
});

describe("AssignmentReminderService", () => {
  let prisma: {
    assignmentBatch: { findMany: jest.Mock };
    studentAssignment: { findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let service: AssignmentReminderService;
  const as = (id: string, role: string) =>
    prisma.user.findUnique.mockResolvedValue({ id, role, status: UserStatus.ACTIVE, timezone: KOLKATA });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = {
      assignmentBatch: { findMany: jest.fn().mockResolvedValue([]) },
      studentAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn() }
    };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "x", type: "access" }) };
    service = new AssignmentReminderService(jwt as unknown as JwtService, prisma as unknown as PrismaService);
  });

  afterEach(() => jest.useRealTimers());

  describe("reminders", () => {
    const row = (id: string, due: Date, status = "PENDING") => ({
      assignmentBatch: { assignment: { title: id }, batch: { name: "B1" }, dueDate: due },
      id,
      status
    });

    it("is for students only", async () => {
      as("coach", "COACH");
      await expect(service.reminders("t")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("only reads the caller's own unfinished work inside the window", async () => {
      as("stu", "STUDENT");
      await service.reminders("t");
      const { where } = prisma.studentAssignment.findMany.mock.calls[0][0];
      expect(where.studentId).toBe("stu");
      expect(where.status).toEqual({ in: ["PENDING", "IN_PROGRESS"] });
      expect(where.assignmentBatch.dueDate.lte.getTime()).toBe(at(48).getTime());
    });

    it("orders overdue, then due today, then due soon, and counts each", async () => {
      as("stu", "STUDENT");
      prisma.studentAssignment.findMany.mockResolvedValue([
        row("soon", at(30)),
        row("today", at(5), "IN_PROGRESS"),
        row("late-old", at(-50)),
        row("late-new", at(-2))
      ]);

      const res = await service.reminders("t");

      expect(res.items.map((i) => i.id)).toEqual(["late-old", "late-new", "today", "soon"]);
      expect(res.counts).toEqual({ dueSoon: 1, dueToday: 1, overdue: 2 });
      expect(res.items[2]).toMatchObject({ dueStatus: "DUE_TODAY", status: "IN_PROGRESS" });
    });
  });

  describe("overview", () => {
    const deployment = (id: string, batchId: string, due: Date, statuses: string[]) => ({
      assignment: { id: `a-${id}`, title: id },
      batch: { id: batchId, name: batchId.toUpperCase() },
      batchId,
      dueDate: due,
      id,
      students: statuses.map((status, i) => ({
        completedAt: status === "COMPLETED" ? NOW : null,
        id: `${id}-sa${i}`,
        status,
        student: { firstName: `S${i}`, id: `s${i}`, lastName: null },
        studentId: `s${i}`
      }))
    });

    it("refuses students", async () => {
      as("stu", "STUDENT");
      await expect(service.overview("t", {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("scopes a coach to the batches they coach; an admin sees every live batch", async () => {
      as("coach", "COACH");
      await service.overview("t", {});
      expect(prisma.assignmentBatch.findMany.mock.calls[0][0].where.batch).toEqual({
        coaches: { some: { coachId: "coach", isDeleted: false } },
        isDeleted: false
      });

      as("admin", "ADMIN");
      await service.overview("t", {});
      expect(prisma.assignmentBatch.findMany.mock.calls[1][0].where.batch).toEqual({ isDeleted: false });
    });

    it("derives each deployment's status, totals and outstanding students", async () => {
      as("coach", "COACH");
      prisma.assignmentBatch.findMany.mockResolvedValue([
        deployment("done", "b1", at(-5), ["COMPLETED", "COMPLETED"]),
        deployment("late", "b1", at(-5), ["COMPLETED", "PENDING", "IN_PROGRESS"]),
        deployment("today", "b2", at(3), ["PENDING"]),
        deployment("later", "b2", at(100), ["PENDING"])
      ]);

      const res = await service.overview("t", {});

      expect(res.rows.map((r) => [r.deploymentId, r.dueStatus])).toEqual([
        ["late", "OVERDUE"],
        ["today", "DUE_TODAY"],
        ["later", "UPCOMING"],
        ["done", "COMPLETED"]
      ]);
      expect(res.totals).toEqual({ dueSoon: 0, dueToday: 1, overdueDeployments: 1, overdueStudents: 2 });
      expect(res.rows[0].outstanding.map((s) => s.status)).toEqual(["PENDING", "IN_PROGRESS"]);
      expect(res.batches).toEqual([
        { id: "b1", name: "B1" },
        { id: "b2", name: "B2" }
      ]);
    });

    it("filters by batch and status but still lists every batch to filter by", async () => {
      as("coach", "COACH");
      prisma.assignmentBatch.findMany.mockResolvedValue([
        deployment("late", "b1", at(-5), ["PENDING"]),
        deployment("today", "b2", at(3), ["PENDING"])
      ]);

      const res = await service.overview("t", { batchId: "b2", dueStatus: "DUE_TODAY" });

      expect(res.rows.map((r) => r.deploymentId)).toEqual(["today"]);
      expect(res.batches).toHaveLength(2);
    });
  });
});
