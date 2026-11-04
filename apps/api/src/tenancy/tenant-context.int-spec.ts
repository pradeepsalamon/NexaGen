import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { EntitlementService } from "../platform/entitlement.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { resetTenantAuditForTesting, tenantAuditCountsForTesting } from "./tenant-audit";
import { TenantResolverService } from "./tenant-resolver.service";

// Phase 2 tenant context end to end (docs/SAAS_MULTI_TENANCY.md §B, §D3): the
// request's academy comes from its Origin, creates are stamped with it, and a
// host/user mismatch is logged but not refused (audit mode).
describe("tenant context (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;

  const auditKeys = () => [...tenantAuditCountsForTesting().keys()];
  const createBatch = async (name: string) => {
    const res = await t.call(admin, "POST", API_ROUTES.batches.create, { name });
    expect(res.status).toBe(201);
    return t.prisma.batch.findFirstOrThrow({ select: { tenantId: true }, where: { name } });
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id }
    });
  });

  afterAll(async () => {
    await t.prisma.tenantDomain.deleteMany({});
    await t.close();
  });

  beforeEach(() => {
    resetTenantAuditForTesting();
    t.app.get(TenantResolverService).invalidate();
  });

  it("resolves a configured web origin to Nexa and stamps creates with it", async () => {
    const batch = await createBatch("tenant-ctx nexa");
    expect(batch.tenantId).toBe("tenant_nexa");
    expect(auditKeys().filter((key) => key.includes("|request|") || key.startsWith("user_"))).toEqual([]);
  });

  it("uses a tenant_domains row for the origin's host, ahead of the configured hosts", async () => {
    await t.prisma.tenant.create({ data: { id: "tenant_int_acme", name: "Acme", slug: "int-acme" } });
    await t.prisma.tenantDomain.create({
      data: { hostname: "localhost", kind: "CUSTOM", status: "ACTIVE", tenantId: "tenant_int_acme" }
    });
    // Plan gates follow the request's academy too: no subscription → 402.
    const locked = await t.call(admin, "POST", API_ROUTES.batches.create, { name: "tenant-ctx locked" });
    expect(locked.status).toBe(402);
    await t.prisma.tenantSubscription.create({
      data: { planId: "plan_enterprise", status: "ACTIVE", tenantId: "tenant_int_acme" }
    });
    t.app.get(EntitlementService).invalidate("tenant_int_acme");
    resetTenantAuditForTesting();
    const batch = await createBatch("tenant-ctx acme");
    // Stamped from the host's academy; the Nexa admin is logged, not refused.
    expect(batch.tenantId).toBe("tenant_int_acme");
    expect(auditKeys()).toContain("user_mismatch|POST /batches|tenant_int_acme|tenant_nexa");
  });

  it("ignores a PENDING domain", async () => {
    await t.prisma.tenantDomain.updateMany({ data: { status: "PENDING" }, where: { hostname: "localhost" } });
    const batch = await createBatch("tenant-ctx pending");
    expect(batch.tenantId).toBe("tenant_nexa");
  });
});
