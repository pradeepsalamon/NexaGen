import { UserRole, UserStatus } from "@prisma/client";
import type { PrismaService, PrismaTransactionClient } from "../prisma/prisma.service";
import { EntitlementService } from "./entitlement.service";
import { PlanRestrictionException } from "./plan-restriction.exception";

const tenantRow = (plan: { features: string[]; limits: object }, status = "ACTIVE") => ({
  id: "tenant_nexa",
  name: "Nexa",
  status: "ACTIVE",
  subscription: {
    currentPeriodEnd: null,
    graceEndsAt: null,
    overrides: {},
    plan: { code: "STARTER", name: "Starter", ...plan },
    status,
    trialEndsAt: null
  }
});

describe("EntitlementService", () => {
  let prisma: { tenant: { findUnique: jest.Mock }; liveSession: { count: jest.Mock } };
  let tx: { $executeRaw: jest.Mock; user: { count: jest.Mock }; batch: { count: jest.Mock } };
  let service: EntitlementService;

  beforeEach(() => {
    prisma = { liveSession: { count: jest.fn() }, tenant: { findUnique: jest.fn() } };
    tx = { $executeRaw: jest.fn(), batch: { count: jest.fn() }, user: { count: jest.fn() } };
    service = new EntitlementService(prisma as unknown as PrismaService);
  });

  const asTx = () => tx as unknown as PrismaTransactionClient;

  it("fails closed when the tenant is missing", async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    await expect(service.getCurrent()).resolves.toMatchObject({ accessMode: "LOCKED", features: [], plan: null });
  });

  it("caches the state until invalidated", async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenantRow({ features: ["courses"], limits: {} }));
    await service.getState();
    await service.getState();
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    service.invalidate();
    await service.getState();
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed load", async () => {
    prisma.tenant.findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(service.getState()).rejects.toThrow("db down");
    prisma.tenant.findUnique.mockResolvedValue(tenantRow({ features: [], limits: {} }));
    await expect(service.getState()).resolves.toMatchObject({ accessMode: "FULL" });
  });

  it("refuses the seat past the limit, under the advisory lock, excluding the user being changed", async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenantRow({ features: [], limits: { maxStudents: 2 } }));
    tx.user.count.mockResolvedValue(2);
    const error = await service.assertSeatAvailable(asTx(), UserRole.STUDENT, "u1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRestrictionException);
    expect((error as PlanRestrictionException).getResponse()).toMatchObject({ code: "PLAN_LIMIT_REACHED", limit: "maxStudents" });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.count).toHaveBeenCalledWith({
      where: { id: { not: "u1" }, role: UserRole.STUDENT, status: UserStatus.ACTIVE }
    });
  });

  it("allows the seat under the limit; unlimited never counts", async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenantRow({ features: [], limits: { maxCoaches: null, maxStudents: 2 } }));
    tx.user.count.mockResolvedValue(1);
    await expect(service.assertSeatAvailable(asTx(), UserRole.STUDENT)).resolves.toBeUndefined();
    tx.user.count.mockClear();
    await expect(service.assertSeatAvailable(asTx(), UserRole.COACH)).resolves.toBeUndefined();
    expect(tx.user.count).not.toHaveBeenCalled();
  });

  it("admins take no seat", async () => {
    await service.assertSeatAvailable(asTx(), UserRole.ADMIN);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("caps batches and concurrent live classes", async () => {
    prisma.tenant.findUnique.mockResolvedValue(
      tenantRow({ features: [], limits: { maxBatches: 1, maxConcurrentLiveClasses: 1 } })
    );
    tx.batch.count.mockResolvedValue(1);
    await expect(service.assertCanCreateBatch(asTx())).rejects.toBeInstanceOf(PlanRestrictionException);
    prisma.liveSession.count.mockResolvedValue(0);
    await expect(service.assertCanStartLiveClass("c1")).resolves.toBeUndefined();
    prisma.liveSession.count.mockResolvedValue(1);
    await expect(service.assertCanStartLiveClass("c1")).rejects.toBeInstanceOf(PlanRestrictionException);
  });
});
