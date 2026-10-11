import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, UserRole, UserStatus } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClassRequestService } from "./class-request.service";

const TOKEN = "token";
const hour = 60 * 60_000;
const future = (h: number) => new Date(Date.now() + h * hour);

describe("ClassRequestService", () => {
  let service: ClassRequestService;
  let prisma: ReturnType<typeof buildPrisma>;
  let messaging: { dispatchInBackground: jest.Mock };
  let actor: { id: string; role: UserRole };

  const requestRow = (over: Record<string, unknown> = {}) => ({
    id: "req-1",
    type: "EXTRA_CLASS",
    status: "PENDING",
    coachId: "coach-1",
    batchId: "batch-1",
    classId: null,
    startsAt: future(24),
    endsAt: future(25),
    topic: "Endgames",
    ...over
  });

  const fullRow = (over: Record<string, unknown> = {}) => ({
    ...requestRow(over),
    batch: { name: "Batch A" },
    coach: { firstName: "Cora", lastName: "Coach" },
    createdAt: new Date(),
    originalEndsAt: null,
    originalStartsAt: null,
    reason: "Make-up",
    reviewNote: null,
    reviewedAt: null,
    reviewedBy: null
  });

  function buildPrisma() {
    return {
      user: {
        findUnique: jest.fn().mockImplementation(async () => ({ ...actor, status: UserStatus.ACTIVE, timezone: "UTC" }))
      },
      batch: {
        findUnique: jest.fn().mockResolvedValue({ name: "Batch A", startsAt: null, endsAt: null })
      },
      batchCoach: { findFirst: jest.fn().mockResolvedValue({ id: "bc-1" }) },
      coachClass: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "class-new" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      classChangeRequest: {
        create: jest.fn().mockResolvedValue(fullRow()),
        findUnique: jest.fn().mockResolvedValue(requestRow()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(fullRow({ status: "APPROVED" })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      $transaction: jest.fn()
    };
  }

  beforeEach(() => {
    actor = { id: "coach-1", role: UserRole.COACH };
    prisma = buildPrisma();
    prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
    messaging = { dispatchInBackground: jest.fn() };
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: "x", type: "access" }) };
    service = new ClassRequestService(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
      messaging as unknown as MessagingDispatchService
    );
  });

  describe("create", () => {
    it("refuses an extra class for a batch the coach doesn't teach", async () => {
      prisma.batchCoach.findFirst.mockResolvedValue(null);
      await expect(
        service.create(TOKEN, {
          type: "EXTRA_CLASS",
          batchId: "batch-x",
          startsAt: future(24).toISOString(),
          endsAt: future(25).toISOString(),
          reason: "Make-up"
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses to reschedule another coach's class", async () => {
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "someone-else",
        batchId: "batch-1",
        status: ClassStatus.SCHEDULED
      });
      await expect(
        service.create(TOKEN, {
          type: "RESCHEDULE",
          classId: "class-1",
          startsAt: future(24).toISOString(),
          endsAt: future(25).toISOString(),
          reason: "Travel"
        })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("records the original time on a reschedule", async () => {
      const original = { startsAt: future(2), endsAt: future(3) };
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "coach-1",
        batchId: "batch-1",
        status: ClassStatus.SCHEDULED,
        ...original
      });
      await service.create(TOKEN, {
        type: "RESCHEDULE",
        classId: "class-1",
        startsAt: future(24).toISOString(),
        endsAt: future(25).toISOString(),
        reason: "Travel"
      });
      const { data } = prisma.classChangeRequest.create.mock.calls[0][0];
      expect(data).toMatchObject({
        batchId: "batch-1",
        classId: "class-1",
        originalStartsAt: original.startsAt
      });
    });

    it("is coach-only", async () => {
      actor = { id: "student-1", role: UserRole.STUDENT };
      await expect(service.list(TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("approve", () => {
    beforeEach(() => {
      actor = { id: "admin-1", role: UserRole.ADMIN };
    });

    it("creates the extra class and announces it", async () => {
      await service.approve(TOKEN, "req-1", {});
      expect(prisma.coachClass.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ batchId: "batch-1", coachId: "coach-1", topic: "Endgames" })
      });
      expect(prisma.classChangeRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: { classId: "class-new" }
      });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith({
        event: "CLASS_SCHEDULED",
        classId: "class-new"
      });
    });

    it("never creates a second class when two approvals race", async () => {
      prisma.classChangeRequest.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve(TOKEN, "req-1", {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.coachClass.create).not.toHaveBeenCalled();
    });

    it("moves the class on a reschedule", async () => {
      prisma.classChangeRequest.findUnique.mockResolvedValue(
        requestRow({ type: "RESCHEDULE", classId: "class-1" })
      );
      await service.approve(TOKEN, "req-1", {});
      expect(prisma.coachClass.updateMany).toHaveBeenCalledWith({
        where: { id: "class-1", status: ClassStatus.SCHEDULED },
        data: expect.objectContaining({ startsAt: expect.any(Date) })
      });
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });

    it("refuses to move a class that already ran", async () => {
      prisma.classChangeRequest.findUnique.mockResolvedValue(
        requestRow({ type: "RESCHEDULE", classId: "class-1" })
      );
      prisma.coachClass.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.approve(TOKEN, "req-1", {})).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects a time that clashes with the coach's schedule", async () => {
      prisma.coachClass.findFirst.mockResolvedValue({
        topic: "Existing",
        startsAt: future(24),
        endsAt: future(25)
      });
      await expect(service.approve(TOKEN, "req-1", {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.coachClass.create).not.toHaveBeenCalled();
    });

    it("refuses a class outside the batch's dates (they may have changed since the ask)", async () => {
      prisma.batch.findUnique.mockResolvedValue({
        name: "Batch A",
        startsAt: new Date("2020-01-01T00:00:00.000Z"),
        endsAt: new Date("2020-01-31T00:00:00.000Z")
      });
      await expect(service.approve(TOKEN, "req-1", {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.classChangeRequest.updateMany).not.toHaveBeenCalled();
      expect(prisma.coachClass.create).not.toHaveBeenCalled();
    });

    it("is admin-only", async () => {
      actor = { id: "coach-1", role: UserRole.COACH };
      await expect(service.approve(TOKEN, "req-1", {})).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
