import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { PayoutService } from "./payout.service";
import { PayrollAuditService } from "./payroll-audit.service";

/**
 * Payout tracking (§22). The property that matters most: a payout can only
 * ever be created against a record that has actually been finalized — money
 * is never marked payable off a still-editable calculation — and creating
 * one twice for the same record is a no-op, not a duplicate.
 */
describe("PayoutService", () => {
  const build = async (record: Record<string, unknown> | null, existingPayout: Record<string, unknown> | null = null) => {
    const auditLog = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutService,
        {
          provide: PrismaService,
          useValue: {
            coachPayout: {
              findUnique: jest.fn().mockResolvedValue(existingPayout),
              create: jest.fn().mockImplementation(({ data }) => ({
                id: "payout_new",
                status: "PENDING",
                method: null,
                reference: null,
                paidAt: null,
                notes: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data
              })),
              update: jest.fn().mockImplementation(({ data }) => ({
                id: existingPayout?.id ?? "payout_1",
                payrollRecordId: existingPayout?.payrollRecordId ?? "rec_1",
                createdAt: new Date(),
                updatedAt: new Date(),
                ...existingPayout,
                ...data
              }))
            },
            coachPayrollRecord: {
              findUnique: jest.fn().mockResolvedValue(record),
              update: jest.fn().mockResolvedValue(undefined)
            }
          }
        },
        { provide: PayrollAuditService, useValue: { log: auditLog } },
        { provide: MessagingDispatchService, useValue: { dispatchInBackground: jest.fn() } }
      ]
    }).compile();
    return { service: module.get(PayoutService), auditLog };
  };

  describe("createForRecord", () => {
    it("creates a payout for a FINALIZED record", async () => {
      const { service } = await build({ id: "rec_1", status: "FINALIZED" });
      const payout = await service.createForRecord("rec_1", "admin_1");
      expect(payout.status).toBe("PENDING");
    });

    it("creates a payout for an already-PAID record (idempotent path)", async () => {
      const { service } = await build({ id: "rec_1", status: "PAID" });
      await expect(service.createForRecord("rec_1", "admin_1")).resolves.toMatchObject({
        status: "PENDING"
      });
    });

    it("refuses to create a payout for a non-finalized record", async () => {
      const { service } = await build({ id: "rec_1", status: "CALCULATED" });
      await expect(service.createForRecord("rec_1", "admin_1")).rejects.toThrow(ConflictException);
    });

    it("refuses when the record doesn't exist", async () => {
      const { service } = await build(null);
      await expect(service.createForRecord("missing", "admin_1")).rejects.toThrow(NotFoundException);
    });

    it("returns the existing payout instead of creating a second one", async () => {
      const existing = {
        id: "payout_existing",
        payrollRecordId: "rec_1",
        status: "PENDING",
        method: null,
        reference: null,
        paidAt: null,
        notes: null,
        adminId: "admin_0",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const { service } = await build({ id: "rec_1", status: "FINALIZED" }, existing);
      const payout = await service.createForRecord("rec_1", "admin_1");
      expect(payout.id).toBe("payout_existing");
    });
  });

  describe("markPaid", () => {
    const pendingPayout = {
      id: "payout_1",
      payrollRecordId: "rec_1",
      status: "PENDING",
      method: null,
      reference: null,
      paidAt: null,
      notes: null,
      adminId: "admin_0",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    it("marks a pending payout paid and the record PAID", async () => {
      const { service } = await build({ id: "rec_1", status: "FINALIZED" }, pendingPayout);
      const payout = await service.markPaid("payout_1", "admin_1", {
        reference: "UTR123456",
        method: "Bank transfer",
        paidAt: "2026-10-05T00:00:00.000Z"
      });
      expect(payout.status).toBe("PAID");
      expect(payout.reference).toBe("UTR123456");
    });

    it("refuses to mark an already-paid payout paid again", async () => {
      const { service } = await build(
        { id: "rec_1", status: "PAID" },
        { ...pendingPayout, status: "PAID" }
      );
      await expect(
        service.markPaid("payout_1", "admin_1", {
          reference: "x",
          method: "x",
          paidAt: "2026-10-05T00:00:00.000Z"
        })
      ).rejects.toThrow(ConflictException);
    });

    it("refuses when the payout doesn't exist", async () => {
      const { service } = await build(null, null);
      await expect(
        service.markPaid("missing", "admin_1", {
          reference: "x",
          method: "x",
          paidAt: "2026-10-05T00:00:00.000Z"
        })
      ).rejects.toThrow(NotFoundException);
    });

    it("audits the payment reference and method", async () => {
      const { service, auditLog } = await build({ id: "rec_1", status: "FINALIZED" }, pendingPayout);
      await service.markPaid("payout_1", "admin_1", {
        reference: "UTR999",
        method: "UPI",
        paidAt: "2026-10-05T00:00:00.000Z"
      });
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "PAYOUT_MARKED_PAID",
          metadata: expect.objectContaining({ reference: "UTR999", method: "UPI" })
        })
      );
    });
  });
});
