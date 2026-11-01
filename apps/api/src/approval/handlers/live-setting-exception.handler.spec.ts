import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { liveSettingExceptionPayloadSchema, type LiveSettingExceptionPayload } from "@nexa-chess/types";
import { ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { LiveSettingExceptionHandler } from "./live-setting-exception.handler";

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);
const coach = { id: "coach-1", role: UserRole.COACH, timezone: "UTC" };
const payload: LiveSettingExceptionPayload = { classId: "class-1", field: "student.chat", value: "DISABLED" };

describe("LiveSettingExceptionHandler (Stage 6)", () => {
  let tx: {
    $queryRaw: jest.Mock;
    coachClass: { findUnique: jest.Mock; update: jest.Mock };
    liveClassPolicy: { findFirst: jest.Mock };
    trashAuditLog: { create: jest.Mock };
  };
  const db = () => tx as unknown as PrismaTransactionClient;
  const handler = new LiveSettingExceptionHandler();

  const ownClass = (over: Record<string, unknown> = {}) => ({
    batch: { liveClassSettings: null },
    batchId: "batch-1",
    coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE },
    coachId: "coach-1",
    id: "class-1",
    liveClassSettings: null,
    startsAt: inHours(48),
    status: ClassStatus.SCHEDULED,
    ...over
  });
  const request = (over: Partial<ApprovalRequest> = {}) =>
    ({
      batchId: "batch-1",
      classId: "class-1",
      currentValue: { lockedValue: "ENABLED", source: "ACADEMY" },
      id: "req-1",
      requestedValue: { field: "student.chat", fieldLabel: "Student chat", value: "DISABLED" },
      requesterId: "coach-1",
      ...over
    }) as ApprovalRequest;

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      coachClass: { findUnique: jest.fn().mockResolvedValue(ownClass()), update: jest.fn() },
      liveClassPolicy: { findFirst: jest.fn().mockResolvedValue({ settings: { locks: ["student.chat"] } }) },
      trashAuditLog: { create: jest.fn() }
    };
  });

  it("never accepts recording, or a value the field can't hold", () => {
    expect(
      liveSettingExceptionPayloadSchema.safeParse({ classId: "c", field: "recording", value: "AUTO_START" }).success
    ).toBe(false);
    expect(liveSettingExceptionPayloadSchema.safeParse({ classId: "c", field: "student.chat", value: "NOPE" }).success).toBe(
      false
    );
    expect(liveSettingExceptionPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("snapshots the locked value and expires at the class start", async () => {
    const cls = ownClass();
    tx.coachClass.findUnique.mockResolvedValue(cls);
    expect(await handler.prepare(db(), coach, payload)).toMatchObject({
      currentValue: { lockedValue: "ENABLED", source: "ACADEMY" },
      dedupeKey: "LIVE_SETTING_EXCEPTION:class-1:student.chat",
      expiresAt: cls.startsAt,
      urgent: false
    });
  });

  it("is urgent close to the class", async () => {
    tx.coachClass.findUnique.mockResolvedValue(ownClass({ startsAt: inHours(2) }));
    expect((await handler.prepare(db(), coach, payload)).urgent).toBe(true);
  });

  it("refuses another coach's class", async () => {
    tx.coachClass.findUnique.mockResolvedValue(ownClass({ coachId: "coach-2" }));
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ["the class has started", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ status: ClassStatus.LIVE }))],
    ["the field isn't locked", () => tx.liveClassPolicy.findFirst.mockResolvedValue({ settings: {} })],
    [
      "an exception already exists",
      () =>
        tx.coachClass.findUnique.mockResolvedValue(
          ownClass({ liveClassSettings: { lockExceptions: ["student.chat"] } })
        )
    ]
  ])("refuses when %s", async (_label, arrange) => {
    arrange();
    await expect(handler.prepare(db(), coach, payload)).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a value the lock already has", async () => {
    await expect(handler.prepare(db(), coach, { ...payload, value: "ENABLED" })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("refuses a value that conflicts with another setting", async () => {
    tx.liveClassPolicy.findFirst.mockResolvedValue({
      settings: { autoJoin: { student: "ENABLED" }, locks: ["waitingRoom"] }
    });
    await expect(
      handler.prepare(db(), coach, { classId: "class-1", field: "waitingRoom", value: "ENABLED" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ["the class started", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ status: ClassStatus.LIVE }))],
    ["the class changed coach", () => tx.coachClass.findUnique.mockResolvedValue(ownClass({ coachId: "coach-2" }))],
    ["the lock was lifted", () => tx.liveClassPolicy.findFirst.mockResolvedValue({ settings: {} })],
    [
      "the locked value changed",
      () =>
        tx.liveClassPolicy.findFirst.mockResolvedValue({
          settings: { locks: ["student.chat"], student: { chat: "DISABLED" } }
        })
    ]
  ])("revalidation refuses when %s", async (_label, arrange) => {
    arrange();
    await expect(handler.revalidate(db(), request())).rejects.toBeInstanceOf(ConflictException);
  });

  it("stores the value and the exception together, with an audit row", async () => {
    tx.coachClass.findUnique.mockResolvedValue(ownClass({ liveClassSettings: { student: { mic: "JOIN_UNMUTED" } } }));
    await handler.execute(db(), request(), { id: "admin-1" });
    expect(tx.coachClass.update).toHaveBeenCalledWith({
      data: {
        liveClassSettings: {
          lockExceptions: ["student.chat"],
          student: { chat: "DISABLED", mic: "JOIN_UNMUTED" }
        }
      },
      where: { id: "class-1" }
    });
    expect(tx.trashAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "LIVE_SETTINGS_CHANGE",
        entity: "CoachClass",
        metadata: expect.objectContaining({ approvalRequestId: "req-1", scope: "CLASS" }),
        userId: "admin-1"
      })
    });
  });
});
