import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PaymentStatus, UserRole, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ManualPaymentAttachmentStorage } from "./manual-payment-attachment.storage";
import { ManualPaymentService } from "./manual-payment.service";
import { OfflinePaymentMethodService } from "./offline-payment-method.service";
import { PaymentService } from "./payment.service";

/**
 * Manual/offline payment recording (cash, personal UPI-GPay, bank transfer).
 *
 * The invariant under test: a coach's record grants nothing by itself — only
 * `approve` reaches PAID, and it does so through the SAME
 * `PaymentService.applyProviderState` funnel a gateway capture uses (that
 * funnel's own entitlement/invoice behaviour is covered by
 * payment.service.spec.ts; here we only assert it is invoked with a PAID
 * status). An admin's own record skips the queue entirely.
 */
describe("ManualPaymentService", () => {
  const admin = { id: "adm_1", role: UserRole.ADMIN } as unknown as User;
  const coach = { id: "coach_1", role: UserRole.COACH } as unknown as User;

  const plan = {
    id: "plan_1",
    code: "BATCH-MONTHLY",
    name: "Monthly fee",
    amount: 99900,
    taxPercent: 0,
    currency: "INR",
    isActive: true,
    batchId: "batch_1"
  };

  const student = { id: "stu_1", role: UserRole.STUDENT, email: "s@nexa.test" };
  const method = { id: "method_1", label: "Cash", isActive: true };

  const buildRow = (overrides: Record<string, unknown> = {}) => ({
    id: "mpr_1",
    paymentId: "pmt_1",
    methodId: method.id,
    reference: "note",
    recordedByUserId: coach.id,
    recordedByRole: UserRole.COACH,
    status: "PENDING",
    reviewedByUserId: null,
    reviewedAt: null,
    rejectionReason: null,
    attachmentKey: null,
    attachmentFileName: null,
    createdAt: new Date("2026-09-19T10:00:00Z"),
    method: { label: method.label },
    recordedByUser: { firstName: "Coach", lastName: "One" },
    reviewedByUser: null,
    payment: {
      amount: 99900,
      currency: "INR",
      order: {
        id: "ord_1",
        orderNumber: "NEXA-2026-ABC123",
        userId: student.id,
        planId: plan.id,
        user: { firstName: "Stu", lastName: "Dent", email: student.email },
        plan: { name: plan.name, batchId: plan.batchId, batch: { id: "batch_1", name: "Batch A" } }
      }
    },
    ...overrides
  });

  const buildModule = async (opts: {
    batchCoach?: unknown;
    batchStudent?: unknown;
    row?: ReturnType<typeof buildRow>;
  }) => {
    let row = opts.row ?? buildRow();

    const applyProviderState = jest.fn().mockResolvedValue({ changed: true, status: PaymentStatus.PAID });

    const prisma = {
      $transaction: jest.fn(),
      plan: { findUnique: jest.fn().mockResolvedValue(plan) },
      user: { findUnique: jest.fn().mockResolvedValue(student) },
      batchCoach: {
        findFirst: jest
          .fn()
          .mockResolvedValue("batchCoach" in opts ? opts.batchCoach : { id: "bc_1" })
      },
      batchStudent: {
        findFirst: jest
          .fn()
          .mockResolvedValue("batchStudent" in opts ? opts.batchStudent : { id: "bs_1" })
      },
      order: { create: jest.fn().mockResolvedValue({ id: "ord_1", amount: 99900, currency: "INR" }) },
      payment: {
        create: jest.fn().mockResolvedValue({ id: "pmt_1", amount: 99900, currency: "INR" }),
        findUnique: jest.fn().mockResolvedValue({ id: "pmt_1", amount: 99900, currency: "INR" })
      },
      paymentAttempt: { create: jest.fn().mockResolvedValue({ id: "att_1" }) },
      manualPaymentRecord: {
        create: jest.fn().mockImplementation(({ data }) => {
          row = buildRow({ ...row, status: data.status, reviewedByUserId: data.reviewedByUserId, reviewedAt: data.reviewedAt });
          return Promise.resolve(row);
        }),
        update: jest.fn().mockImplementation(({ data }) => {
          row = buildRow({ ...row, ...data });
          return Promise.resolve(row);
        }),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(row))
      }
    };
    prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) => run(prisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManualPaymentService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: OfflinePaymentMethodService,
          useValue: { requireActive: jest.fn().mockResolvedValue(method) }
        },
        {
          provide: ManualPaymentAttachmentStorage,
          useValue: { upload: jest.fn(), download: jest.fn() }
        },
        { provide: PaymentService, useValue: { applyProviderState } }
      ]
    }).compile();

    return {
      service: module.get(ManualPaymentService),
      prisma,
      applyProviderState
    };
  };

  it("refuses a coach who is not assigned to the plan's batch", async () => {
    const { service } = await buildModule({ batchCoach: null });

    await expect(
      service.record(coach, { studentUserId: student.id, planId: plan.id, methodId: method.id })
    ).rejects.toThrow(ForbiddenException);
  });

  it("refuses a coach whose batch does not include the student", async () => {
    const { service } = await buildModule({ batchStudent: null });

    await expect(
      service.record(coach, { studentUserId: student.id, planId: plan.id, methodId: method.id })
    ).rejects.toThrow(ForbiddenException);
  });

  it("leaves a coach's record PENDING and grants nothing", async () => {
    const { service, applyProviderState, prisma } = await buildModule({});

    const result = await service.record(coach, {
      studentUserId: student.id,
      planId: plan.id,
      methodId: method.id
    });

    expect(prisma.manualPaymentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING", reviewedByUserId: null })
      })
    );
    expect(applyProviderState).not.toHaveBeenCalled();
    expect(result.status).toBe("PENDING");
  });

  it("self-approves and grants immediately when an admin records it", async () => {
    const { service, applyProviderState, prisma } = await buildModule({});

    await service.record(admin, {
      studentUserId: student.id,
      planId: plan.id,
      methodId: method.id
    });

    expect(prisma.manualPaymentRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", reviewedByUserId: admin.id })
      })
    );
    expect(applyProviderState).toHaveBeenCalledWith(
      "pmt_1",
      expect.objectContaining({ status: PaymentStatus.PAID }),
      "manual:record"
    );
  });

  it("approves a pending request through the same PAID funnel and marks it reviewed", async () => {
    const { service, applyProviderState, prisma } = await buildModule({ row: buildRow({ status: "PENDING" }) });

    const result = await service.approve(admin, "mpr_1");

    expect(applyProviderState).toHaveBeenCalledWith(
      "pmt_1",
      expect.objectContaining({ status: PaymentStatus.PAID }),
      "manual:approve"
    );
    expect(prisma.manualPaymentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", reviewedByUserId: admin.id })
      })
    );
    expect(result.status).toBe("APPROVED");
  });

  it("rejects a pending request as FAILED and records the reason, granting nothing", async () => {
    const { service, applyProviderState, prisma } = await buildModule({ row: buildRow({ status: "PENDING" }) });

    const result = await service.reject(admin, "mpr_1", "No proof provided");

    expect(applyProviderState).toHaveBeenCalledWith(
      "pmt_1",
      expect.objectContaining({
        status: PaymentStatus.FAILED,
        failureCode: "manual_rejected",
        failureMessage: "No proof provided"
      }),
      "manual:reject"
    );
    expect(prisma.manualPaymentRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REJECTED",
          rejectionReason: "No proof provided"
        })
      })
    );
    expect(result.status).toBe("REJECTED");
  });
});
