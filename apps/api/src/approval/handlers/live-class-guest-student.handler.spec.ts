import { ConflictException, NotFoundException } from "@nestjs/common";
import { ClassStatus, LiveSessionStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { LiveClassGuestStudentHandler } from "./live-class-guest-student.handler";

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const coach = { id: "coach-1", role: UserRole.COACH, timezone: "UTC" };

describe("LiveClassGuestStudentHandler (V4)", () => {
  let tx: {
    $queryRaw: jest.Mock;
    batchStudent: { findFirst: jest.Mock };
    coachClass: { findUnique: jest.Mock };
    liveClassPull: { upsert: jest.Mock };
    liveSession: { findUnique: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  const db = () => tx as unknown as PrismaTransactionClient;
  const handler = new LiveClassGuestStudentHandler();

  const ownClass = (over: Record<string, unknown> = {}) => ({
    batchId: "batch-1",
    coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE },
    coachId: "coach-1",
    endsAt: inHours(2),
    id: "class-1",
    status: ClassStatus.SCHEDULED,
    ...over
  });
  const request = { classId: "class-1", requesterId: "coach-1", subjectUserId: "stu-9" } as ApprovalRequest;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      batchStudent: { findFirst: jest.fn().mockResolvedValue(null) },
      coachClass: { findUnique: jest.fn().mockResolvedValue(ownClass()) },
      liveClassPull: { upsert: jest.fn() },
      liveSession: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: "stu-9" }) }
    };
  });

  it("asks for one student and one class, expiring when the class ends", async () => {
    const cls = ownClass();
    tx.coachClass.findUnique.mockResolvedValue(cls);
    const prepared = await handler.prepare(db(), coach, { classId: "class-1", studentId: "stu-9" });
    expect(prepared).toMatchObject({
      classId: "class-1",
      dedupeKey: "LIVE_CLASS_GUEST_STUDENT:class-1:stu-9",
      expiresAt: cls.endsAt,
      subjectUserId: "stu-9",
      urgent: false
    });
  });

  it("is urgent while the class is live", async () => {
    tx.coachClass.findUnique.mockResolvedValue(ownClass({ status: ClassStatus.LIVE }));
    expect((await handler.prepare(db(), coach, { classId: "class-1", studentId: "stu-9" })).urgent).toBe(true);
  });

  it("refuses another coach's class, an inactive student, or one already in the coach's batches", async () => {
    tx.coachClass.findUnique.mockResolvedValueOnce(ownClass({ coachId: "coach-2" }));
    await expect(handler.prepare(db(), coach, { classId: "class-1", studentId: "stu-9" })).rejects.toBeInstanceOf(
      NotFoundException
    );

    tx.user.findFirst.mockResolvedValueOnce(null);
    await expect(handler.prepare(db(), coach, { classId: "class-1", studentId: "stu-9" })).rejects.toBeInstanceOf(
      NotFoundException
    );

    tx.batchStudent.findFirst.mockResolvedValueOnce({ id: "bs-1" });
    await expect(handler.prepare(db(), coach, { classId: "class-1", studentId: "stu-9" })).rejects.toThrow(
      /Pull them in directly/
    );
  });

  it("refuses a class that's over", async () => {
    tx.coachClass.findUnique.mockResolvedValue(ownClass({ endsAt: inHours(-1) }));
    await expect(handler.prepare(db(), coach, { classId: "class-1", studentId: "stu-9" })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it.each([
    ["the class was cancelled", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ status: ClassStatus.CANCELLED }))],
    ["the class changed coach", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ coachId: "coach-2" }))],
    ["the student is no longer active", () => tx.user.findFirst.mockResolvedValue(null)]
  ])("revalidation refuses when %s", async (_label, arrange) => {
    arrange();
    await expect(handler.revalidate(db(), request)).rejects.toBeInstanceOf(ConflictException);
  });

  it("grants without a pull before the class is live", async () => {
    expect(await handler.execute(db(), request)).toEqual({ granted: true, pulled: false });
    expect(tx.liveClassPull.upsert).not.toHaveBeenCalled();
  });

  it("sends the pull on the coach's behalf when the class is live", async () => {
    tx.liveSession.findUnique.mockResolvedValue({ id: "ls-1", status: LiveSessionStatus.LIVE });
    expect(await handler.execute(db(), request)).toEqual({ granted: true, pulled: true });
    expect(tx.liveClassPull.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { liveSessionId: "ls-1", requestedById: "coach-1", studentId: "stu-9" }
      })
    );
  });
});
