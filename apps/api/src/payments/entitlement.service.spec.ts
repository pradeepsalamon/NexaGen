import { Test, type TestingModule } from "@nestjs/testing";
import { EntitlementStatus } from "@prisma/client";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService } from "./entitlement.service";

/**
 * The access boundary (§21).
 *
 * These tests exist because "grant access" is the only irreversible thing the
 * payment module does to the rest of the product. Granting twice is a duplicate
 * benefit; granting once for two payments is a support ticket.
 */
describe("EntitlementService.grant", () => {
  let service: EntitlementService;
  let tx: {
    plan: { findUnique: jest.Mock };
    entitlement: { findUnique: jest.Mock; create: jest.Mock };
    batchStudent: { upsert: jest.Mock };
  };

  const plan = {
    id: "plan_1",
    interval: "MONTHLY" as const,
    accessDays: null,
    batchId: "batch_1"
  };

  beforeEach(async () => {
    tx = {
      plan: { findUnique: jest.fn().mockResolvedValue(plan) },
      entitlement: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "ent_1", ...data })
        )
      },
      batchStudent: { upsert: jest.fn().mockResolvedValue({ id: "bs_1" }) }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntitlementService,
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: { entitlement: { count: jest.fn() } } }
      ]
    }).compile();

    service = module.get(EntitlementService);
  });

  const input = {
    userId: "usr_1",
    planId: "plan_1",
    orderId: "ord_1",
    paymentId: "pmt_1",
    grantedAt: new Date("2026-09-14T00:00:00Z")
  };

  it("grants access and enrols the student into the plan's batch", async () => {
    const entitlement = await service.grant(tx as never, input);

    expect(entitlement).toMatchObject({
      userId: "usr_1",
      planId: "plan_1",
      orderId: "ord_1",
      status: EntitlementStatus.ACTIVE,
      batchId: "batch_1"
    });

    // A monthly plan grants exactly one month.
    expect(entitlement?.endsAt).toEqual(new Date("2026-10-14T00:00:00Z"));

    expect(tx.batchStudent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { batchId_studentId: { batchId: "batch_1", studentId: "usr_1" } }
      })
    );
  });

  it("restores a previously removed enrolment instead of failing", async () => {
    await service.grant(tx as never, input);

    // BatchStudent is soft-deletable and its unique key spans deleted rows, so
    // the write must clear the delete flags rather than insert a second row.
    expect(tx.batchStudent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ isDeleted: false, deletedAt: null })
      })
    );
  });

  it("is idempotent: a replayed capture returns the existing grant", async () => {
    const existing = { id: "ent_1", orderId: "ord_1", planId: "plan_1" };
    tx.entitlement.findUnique.mockResolvedValue(existing);

    const result = await service.grant(tx as never, input);

    expect(result).toBe(existing);
    // No second entitlement, and crucially no second enrolment.
    expect(tx.entitlement.create).not.toHaveBeenCalled();
    expect(tx.batchStudent.upsert).not.toHaveBeenCalled();
  });

  it("does not extend access when the same order is captured again", async () => {
    const existing = {
      id: "ent_1",
      endsAt: new Date("2026-10-14T00:00:00Z")
    };
    tx.entitlement.findUnique.mockResolvedValue(existing);

    const result = await service.grant(tx as never, {
      ...input,
      grantedAt: new Date("2026-09-20T00:00:00Z")
    });

    // The window is unchanged — a duplicate webhook must not buy extra time.
    expect(result).toBe(existing);
  });

  it("grants perpetual access for a one-time plan", async () => {
    tx.plan.findUnique.mockResolvedValue({
      ...plan,
      interval: "ONE_TIME",
      accessDays: null
    });

    const entitlement = await service.grant(tx as never, input);
    expect(entitlement?.endsAt).toBeNull();
  });

  it("skips enrolment for a plan with no batch", async () => {
    tx.plan.findUnique.mockResolvedValue({ ...plan, batchId: null });

    const entitlement = await service.grant(tx as never, input);

    expect(entitlement?.batchId).toBeNull();
    expect(tx.batchStudent.upsert).not.toHaveBeenCalled();
  });

  it("grants nothing when the plan has vanished", async () => {
    tx.plan.findUnique.mockResolvedValue(null);

    // Better a loud log and no access than an entitlement pointing at nothing.
    await expect(service.grant(tx as never, input)).resolves.toBeNull();
    expect(tx.entitlement.create).not.toHaveBeenCalled();
  });
});
