import { API_ROUTES, type PlatformTenantResponse, type TenantUsageSnapshot } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { TenantUsageService } from "./tenant-usage.service";

// Phase 6d usage counters (docs/SAAS_MULTI_TENANCY.md §G "Enforcement"): one
// nightly snapshot per academy, counted inside that academy only, read by the
// platform console and nobody else.
describe("academy usage counters (real app, real Postgres)", () => {
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let rookId: string;
  let seq = 0;

  const activeUser = (tenantId: string, role: UserRole) =>
    runInTenant(tenantId, "spec", () => {
      seq += 1;
      return t.prisma.user.create({
        data: { email: `usage-${seq}@int.test`, firstName: `U${seq}`, password: "x", role, status: UserStatus.ACTIVE }
      });
    });

  const snapshots = async () =>
    asPlatform("spec", () => t.prisma.tenantUsage.findMany({ orderBy: { tenantId: "asc" } }));

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    operator = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.SUPER_ADMIN)).id }
    });
    const created = await t.call(operator, "POST", API_ROUTES.platform.tenants, {
      idempotencyKey: "usage-rook-0001",
      name: "Rook Academy",
      planCode: "GROWTH",
      slug: "rook",
      superAdmin: { email: "owner@rook-usage.int.test", firstName: "Ravi" }
    });
    rookId = (created.body as PlatformTenantResponse).tenant.id;

    await activeUser(rookId, UserRole.STUDENT);
    await activeUser(rookId, UserRole.STUDENT);
    await activeUser(rookId, UserRole.COACH);
    await activeUser("tenant_nexa", UserRole.STUDENT);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("the nightly run snapshots each academy's own counts", async () => {
    await t.app.get(TenantUsageService).snapshotCron();

    const rows = await snapshots();
    const rook = rows.find((row) => row.tenantId === rookId);
    const nexa = rows.find((row) => row.tenantId === "tenant_nexa");
    expect(rook?.counts).toMatchObject({ maxBatches: 0, maxCoaches: 1, maxStudents: 2 });
    expect(nexa?.counts).toMatchObject({ maxCoaches: 0, maxStudents: 1 });
  });

  it("a later run replaces the snapshot instead of adding one", async () => {
    const service = t.app.get(TenantUsageService);
    const before = (await snapshots()).find((row) => row.tenantId === rookId);
    await activeUser(rookId, UserRole.STUDENT);
    await service.snapshotCron();

    const rows = (await snapshots()).filter((row) => row.tenantId === rookId);
    expect(rows).toHaveLength(1);
    expect(rows[0].counts).toMatchObject({ maxStudents: 3 });
    expect(rows[0].measuredAt.getTime()).toBeGreaterThanOrEqual(before!.measuredAt.getTime());
  });

  it("only the platform console reads them", async () => {
    const res = await t.call(operator, "GET", API_ROUTES.platform.usage);
    expect(res.status).toBe(200);
    const usage = (res.body as { usage: TenantUsageSnapshot[] }).usage;
    expect(usage.map((row) => row.tenantId)).toEqual(expect.arrayContaining([rookId, "tenant_nexa"]));
    expect(usage.find((row) => row.tenantId === rookId)?.counts).toMatchObject({ maxStudents: 3 });

    const owner = await asPlatform("spec", async () =>
      t.prisma.user.update({
        data: { status: UserStatus.ACTIVE },
        where: { id: (await t.prisma.user.findFirstOrThrow({ where: { email: "owner@rook-usage.int.test" } })).id }
      })
    );
    expect((await t.call(owner, "GET", API_ROUTES.platform.usage, undefined, { origin: "https://rook.nexachess.in" })).status).toBe(403);
    const nexaAdmin = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id }
    });
    expect((await t.call(nexaAdmin, "GET", API_ROUTES.platform.usage)).status).toBe(403);
  });
});
