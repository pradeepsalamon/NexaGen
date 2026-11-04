import { API_ROUTES, DEFAULT_TENANT_ID, type PlatformTenantResponse } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform } from "../tenancy/tenant-context";
import { TenantResolverService } from "../tenancy/tenant-resolver.service";

// Phase 4a/4b (docs/SAAS_MULTI_TENANCY.md § "Phase 4 plan"): the platform
// console's academies. Platform powers are Nexa's super admins only.
describe("platform console: academies (real app, real Postgres)", () => {
  let t: TestApp;
  const users = {} as Record<"admin" | "superAdmin", Awaited<ReturnType<typeof createUser>>>;

  const create = (overrides: Record<string, unknown> = {}) =>
    t.call(users.superAdmin, "POST", API_ROUTES.platform.tenants, {
      idempotencyKey: "create-acme-0001",
      name: "Acme Chess",
      planCode: "GROWTH",
      slug: "acme",
      superAdmin: { email: "owner@acme.int.test", firstName: "Asha" },
      ...overrides
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    for (const [key, role] of [["admin", UserRole.ADMIN], ["superAdmin", UserRole.SUPER_ADMIN]] as const) {
      users[key] = await t.prisma.user.update({
        data: { status: UserStatus.ACTIVE },
        where: { id: (await createUser(t.prisma, role)).id }
      });
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  it("creates an academy in one go, and a repeat returns the same one", async () => {
    const first = await create();
    expect(first.status).toBe(201);
    const tenant = (first.body as PlatformTenantResponse).tenant;
    expect(tenant).toMatchObject({
      name: "Acme Chess",
      plan: { code: "GROWTH" },
      primaryHost: "acme.nexachess.in",
      slug: "acme",
      status: "ACTIVE"
    });
    const again = await create();
    expect((again.body as PlatformTenantResponse).tenant.id).toBe(tenant.id);

    await asPlatform("spec: inspect the new academy", async () => {
      const members = await t.prisma.user.findMany({ where: { tenantId: tenant.id } });
      expect(members.map((user) => [user.email, user.role, user.isPlatformSupport]).sort()).toEqual([
        ["owner@acme.int.test", "SUPER_ADMIN", false],
        [`support+${tenant.id}@platform.invalid`, "SUPER_ADMIN", true]
      ]);
      const owner = members.find((user) => !user.isPlatformSupport)!;
      expect(await t.prisma.passwordResetToken.count({ where: { userId: owner.id } })).toBe(1);
      expect(await t.prisma.platformAuditLog.count({ where: { action: "tenant.create", targetTenantId: tenant.id } })).toBe(1);
    });
  });

  it("the new academy resolves from its subdomain", async () => {
    t.app.get(TenantResolverService).invalidate();
    const match = await t.app.get(TenantResolverService).resolveHost("acme.nexachess.in");
    expect(match?.source).toBe("host");
  });

  it("refuses a taken or reserved address, and an email already on the platform", async () => {
    expect((await create({ idempotencyKey: "create-acme-0002" })).status).toBe(409);
    expect((await create({ idempotencyKey: "create-www-0001", slug: "www" })).status).toBe(400);
    const taken = await create({
      idempotencyKey: "create-beta-0001",
      slug: "beta",
      superAdmin: { email: users.admin.email, firstName: "X" }
    });
    expect(taken.status).toBe(409);
  });

  it("suspends and reactivates with a reason, never Nexa itself", async () => {
    const list = await t.call(users.superAdmin, "GET", API_ROUTES.platform.tenants);
    const acme = (list.body as { tenants: Array<{ id: string; slug: string }> }).tenants.find((row) => row.slug === "acme")!;
    const suspended = await t.call(users.superAdmin, "POST", API_ROUTES.platform.tenantSuspend(acme.id), { reason: "Unpaid" });
    expect((suspended.body as PlatformTenantResponse).tenant).toMatchObject({ accessMode: "LOCKED", status: "SUSPENDED" });
    const back = await t.call(users.superAdmin, "POST", API_ROUTES.platform.tenantReactivate(acme.id), { reason: "Paid" });
    expect((back.body as PlatformTenantResponse).tenant.status).toBe("ACTIVE");
    const nexa = await t.call(users.superAdmin, "POST", API_ROUTES.platform.tenantSuspend(DEFAULT_TENANT_ID), { reason: "No" });
    expect(nexa.status).toBe(400);
  });

  it("adds a full domain as PENDING, and only an ACTIVE one can be primary", async () => {
    const list = await t.call(users.superAdmin, "GET", API_ROUTES.platform.tenants);
    const acme = (list.body as { tenants: Array<{ id: string; slug: string }> }).tenants.find((row) => row.slug === "acme")!;
    const added = await t.call(users.superAdmin, "POST", API_ROUTES.platform.tenantDomains(acme.id), {
      hostname: "Chess.Acme.example"
    });
    const domain = (added.body as PlatformTenantResponse).tenant.domains.find((row) => row.hostname === "chess.acme.example")!;
    expect(domain).toMatchObject({ isPrimary: false, kind: "CUSTOM", status: "PENDING" });
    const primary = await t.call(users.superAdmin, "POST", API_ROUTES.platform.tenantDomainPrimary(acme.id, domain.id));
    expect(primary.status).toBe(400);
    const underRoot = await t.call(users.superAdmin, "POST", API_ROUTES.platform.tenantDomains(acme.id), {
      hostname: "other.nexachess.in"
    });
    expect(underRoot.status).toBe(400);
    const removed = await t.call(users.superAdmin, "DELETE", API_ROUTES.platform.tenantDomain(acme.id, domain.id));
    expect((removed.body as PlatformTenantResponse).tenant.domains.map((row) => row.hostname)).toEqual(["acme.nexachess.in"]);
  });

  it("an academy admin, and another academy's super admin, get 403", async () => {
    expect((await t.call(users.admin, "GET", API_ROUTES.platform.tenants)).status).toBe(403);
    const otherOwner = await asPlatform("spec: the new academy's owner", () =>
      t.prisma.user.findFirstOrThrow({ where: { email: "owner@acme.int.test" } })
    );
    // On Nexa's host the account is refused outright (another academy's user);
    // its role would not be enough anyway.
    const res = await t.call(otherOwner, "GET", API_ROUTES.platform.tenants);
    expect([401, 403]).toContain(res.status);
  });

  it("writes every console change to the audit log", async () => {
    const res = await t.call(users.superAdmin, "GET", API_ROUTES.platform.audit);
    const actions = (res.body as { entries: Array<{ action: string }> }).entries.map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining(["tenant.create", "tenant.suspend", "tenant.reactivate", "domain.add", "domain.remove"])
    );
  });
});
