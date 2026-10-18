import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollAuditService } from "./payroll-audit.service";
import { PayrollCalculationService } from "./payroll-calculation.service";
import { PayrollLifecycleService } from "./payroll-lifecycle.service";
import { PayrollPeriodService } from "./payroll-period.service";
import { PayslipGenerationService } from "./payslip-generation.service";

/**
 * The approve → finalize → paid lock sequence (§15/§24/§31).
 *
 * The property that matters most: once a period leaves REVIEW, recalculation
 * is refused — a finalized/paid payroll record must never silently change.
 * Every transition is also checked for its correct predecessor state, since
 * an approve-before-review or a finalize-before-approve is exactly the kind
 * of "skip a step" bug that would let money move without the intended review.
 */
describe("PayrollLifecycleService", () => {
  const period = (status: string) => ({
    id: "period_1",
    status,
    notes: null
  });

  const build = async (initialStatus: string) => {
    const recalculatePeriod = jest.fn().mockResolvedValue(undefined);
    const auditLog = jest.fn().mockResolvedValue(undefined);
    let currentStatus = initialStatus;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollLifecycleService,
        {
          provide: PrismaService,
          useValue: {
            payrollPeriod: {
              update: jest.fn().mockImplementation(({ data }) => {
                if (data.status) currentStatus = data.status;
                return { ...period(currentStatus), ...data };
              })
            },
            coachPayrollRecord: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
              findMany: jest.fn().mockResolvedValue([])
            }
          }
        },
        {
          provide: PayrollPeriodService,
          useValue: {
            getOrThrow: jest.fn().mockImplementation(() => period(currentStatus)),
            get: jest.fn().mockImplementation(() => ({ ...period(currentStatus) })),
            toItem: jest.fn().mockImplementation((p) => ({ ...p }))
          }
        },
        { provide: PayrollCalculationService, useValue: { recalculatePeriod } },
        { provide: PayrollAuditService, useValue: { log: auditLog } },
        { provide: PayslipGenerationService, useValue: { requestGeneration: jest.fn() } },
        { provide: MessagingDispatchService, useValue: { dispatchInBackground: jest.fn() } }
      ]
    }).compile();

    return { service: module.get(PayrollLifecycleService), recalculatePeriod, auditLog };
  };

  describe("recalculate", () => {
    it("succeeds from REVIEW", async () => {
      const { service, recalculatePeriod } = await build("REVIEW");
      await service.recalculate("period_1", "admin_1");
      expect(recalculatePeriod).toHaveBeenCalledWith("period_1");
    });

    it.each(["DRAFT", "APPROVED", "FINALIZED", "PAID", "CANCELLED"])(
      "refuses from %s",
      async (status) => {
        const { service, recalculatePeriod } = await build(status);
        await expect(service.recalculate("period_1", "admin_1")).rejects.toThrow(ConflictException);
        expect(recalculatePeriod).not.toHaveBeenCalled();
      }
    );
  });

  describe("approve", () => {
    it("moves REVIEW → APPROVED", async () => {
      const { service } = await build("REVIEW");
      const result = await service.approve("period_1", "admin_1");
      expect(result.status).toBe("APPROVED");
    });

    it.each(["DRAFT", "APPROVED", "FINALIZED", "PAID"])("refuses from %s", async (status) => {
      const { service } = await build(status);
      await expect(service.approve("period_1", "admin_1")).rejects.toThrow(ConflictException);
    });
  });

  describe("finalize", () => {
    it("moves APPROVED → FINALIZED", async () => {
      const { service } = await build("APPROVED");
      const result = await service.finalize("period_1", "admin_1");
      expect(result.status).toBe("FINALIZED");
    });

    it.each(["DRAFT", "REVIEW", "FINALIZED", "PAID"])(
      "refuses from %s — cannot skip approval",
      async (status) => {
        const { service } = await build(status);
        await expect(service.finalize("period_1", "admin_1")).rejects.toThrow(ConflictException);
      }
    );
  });

  describe("markPaid", () => {
    it("moves FINALIZED → PAID", async () => {
      const { service } = await build("FINALIZED");
      const result = await service.markPaid("period_1", "admin_1");
      expect(result.status).toBe("PAID");
    });

    it.each(["DRAFT", "REVIEW", "APPROVED"])("refuses from %s — cannot skip finalization", async (status) => {
      const { service } = await build(status);
      await expect(service.markPaid("period_1", "admin_1")).rejects.toThrow(ConflictException);
    });
  });

  describe("cancel", () => {
    it.each(["DRAFT", "REVIEW"])("succeeds from %s", async (status) => {
      const { service } = await build(status);
      const result = await service.cancel("period_1", "admin_1", "wrong dates");
      expect(result.status).toBe("CANCELLED");
    });

    it.each(["APPROVED", "FINALIZED", "PAID"])(
      "refuses from %s — a committed period is not cancelled, only corrected",
      async (status) => {
        const { service } = await build(status);
        await expect(service.cancel("period_1", "admin_1")).rejects.toThrow(ConflictException);
      }
    );
  });

  it("bulk-syncs every CoachPayrollRecord in the period on each transition", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollLifecycleService,
        {
          provide: PrismaService,
          useValue: {
            payrollPeriod: { update: jest.fn().mockResolvedValue(period("APPROVED")) },
            coachPayrollRecord: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) }
          }
        },
        {
          provide: PayrollPeriodService,
          useValue: {
            getOrThrow: jest.fn().mockResolvedValue(period("REVIEW")),
            toItem: jest.fn().mockImplementation((p) => p)
          }
        },
        { provide: PayrollCalculationService, useValue: {} },
        { provide: PayrollAuditService, useValue: { log: jest.fn() } },
        { provide: PayslipGenerationService, useValue: { requestGeneration: jest.fn() } },
        { provide: MessagingDispatchService, useValue: { dispatchInBackground: jest.fn() } }
      ]
    }).compile();
    const service = module.get(PayrollLifecycleService);
    const prisma = module.get(PrismaService);

    await service.approve("period_1", "admin_1");
    expect(prisma.coachPayrollRecord.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { periodId: "period_1" } })
    );
  });
});
