import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ClassStatus, Prisma, UserRole, UserStatus } from "@prisma/client";
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
        findFirst: jest.fn().mockResolvedValue({ id: "batch-1" }),
        findUnique: jest.fn().mockResolvedValue({ name: "Batch A", startsAt: null, endsAt: null })
      },
      batchCoach: { findFirst: jest.fn().mockResolvedValue({ id: "bc-1", coach: { timezone: "Asia/Kolkata" } }) },
      coachClass: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: "class-new" }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      classChangeRequest: {
        create: jest.fn().mockResolvedValue(fullRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(requestRow()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(fullRow({ status: "APPROVED" })),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
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

    it("refuses to reschedule a class whose batch is archived", async () => {
      prisma.coachClass.findUnique.mockResolvedValue({
        id: "class-1",
        coachId: "coach-1",
        batchId: "batch-1",
        status: ClassStatus.SCHEDULED,
        startsAt: future(2),
        endsAt: future(3)
      });
      prisma.batch.findFirst.mockResolvedValue(null);
      await expect(
        service.create(TOKEN, {
          type: "RESCHEDULE",
          classId: "class-1",
          startsAt: future(24).toISOString(),
          endsAt: future(25).toISOString(),
          reason: "Travel"
        })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.classChangeRequest.create).not.toHaveBeenCalled();
    });

    it("maps a concurrent duplicate extra class (unique index) to an extra-class 409", async () => {
      prisma.classChangeRequest.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "x", code: "P2002" })
      );
      await expect(
        service.create(TOKEN, {
          type: "EXTRA_CLASS",
          batchId: "batch-1",
          startsAt: future(24).toISOString(),
          endsAt: future(25).toISOString(),
          reason: "Make-up"
        })
      ).rejects.toThrow(/extra class at this time/);
    });

    it("refuses a duplicate pending extra class at the same time", async () => {
      prisma.classChangeRequest.findFirst.mockResolvedValue({ id: "req-old" });
      await expect(
        service.create(TOKEN, {
          type: "EXTRA_CLASS",
          batchId: "batch-1",
          startsAt: future(24).toISOString(),
          endsAt: future(25).toISOString(),
          reason: "Make-up"
        })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.classChangeRequest.create).not.toHaveBeenCalled();
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
        where: { coachId: "coach-1", id: "class-1", status: ClassStatus.SCHEDULED },
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

    // V3: the coach's authority is revalidated at approval, not trusted from the ask.
    it("revalidates that the coach is still an active coach of a live batch", async () => {
      await service.approve(TOKEN, "req-1", {});
      expect(prisma.batchCoach.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            batchId: "batch-1",
            coachId: "coach-1",
            isDeleted: false,
            batch: expect.objectContaining({ isDeleted: false, status: { not: "ARCHIVED" } }),
            coach: expect.objectContaining({ status: UserStatus.ACTIVE, role: UserRole.COACH })
          })
        })
      );
    });

    it("share-locks the batch, batch-coach and coach rows before the authority check", async () => {
      await service.approve(TOKEN, "req-1", {});
      const sql = prisma.$queryRaw.mock.calls.map((call: [TemplateStringsArray]) => call[0].join("?"));
      expect(sql.some((q: string) => q.includes('"batches"') && q.includes("FOR SHARE"))).toBe(true);
      expect(sql.some((q: string) => q.includes('"batch_coaches"') && q.includes("FOR SHARE"))).toBe(true);
      expect(sql.some((q: string) => q.includes('"users"') && q.includes("FOR SHARE"))).toBe(true);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.batchCoach.findFirst.mock.invocationCallOrder[0]
      );
    });

    it("refuses when the coach was removed, archived or the batch archived since the ask", async () => {
      prisma.batchCoach.findFirst.mockResolvedValue(null);
      await expect(service.approve(TOKEN, "req-1", {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.coachClass.create).not.toHaveBeenCalled();
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });

    it("only moves a class the requesting coach still owns", async () => {
      prisma.classChangeRequest.findUnique.mockResolvedValue(
        requestRow({ type: "RESCHEDULE", classId: "class-1" })
      );
      await service.approve(TOKEN, "req-1", {});
      expect(prisma.coachClass.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ coachId: "coach-1", id: "class-1" }) })
      );
    });
  });
});
