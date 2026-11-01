import { ConflictException, NotFoundException } from "@nestjs/common";
import { AttendanceStatus, ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { AttendanceCorrectionHandler } from "./attendance-correction.handler";

const coach = { id: "coach-1", role: UserRole.COACH, timezone: "UTC" };
const payload = { classId: "class-1", status: "PRESENT" as const, studentId: "stu-1" };

describe("AttendanceCorrectionHandler (Stage 6)", () => {
  let tx: {
    $queryRaw: jest.Mock;
    batchStudent: { findFirst: jest.Mock };
    classAttendance: { findUnique: jest.Mock; upsert: jest.Mock };
    coachClass: { findUnique: jest.Mock };
    trashAuditLog: { create: jest.Mock };
  };
  const db = () => tx as unknown as PrismaTransactionClient;
  const handler = new AttendanceCorrectionHandler();

  const finished = (over: Record<string, unknown> = {}) => ({
    batchId: "batch-1",
    coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE },
    coachId: "coach-1",
    id: "class-1",
    liveSession: { status: "ENDED" },
    status: ClassStatus.COMPLETED,
    ...over
  });
  const request = (over: Partial<ApprovalRequest> = {}) =>
    ({
      classId: "class-1",
      currentValue: { status: AttendanceStatus.ABSENT },
      id: "req-1",
      reason: "Camera was off, but they were there",
      requestedValue: { status: AttendanceStatus.PRESENT },
      requesterId: "coach-1",
      subjectUserId: "stu-1",
      ...over
    }) as ApprovalRequest;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      batchStudent: { findFirst: jest.fn().mockResolvedValue({ id: "bs-1" }) },
      classAttendance: {
        findUnique: jest.fn().mockResolvedValue({ status: AttendanceStatus.ABSENT }),
        upsert: jest.fn().mockResolvedValue({ id: "att-1" })
      },
      coachClass: { findUnique: jest.fn().mockResolvedValue(finished()) },
      trashAuditLog: { create: jest.fn() }
    };
  });

  it("snapshots the status on record", async () => {
    expect(await handler.prepare(db(), coach, payload)).toMatchObject({
      currentValue: { status: AttendanceStatus.ABSENT },
      dedupeKey: "ATTENDANCE_CORRECTION:class-1:stu-1",
      requestedValue: { status: "PRESENT" },
      subjectUserId: "stu-1"
    });
  });

  it("refuses another coach's class", async () => {
    tx.coachClass.findUnique.mockResolvedValue(finished({ coachId: "coach-2" }));
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ["still scheduled", { liveSession: null, status: ClassStatus.SCHEDULED }],
    ["cancelled", { liveSession: { status: "ENDED" }, status: ClassStatus.CANCELLED }]
  ])("refuses a class that is %s", async (_label, over) => {
    tx.coachClass.findUnique.mockResolvedValue(finished(over));
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a student with no attendance who isn't in the batch", async () => {
    tx.classAttendance.findUnique.mockResolvedValue(null);
    tx.batchStudent.findFirst.mockResolvedValue(null);
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses asking for the status it already has", async () => {
    tx.classAttendance.findUnique.mockResolvedValue({ status: AttendanceStatus.PRESENT });
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    ["the status moved", () => tx.classAttendance.findUnique.mockResolvedValue({ status: AttendanceStatus.LATE })],
    ["the class changed coach", () => tx.coachClass.findUnique.mockResolvedValue(finished({ coachId: "coach-2" }))],
    [
      "the coach is inactive",
      () =>
        tx.coachClass.findUnique.mockResolvedValue(
          finished({ coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ARCHIVED } })
        )
    ]
  ])("revalidation refuses when %s", async (_label, arrange) => {
    arrange();
    await expect(handler.revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
  });

  it("corrects with an audit row naming the reviewer, the reason and the request", async () => {
    await expect(handler.execute(db(), request(), { id: "admin-1" })).resolves.toEqual({
      after: AttendanceStatus.PRESENT,
      before: AttendanceStatus.ABSENT
    });
    expect(tx.classAttendance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ joinedAt: null, status: AttendanceStatus.PRESENT }),
        update: expect.objectContaining({ correctedAt: expect.any(Date), status: AttendanceStatus.PRESENT })
      })
    );
    expect(tx.trashAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "ATTENDANCE_CORRECTION",
        metadata: expect.objectContaining({
          after: AttendanceStatus.PRESENT,
          approvalRequestId: "req-1",
          before: AttendanceStatus.ABSENT,
          reason: "Camera was off, but they were there"
        }),
        userId: "admin-1"
      })
    });
  });
});
