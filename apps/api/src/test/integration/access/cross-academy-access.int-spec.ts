import { API_ROUTES, DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { EntitlementService } from "../../../platform/entitlement.service";
import { setTenantScopeModeForTesting } from "../../../prisma/tenant-scope.extension";
import { asPlatform, runInTenant } from "../../../tenancy/tenant-context";
import { TenantResolverService } from "../../../tenancy/tenant-resolver.service";
import { createTestApp, type TestApp } from "../app";
import { resetDatabase } from "../db";
import { LIST_CASES, OWN_CASES, type Case, type World } from "./access-cases";
import { createWorld } from "./world";

// Phase 3 slice 7 (docs/SAAS_MULTI_TENANCY.md § "Phase 3 plan", §K): a second
// academy with a full copy of the access world, and TENANT_SCOPE_MODE=enforce.
// Every OWN_CASES route is replayed by Nexa's users (and Nexa's super admin)
// against the other academy's ids: none may succeed. The same routes on Nexa's
// own ids must still work under enforce, so a denial can't pass just because
// enforce broke the route.
const OTHER = "tenant_int_other";
const OTHER_ORIGIN = "https://academy-other.int.test";
const DENIED = /^4(00|03|04|09|22) /;

describe("cross-academy access (real app, real Postgres, enforce)", () => {
  let t: TestApp;
  let nexa: World;
  let other: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    nexa = await runInTenant(DEFAULT_TENANT_ID, "test:world-nexa", () => createWorld(t.prisma));
    await t.prisma.tenant.create({ data: { id: OTHER, name: "Other Academy", slug: "int-other" } });
    await t.prisma.tenantDomain.create({
      data: { hostname: "academy-other.int.test", kind: "CUSTOM", status: "ACTIVE", tenantId: OTHER }
    });
    await t.prisma.tenantSubscription.create({ data: { planId: "plan_enterprise", status: "ACTIVE", tenantId: OTHER } });
    other = await runInTenant(OTHER, "test:world-other", () =>
      createWorld(t.prisma, { periodMonth: "2026-08", prefix: "X" })
    );
    t.app.get(EntitlementService).invalidate();
    t.app.get(TenantResolverService).invalidate();
    setTenantScopeModeForTesting("enforce");
  });

  afterAll(async () => {
    setTenantScopeModeForTesting(null);
    await t?.close();
  });

  const body = (c: Case, w: World) => (typeof c.body === "function" ? c.body(w) : c.body);
  // A case names a row when it differs between the two worlds; a route on
  // "my own" data with no id can't reach another academy.
  const crossing = () =>
    OWN_CASES.filter(
      (c) => JSON.stringify([c.path(nexa), body(c, nexa)]) !== JSON.stringify([c.path(other), body(c, other)])
    );
  const deniedFor = async (caller: (c: Case) => Parameters<TestApp["call"]>[0]) => {
    const allowed: string[] = [];
    for (const c of crossing()) {
      const res = await t.call(caller(c), c.method ?? "GET", c.path(other), body(c, other));
      if (!DENIED.test(`${res.status} `)) allowed.push(`${res.status} ${c.name}`);
    }
    return allowed;
  };

  it("the world exists in both academies", async () => {
    const [nexaClass, otherClass] = await asPlatform("test: compare worlds", () =>
      Promise.all([
        t.prisma.coachClass.findUniqueOrThrow({ select: { tenantId: true }, where: { id: nexa.a.class.id } }),
        t.prisma.coachClass.findUniqueOrThrow({ select: { tenantId: true }, where: { id: other.a.class.id } })
      ])
    );
    expect([nexaClass.tenantId, otherClass.tenantId]).toEqual([DEFAULT_TENANT_ID, OTHER]);
    expect(crossing().length).toBeGreaterThan(30);
  });

  it.each(OWN_CASES.map((c) => [c.name, c] as const))("still allowed under enforce: %s", async (_name, c) => {
    const res = await t.call(c.as(nexa), c.method ?? "GET", c.path(nexa), body(c, nexa));
    expect({ path: c.path(nexa), status: res.status }).toEqual({ path: c.path(nexa), status: 200 });
  });

  it("denies every route on the other academy's ids", async () => {
    expect(await deniedFor((c) => c.as(nexa))).toEqual([]);
  });

  it("Nexa's super admin can't reach the other academy's ids either", async () => {
    expect(await deniedFor(() => nexa.superAdmin)).toEqual([]);
  });

  it.each(LIST_CASES.map((c) => [c.name, c] as const))("lists never show the other academy: %s", async (_name, c) => {
    const res = await t.call(c.as(nexa), c.method ?? "GET", c.path(nexa), body(c, nexa));
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const side of [other.a, other.b]) {
      for (const row of [side.student, side.coach, side.class, side.batch, side.invoice, side.privatePuzzle, side.assignment, side.kbArticle]) {
        expect(text).not.toContain(row.id);
      }
    }
  });

  it("the other academy's super admin works on its own host and is refused on Nexa's", async () => {
    const own = await t.call(other.superAdmin, "GET", API_ROUTES.batches.get(other.a.batch.id), undefined, {
      origin: OTHER_ORIGIN
    });
    expect(own.status).toBe(200);
    const onNexa = await t.call(other.superAdmin, "GET", API_ROUTES.batches.get(other.a.batch.id));
    expect(onNexa.status).toBe(401);
    const nexaOnOther = await t.call(nexa.superAdmin, "GET", API_ROUTES.batches.get(nexa.a.batch.id), undefined, {
      origin: OTHER_ORIGIN
    });
    expect(nexaOnOther.status).toBe(401);
  });

  it("the cross-academy writes above changed nothing", async () => {
    await asPlatform("test: read the other academy", async () => {
      const klass = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: other.a.class.id } });
      expect(klass.notes).not.toBe("hijacked");
      expect((await t.prisma.puzzle.findUniqueOrThrow({ where: { id: other.a.privatePuzzle.id } })).title).toBe("Private XA");
      expect((await t.prisma.assignment.findUniqueOrThrow({ where: { id: other.a.assignment.id } })).title).toBe("Homework XA");
      expect(await t.prisma.knowledgeArticleVersion.count({ where: { title: "hijacked" } })).toBe(0);
      // Nothing was created in the other academy by a Nexa caller.
      expect(await t.prisma.approvalRequest.count({ where: { tenantId: OTHER } })).toBe(0);
    });
  });
});

