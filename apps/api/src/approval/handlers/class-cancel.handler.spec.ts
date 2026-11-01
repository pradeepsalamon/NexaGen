import { ConflictException, NotFoundException } from "@nestjs/common";
import { resolveCancellationPath } from "@nexa-chess/types";
import { ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { MessagingDispatchService } from "../../messaging/messaging-dispatch.service";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { ClassCancelExceptionalHandler, ClassCancelHandler } from "./class-cancel.handler";

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const coach = { id: "coach-1", role: UserRole.COACH, timezone: "UTC" };

describe("resolveCancellationPath (V10)", () => {
  const now = new Date("2026-11-10T10:00:00Z");
  const at = (h: number) => new Date(now.getTime() + h * HOUR);

  it.each([
    [{ status: "SCHEDULED", startsAt: at(24.5) }, "DIRECT"],
    [{ status: "SCHEDULED", startsAt: at(24) }, "APPROVAL"],
    [{ status: "SCHEDULED", startsAt: at(1) }, "APPROVAL"],
    [{ status: "SCHEDULED", startsAt: at(0) }, "EXCEPTIONAL"],
    [{ status: "SCHEDULED", startsAt: at(-2) }, "EXCEPTIONAL"],
    [{ status: "LIVE", startsAt: at(30) }, "EXCEPTIONAL"],
    [{ status: "IN_PROGRESS", startsAt: at(-1) }, "EXCEPTIONAL"],
    [{ status: "COMPLETED", startsAt: at(-5) }, "NOT_ALLOWED"],
    [{ status: "CANCELLED", startsAt: at(48) }, "NOT_ALLOWED"]
  ])("%o → %s", (cls, expected) => {
    expect(resolveCancellationPath(cls, now)).toBe(expected);
  });
});

describe("class cancellation handlers", () => {
  let messaging: { dispatchInBackground: jest.Mock };
  let tx: {
    $queryRaw: jest.Mock;
    coachClass: { findUnique: jest.Mock; updateMany: jest.Mock };
  };
  const db = () => tx as unknown as PrismaTransactionClient;

  beforeEach(() => {
    messaging = { dispatchInBackground: jest.fn() };
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      coachClass: { findUnique: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
    };
  });

  const handler = () => new ClassCancelHandler(messaging as unknown as MessagingDispatchService);
  const exceptional = () => new ClassCancelExceptionalHandler(messaging as unknown as MessagingDispatchService);

  const ownClass = (over: Record<string, unknown> = {}) => ({
    batchId: "batch-1",
    coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE },
    coachId: "coach-1",
    id: "class-1",
    startsAt: inHours(10),
    status: ClassStatus.SCHEDULED,
    ...over
  });

  const request = (over: Partial<ApprovalRequest> = {}) =>
    ({
      classId: "class-1",
      currentValue: { startsAt: ownClass().startsAt.toISOString(), status: "SCHEDULED" },
      requesterId: "coach-1",
      ...over
    }) as ApprovalRequest;

  describe("prepare", () => {
    it("snapshots the class, expires at its start, one pending cancel per class", async () => {
      const cls = ownClass({ startsAt: inHours(10) });
      tx.coachClass.findUnique.mockResolvedValue(cls);

      const prepared = await handler().prepare(db(), coach, { classId: "class-1" });

      expect(prepared).toMatchObject({
        batchId: "batch-1",
        classId: "class-1",
        currentValue: { startsAt: cls.startsAt.toISOString(), status: "SCHEDULED" },
        dedupeKey: "CLASS_CANCEL:class-1",
        expiresAt: cls.startsAt,
        urgent: false
      });
    });

    it("flags a cancel under 6 h away as urgent", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass({ startsAt: inHours(2) }));
      expect((await handler().prepare(db(), coach, { classId: "class-1" })).urgent).toBe(true);
    });

    it("refuses another coach's class as not found", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass({ coachId: "coach-2" }));
      await expect(handler().prepare(db(), coach, { classId: "class-1" })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("sends a class more than 24 h away back to the direct route", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass({ startsAt: inHours(48) }));
      await expect(handler().prepare(db(), coach, { classId: "class-1" })).rejects.toThrow(/Cancel it directly/);
    });

    it("keeps the two paths apart", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass({ startsAt: inHours(-1) }));
      await expect(handler().prepare(db(), coach, { classId: "class-1" })).rejects.toThrow(/exceptional/);
      const prepared = await exceptional().prepare(db(), coach, { classId: "class-1" });
      expect(prepared).toMatchObject({ dedupeKey: "CLASS_CANCEL:class-1", urgent: true });
      expect(prepared.expiresAt).toBeUndefined();

      tx.coachClass.findUnique.mockResolvedValue(ownClass({ startsAt: inHours(3) }));
      await expect(exceptional().prepare(db(), coach, { classId: "class-1" })).rejects.toThrow(/regular cancellation/);
    });
  });

  describe("revalidate + execute", () => {
    it("locks the class row, then cancels it status-filtered", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass());
      await handler().revalidate(db(), request());
      expect(tx.$queryRaw.mock.calls[0][0].join("?")).toContain('"classes"');

      const result = await handler().execute(db(), request(), { id: "admin-1" });
      expect(tx.coachClass.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ cancelledById: "admin-1", status: ClassStatus.CANCELLED }),
          where: { id: "class-1", status: { in: [ClassStatus.SCHEDULED] } }
        })
      );
      expect(result).toEqual({ cancelledClassId: "class-1", requestedBy: "coach-1" });
    });

    it.each([
      ["the class moved to another coach", { coachId: "coach-2" }],
      ["the coach was archived", { coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ARCHIVED } }],
      ["the class was rescheduled", { startsAt: inHours(20) }],
      ["the class already started", { status: ClassStatus.LIVE }]
    ])("refuses when %s", async (_label, over) => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass(over));
      await expect(handler().revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
    });

    it("never cancels a running class through the exceptional path", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass({ status: ClassStatus.LIVE }));
      await expect(exceptional().revalidate(db(), request())).rejects.toThrow(/End it first/);
    });

    it("409s when the status-filtered update loses a race", async () => {
      tx.coachClass.updateMany.mockResolvedValue({ count: 0 });
      await expect(handler().execute(db(), request(), { id: "admin-1" })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  it("announces the cancellation only after an approval commits", () => {
    handler().afterCommit(request(), "REJECTED");
    expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    handler().afterCommit(request(), "APPROVED");
    expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "class-1", event: "CLASS_CANCELLED" });
  });
});
