import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClassStatus, UserRole, type ApprovalRequest } from "@prisma/client";
import type { MessagingDispatchService } from "../../messaging/messaging-dispatch.service";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { ClassExtraHandler, ClassRescheduleHandler } from "./class-change.handler";

const HOUR = 3_600_000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);
const coach = { id: "coach-1", role: UserRole.COACH, timezone: "Asia/Kolkata" };

/** Stage 5: the old class change requests as approval-engine handlers. */
describe("class change handlers (CLASS_EXTRA, CLASS_RESCHEDULE)", () => {
  let tx: {
    $queryRaw: jest.Mock;
    approvalRequest: { update: jest.Mock };
    batch: { findFirst: jest.Mock; findUnique: jest.Mock };
    batchCoach: { findFirst: jest.Mock };
    coachClass: { create: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let messaging: { dispatchInBackground: jest.Mock };
  const db = () => tx as unknown as PrismaTransactionClient;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      approvalRequest: { update: jest.fn() },
      batch: {
        findFirst: jest.fn().mockResolvedValue({ id: "batch-1" }),
        findUnique: jest.fn().mockResolvedValue({ endsAt: null, name: "Batch", startsAt: null })
      },
      batchCoach: { findFirst: jest.fn().mockResolvedValue({ coach: { timezone: "Asia/Kolkata" }, id: "bc-1" }) },
      coachClass: {
        create: jest.fn().mockResolvedValue({ id: "new-class" }),
        // No clash by default.
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    };
    messaging = { dispatchInBackground: jest.fn() };
  });

  describe("CLASS_EXTRA", () => {
    const handler = () => new ClassExtraHandler(messaging as unknown as MessagingDispatchService);
    const start = inHours(48);
    const payload = () => ({
      batchId: "batch-1",
      endsAt: new Date(start.getTime() + HOUR).toISOString(),
      startsAt: start.toISOString(),
      topic: "Rook endings"
    });
    const request = (over: Partial<ApprovalRequest> = {}) =>
      ({
        batchId: "batch-1",
        executionResult: null,
        id: "req-1",
        requestedValue: { endsAt: payload().endsAt, startsAt: payload().startsAt, topic: "Rook endings" },
        requesterId: "coach-1",
        ...over
      }) as ApprovalRequest;

    it("asks for a class in the coach's own batch, keyed per coach, batch and start, expiring at the start", async () => {
      const prepared = await handler().prepare(db(), coach, payload());
      expect(prepared).toMatchObject({
        batchId: "batch-1",
        currentValue: null,
        dedupeKey: `CLASS_EXTRA:coach-1:batch-1:${start.toISOString()}`,
        expiresAt: start,
        requestedValue: { endsAt: payload().endsAt, startsAt: start.toISOString(), topic: "Rook endings" }
      });
      // Only a live batch counts.
      expect(tx.batchCoach.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ batch: expect.objectContaining({ isDeleted: false }), coachId: "coach-1" })
        })
      );
    });

    it("refuses a batch the coach isn't assigned to", async () => {
      tx.batchCoach.findFirst.mockResolvedValue(null);
      await expect(handler().prepare(db(), coach, payload())).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a time in the past and an obvious clash", async () => {
      await expect(
        handler().prepare(db(), coach, { ...payload(), endsAt: inHours(-1).toISOString(), startsAt: inHours(-2).toISOString() })
      ).rejects.toThrow(/must be in the future/);
      tx.coachClass.findFirst.mockResolvedValue({ endsAt: inHours(49), startsAt: inHours(48), topic: "Other" });
      await expect(handler().prepare(db(), coach, payload())).rejects.toBeInstanceOf(ConflictException);
    });

    it("re-checks the coach under row locks, then creates the class and links it to the request", async () => {
      await handler().revalidate(db(), request());
      const locked = tx.$queryRaw.mock.calls.map((call) => (call[0] as string[]).join("?"));
      expect(locked.join(" ")).toMatch(/"batches".*FOR SHARE/);
      expect(locked.join(" ")).toMatch(/"batch_coaches".*FOR SHARE/);

      const result = await handler().execute(db(), request());
      expect(tx.coachClass.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ batchId: "batch-1", coachId: "coach-1", topic: "Rook endings" })
        })
      );
      expect(tx.approvalRequest.update).toHaveBeenCalledWith({ data: { classId: "new-class" }, where: { id: "req-1" } });
      expect(result).toEqual({ createdClassId: "new-class" });
    });

    it.each([
      ["the coach left the batch or it was archived", () => tx.batchCoach.findFirst.mockResolvedValue(null)],
      [
        "the slot was taken meanwhile",
        () => tx.coachClass.findFirst.mockResolvedValue({ endsAt: inHours(49), startsAt: inHours(48), topic: "X" })
      ]
    ])("refuses approval when %s", async (_label, arrange) => {
      arrange();
      await expect(handler().revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
    });

    it("announces the class only after an approval commits", () => {
      handler().afterCommit(request({ executionResult: { createdClassId: "new-class" } }), "REJECTED");
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
      handler().afterCommit(request({ executionResult: { createdClassId: "new-class" } }), "APPROVED");
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({ classId: "new-class", event: "CLASS_SCHEDULED" });
    });
  });

  describe("CLASS_RESCHEDULE", () => {
    const handler = () => new ClassRescheduleHandler();
    const current = { endsAt: inHours(25), startsAt: inHours(24) };
    const target = inHours(72);
    const ownClass = (over: Record<string, unknown> = {}) => ({
      batchId: "batch-1",
      coachId: "coach-1",
      endsAt: current.endsAt,
      id: "class-1",
      startsAt: current.startsAt,
      status: ClassStatus.SCHEDULED,
      ...over
    });
    const payload = () => ({
      classId: "class-1",
      endsAt: new Date(target.getTime() + HOUR).toISOString(),
      startsAt: target.toISOString()
    });
    const request = (over: Partial<ApprovalRequest> = {}) =>
      ({
        batchId: "batch-1",
        classId: "class-1",
        currentValue: { endsAt: current.endsAt.toISOString(), startsAt: current.startsAt.toISOString(), status: "SCHEDULED" },
        id: "req-2",
        requestedValue: { endsAt: payload().endsAt, startsAt: payload().startsAt },
        requesterId: "coach-1",
        ...over
      }) as ApprovalRequest;

    it("snapshots the class's time, one pending move per class, expiring at the earlier start", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass());
      const prepared = await handler().prepare(db(), coach, payload());
      expect(prepared).toMatchObject({
        batchId: "batch-1",
        classId: "class-1",
        currentValue: { startsAt: current.startsAt.toISOString(), status: "SCHEDULED" },
        dedupeKey: "CLASS_RESCHEDULE:class-1",
        expiresAt: current.startsAt
      });
      // The clash check ignores the class being moved.
      expect(tx.coachClass.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: { not: "class-1" } }) })
      );
    });

    it.each([
      ["another coach's class", { coachId: "coach-2" }, NotFoundException],
      ["a class that isn't scheduled", { status: ClassStatus.CANCELLED }, ConflictException]
    ])("refuses %s", async (_label, over, error) => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass(over));
      await expect(handler().prepare(db(), coach, payload())).rejects.toBeInstanceOf(error);
    });

    it("refuses a class in an archived batch", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass());
      tx.batch.findFirst.mockResolvedValue(null);
      await expect(handler().prepare(db(), coach, payload())).rejects.toThrow(/archived batch/);
    });

    it("locks the class, re-checks it, then moves it status-filtered", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass());
      await handler().revalidate(db(), request());
      expect((tx.$queryRaw.mock.calls[0][0] as string[]).join("?")).toMatch(/"classes".*FOR UPDATE/);

      const result = await handler().execute(db(), request());
      expect(tx.coachClass.updateMany).toHaveBeenCalledWith({
        data: { endsAt: new Date(payload().endsAt), startsAt: target },
        where: { coachId: "coach-1", id: "class-1", status: ClassStatus.SCHEDULED }
      });
      expect(result).toEqual({ movedClassId: "class-1", startsAt: target.toISOString() });
    });

    it.each([
      ["the class went to another coach", { coachId: "coach-2" }],
      ["the class was cancelled", { status: ClassStatus.CANCELLED }],
      ["the class was moved after the ask", { startsAt: inHours(30) }]
    ])("refuses approval when %s", async (_label, over) => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass(over));
      await expect(handler().revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
    });

    it("refuses approval when the coach is no longer in the batch", async () => {
      tx.coachClass.findUnique.mockResolvedValue(ownClass());
      tx.batchCoach.findFirst.mockResolvedValue(null);
      await expect(handler().revalidate(db(), request())).rejects.toThrow(/no longer an active coach/);
    });

    it("409s when the status-filtered move loses a race", async () => {
      tx.coachClass.updateMany.mockResolvedValue({ count: 0 });
      await expect(handler().execute(db(), request())).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
