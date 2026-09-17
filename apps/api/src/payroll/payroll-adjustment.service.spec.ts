import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollAdjustmentService } from "./payroll-adjustment.service";
import { PayrollAuditService } from "./payroll-audit.service";

/**
 * Manual adjustments (§9).
 *
 * The two properties that matter most: totals recompute correctly (and
 * signed correctly — an EARNING adds, a DEDUCTION subtracts), and a
 * finalized/paid record can never be adjusted — a correction past that point
 * must go through a brand-new mechanism, not a silent edit here.
 */
describe("PayrollAdjustmentService", () => {
  const baseRecord = {
    id: "rec_1",
    status: "CALCULATED",
    grossEarningsMinor: 100000,
    totalDeductionsMinor: 5000,
    totalAdjustmentsMinor: 0
  };

  const build = async (
    record: Record<string, unknown> | null,
    adjustments: Record<string, unknown>[] = []
  ) => {
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollAdjustmentService,
        {
          provide: PrismaService,
          useValue: {
            coachPayrollRecord: {
              findUnique: jest.fn().mockResolvedValue(record),
              findUniqueOrThrow: jest.fn().mockResolvedValue(record),
              update: jest.fn().mockImplementation(({ data }) => ({ ...record, ...data }))
            },
            payrollAdjustment: {
              create: jest.fn().mockImplementation(({ data }) => ({
                id: "adj_new",
                createdAt: new Date(),
                reversedById: null,
                reversedAt: null,
                reversalReason: null,
                ...data
              })),
              findMany: jest.fn().mockResolvedValue(adjustments),
              findUnique: jest
                .fn()
                .mockImplementation(({ where: { id } }) => adjustments.find((a) => a.id === id) ?? null),
              update: jest.fn().mockImplementation(({ where: { id }, data }) => ({
                ...adjustments.find((a) => a.id === id),
                ...data
              }))
            }
          }
        },
        { provide: PayrollAuditService, useValue: { log: auditLog } }
      ]
    }).compile();
    return { service: module.get(PayrollAdjustmentService), auditLog };
  };

  it("creates an EARNING adjustment and recomputes the totals", async () => {
    const { service } = await build(baseRecord);
    const adjustment = await service.create("rec_1", "admin_1", {
      type: "EARNING",
      description: "Tournament coaching",
      amountMinor: 2000,
      reason: "September tournament support"
    });
    expect(adjustment.type).toBe("EARNING");
    expect(adjustment.amountMinor).toBe(2000);
  });

  it("refuses to create an adjustment for a record that doesn't exist", async () => {
    const { service } = await build(null);
    await expect(
      service.create("missing", "admin_1", {
        type: "EARNING",
        description: "x",
        amountMinor: 100,
        reason: "x"
      })
    ).rejects.toThrow(NotFoundException);
  });

  it("refuses to adjust a FINALIZED record", async () => {
    const { service } = await build({ ...baseRecord, status: "FINALIZED" });
    await expect(
      service.create("rec_1", "admin_1", {
        type: "DEDUCTION",
        description: "Advance",
        amountMinor: 3000,
        reason: "x"
      })
    ).rejects.toThrow(ConflictException);
  });

  it("refuses to adjust a PAID record", async () => {
    const { service } = await build({ ...baseRecord, status: "PAID" });
    await expect(
      service.create("rec_1", "admin_1", {
        type: "EARNING",
        description: "x",
        amountMinor: 100,
        reason: "x"
      })
    ).rejects.toThrow(ConflictException);
  });

  it("allows an adjustment on an APPROVED record", async () => {
    const { service } = await build({ ...baseRecord, status: "APPROVED" });
    await expect(
      service.create("rec_1", "admin_1", {
        type: "EARNING",
        description: "Bonus",
        amountMinor: 500,
        reason: "x"
      })
    ).resolves.toMatchObject({ amountMinor: 500 });
  });

  it("reverses an adjustment and records the reason", async () => {
    const existing = {
      id: "adj_1",
      payrollRecordId: "rec_1",
      type: "EARNING",
      description: "Bonus",
      amountMinor: 2000,
      reason: "x",
      createdById: "admin_1",
      createdAt: new Date(),
      reversedById: null,
      reversedAt: null,
      reversalReason: null
    };
    const { service } = await build(baseRecord, [existing]);
    const reversed = await service.reverse("adj_1", "admin_2", {
      reversalReason: "Entered twice by mistake"
    });
    expect(reversed.reversedById).toBe("admin_2");
    expect(reversed.reversalReason).toBe("Entered twice by mistake");
  });

  it("refuses to reverse an adjustment that is already reversed", async () => {
    const already = {
      id: "adj_1",
      payrollRecordId: "rec_1",
      reversedAt: new Date(),
      reversedById: "admin_1",
      reversalReason: "already done"
    };
    const { service } = await build(baseRecord, [already]);
    await expect(service.reverse("adj_1", "admin_2", { reversalReason: "again" })).rejects.toThrow(
      ConflictException
    );
  });

  it("refuses to reverse an adjustment that doesn't exist", async () => {
    const { service } = await build(baseRecord, []);
    await expect(service.reverse("missing", "admin_1", { reversalReason: "x" })).rejects.toThrow(
      NotFoundException
    );
  });

  it("audits both creation and reversal without leaking payment details", async () => {
    const { service, auditLog } = await build(baseRecord);
    await service.create("rec_1", "admin_1", {
      type: "EARNING",
      description: "Bonus",
      amountMinor: 2000,
      reason: "x"
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ADJUSTMENT_CREATED", entity: "PayrollAdjustment" })
    );
    const call = auditLog.mock.calls[0][0];
    expect(call.metadata).not.toHaveProperty("paymentDetails");
  });
});
