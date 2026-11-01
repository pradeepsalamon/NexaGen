import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { BatchStatus, ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { MessagingDispatchService } from "../../messaging/messaging-dispatch.service";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { ClassSubstituteHandler } from "./class-substitute.handler";

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const coach = { id: "coach-1", role: UserRole.COACH, timezone: "UTC" };
const payload = { classId: "class-1", substituteCoachId: "coach-2" };

describe("ClassSubstituteHandler (Stage 6)", () => {
  let tx: {
    $queryRaw: jest.Mock;
    coachClass: { findFirst: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let messaging: { dispatchInBackground: jest.Mock };
  let handler: ClassSubstituteHandler;
  const db = () => tx as unknown as PrismaTransactionClient;

  const startsAt = inHours(48);
  const ownClass = (over: Record<string, unknown> = {}) => ({
    batch: { isDeleted: false, status: BatchStatus.ACTIVE },
    batchId: "batch-1",
    coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE },
    coachId: "coach-1",
    endsAt: inHours(49),
    id: "class-1",
    startsAt,
    status: ClassStatus.SCHEDULED,
    ...over
  });
  const request = (over: Partial<ApprovalRequest> = {}) =>
    ({
      classId: "class-1",
      currentValue: { startsAt: startsAt.toISOString(), status: ClassStatus.SCHEDULED },
      requesterId: "coach-1",
      subjectUserId: "coach-2",
      ...over
    }) as ApprovalRequest;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      coachClass: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(ownClass()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({ firstName: "Sam", lastName: "Lee", timezone: "UTC" })
      }
    };
    messaging = { dispatchInBackground: jest.fn() };
    handler = new ClassSubstituteHandler(messaging as unknown as MessagingDispatchService);
  });

  it("names the substitute and expires at the class start", async () => {
    expect(await handler.prepare(db(), coach, payload)).toMatchObject({
      dedupeKey: "CLASS_SUBSTITUTE_COACH:class-1",
      expiresAt: startsAt,
      requestedValue: { substituteName: "Sam Lee" },
      subjectUserId: "coach-2",
      urgent: false
    });
  });

  it("refuses another coach's class, the coach themselves and an inactive substitute", async () => {
    tx.coachClass.findUnique.mockResolvedValueOnce(ownClass({ coachId: "coach-3" }));
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(NotFoundException);

    await expect(handler.prepare(db(), coach, { ...payload, substituteCoachId: "coach-1" })).rejects.toBeInstanceOf(
      ForbiddenException
    );

    tx.user.findFirst.mockResolvedValueOnce(null);
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a class that isn't upcoming, or a substitute who is busy then", async () => {
    tx.coachClass.findUnique.mockResolvedValueOnce(ownClass({ status: ClassStatus.LIVE }));
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ConflictException);

    tx.coachClass.findFirst.mockResolvedValueOnce({ startsAt, endsAt: inHours(49), title: "Other class" });
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ["the class started", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ status: ClassStatus.LIVE }))],
    ["the class changed coach", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ coachId: "coach-3" }))],
    ["the class moved", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ startsAt: inHours(72) }))],
    ["the substitute is inactive", () => tx.user.findFirst.mockResolvedValue(null)],
    [
      "the substitute became busy",
      () => tx.coachClass.findFirst.mockResolvedValue({ startsAt, endsAt: inHours(49), title: "Other class" })
    ]
  ])("revalidation refuses when %s", async (_label, arrange) => {
    arrange();
    await expect(handler.revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
  });

  it("moves the class status-filtered, and tells the new coach only after approval", async () => {
    await handler.execute(db(), request());
    expect(tx.coachClass.updateMany).toHaveBeenCalledWith({
      data: { coachId: "coach-2" },
      where: { coachId: "coach-1", id: "class-1", status: ClassStatus.SCHEDULED }
    });

    handler.afterCommit(request(), "REJECTED");
    expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    handler.afterCommit(request(), "APPROVED");
    expect(messaging.dispatchInBackground).toHaveBeenCalledWith({
      classId: "class-1",
      event: "CLASS_SUBSTITUTE_ASSIGNED"
    });
  });

  it("fails if the class changed between revalidation and the write", async () => {
    tx.coachClass.updateMany.mockResolvedValue({ count: 0 });
    await expect(handler.execute(db(), request())).rejects.toBeInstanceOf(ConflictException);
  });
});
