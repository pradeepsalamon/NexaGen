import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { runWithTenantContext } from "../tenancy/tenant-context";
import { PayrollPeriodService } from "./payroll-period.service";

// Review R3: a class must never be paid in two periods.
describe("PayrollPeriodService.create", () => {
  const body = { endDate: "2026-12-01T00:00:00.000Z", periodType: "MONTHLY", startDate: "2026-11-01T00:00:00.000Z" } as const;

  const build = (overlapping: unknown) => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      payrollPeriod: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          createdAt: new Date(),
          id: "pp_1",
          status: "DRAFT",
          updatedAt: new Date()
        })),
        findFirst: jest.fn().mockResolvedValue(overlapping)
      }
    };
    const prisma = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
    return { service: new PayrollPeriodService(prisma as unknown as PrismaService), tx };
  };

  const inAcademy = <T>(fn: () => Promise<T>) =>
    runWithTenantContext({ host: null, label: "test", source: "job", tenantId: "tenant_nexa" }, fn);

  it("refuses a period that overlaps a live one", async () => {
    const { service, tx } = build({
      endDate: new Date("2026-11-16T00:00:00.000Z"),
      startDate: new Date("2026-10-16T00:00:00.000Z")
    });
    await expect(inAcademy(() => service.create("admin_1", body))).rejects.toBeInstanceOf(ConflictException);
    expect(tx.payrollPeriod.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          endDate: { gt: new Date(body.startDate) },
          startDate: { lt: new Date(body.endDate) },
          status: { not: "CANCELLED" }
        }
      })
    );
    expect(tx.payrollPeriod.create).not.toHaveBeenCalled();
  });

  it("creates a period next to another one", async () => {
    const { service, tx } = build(null);
    await expect(inAcademy(() => service.create("admin_1", body))).resolves.toMatchObject({ id: "pp_1" });
    expect(tx.$executeRaw).toHaveBeenCalled();
  });
});
