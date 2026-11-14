import { UserRole, UserStatus, type User } from "@prisma/client";
import { API_ROUTES, DEFAULT_TENANT_ID, type EntitlementOverrides } from "@nexa-chess/types";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { EntitlementService } from "./entitlement.service";

describe("SaaS plan enforcement (real app, real Postgres)", () => {
  let t: TestApp;
  let entitlements: EntitlementService;
  let superAdmin: User;

  const active = async (role: UserRole) =>
    t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, role)).id }
    });

  const setSubscription = async (data: {
    planId?: string;
    status?: "ACTIVE" | "GRACE" | "EXPIRED";
    graceEndsAt?: Date;
    overrides?: Partial<EntitlementOverrides>;
  }) => {
    await t.prisma.tenantSubscription.update({ data, where: { tenantId: DEFAULT_TENANT_ID } });
    entitlements.invalidate();
  };

  beforeAll(async () => {
    t = await createTestApp();
    entitlements = t.app.get(EntitlementService);
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    entitlements.invalidate();
    superAdmin = await active(UserRole.SUPER_ADMIN);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("the seeded academy is on Enterprise and reaches every gated route", async () => {
    const res = await t.call(superAdmin, "GET", API_ROUTES.subscription.current);
    expect(res).toMatchObject({ body: { accessMode: "FULL", plan: { code: "ENTERPRISE" } }, status: 200 });
    expect((await t.call(superAdmin, "GET", API_ROUTES.analytics.users)).status).toBe(200);
  });

  it("a plan without the feature gets a 402; ungated routes are unaffected", async () => {
    await setSubscription({ planId: "plan_starter" });
    const res = await t.call(superAdmin, "GET", API_ROUTES.analytics.users);
    expect(res).toMatchObject({ body: { code: "PLAN_FEATURE_REQUIRED", feature: "advancedAnalytics" }, status: 402 });
    // The admin home dashboard stays on every plan.
    expect((await t.call(superAdmin, "GET", API_ROUTES.analytics.overview)).status).toBe(200);
    expect((await t.call(superAdmin, "GET", API_ROUTES.batches.list)).status).toBe(200);
  });

  it("an override can add a feature the plan lacks", async () => {
    await setSubscription({ overrides: { addFeatures: ["advancedAnalytics"] }, planId: "plan_starter" });
    expect((await t.call(superAdmin, "GET", API_ROUTES.analytics.users)).status).toBe(200);
  });

  describe("seat limits", () => {
    beforeEach(async () => {
      await setSubscription({ overrides: { limits: { maxStudents: 1 } }, planId: "plan_starter" });
      await active(UserRole.STUDENT);
    });

    const newUser = (role: UserRole, n: number) => ({
      email: `seat-${role.toLowerCase()}-${n}@int.test`,
      firstName: "Seat",
      password: "Seat@12345",
      role
    });

    it("creating an active student past the limit is a 402; a coach still fits", async () => {
      const res = await t.call(superAdmin, "POST", API_ROUTES.users.create, newUser(UserRole.STUDENT, 1));
      expect(res).toMatchObject({ body: { code: "PLAN_LIMIT_REACHED", limit: "maxStudents" }, status: 402 });
      expect((await t.call(superAdmin, "POST", API_ROUTES.users.create, newUser(UserRole.COACH, 1))).status).toBe(201);
    });

    it("a pending sign-up takes no seat until approved", async () => {
      const pending = await createUser(t.prisma, UserRole.STUDENT);
      const res = await t.call(superAdmin, "PATCH", API_ROUTES.admin.updateStudentStatus(pending.id), {
        status: "ACTIVE"
      });
      expect(res).toMatchObject({ body: { code: "PLAN_LIMIT_REACHED" }, status: 402 });
      const row = await t.prisma.user.findUniqueOrThrow({ where: { id: pending.id } });
      expect(row.status).toBe(UserStatus.PENDING);
    });

    it("concurrent creates for the last seat: exactly one succeeds", async () => {
      await setSubscription({ overrides: { limits: { maxStudents: 2 } }, planId: "plan_starter" });
      await t.tokenFor(superAdmin); // creates the session row once, not in four racing upserts
      const results = await Promise.all(
        [1, 2, 3, 4].map((n) => t.call(superAdmin, "POST", API_ROUTES.users.create, newUser(UserRole.STUDENT, n)))
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 402, 402, 402]);
      expect(await t.prisma.user.count({ where: { role: UserRole.STUDENT, status: UserStatus.ACTIVE } })).toBe(2);
    });
  });

  it("GRACE is read-only: reads work, changes are a 402", async () => {
    await setSubscription({ graceEndsAt: new Date(Date.now() + 86_400_000), status: "GRACE" });
    expect((await t.call(superAdmin, "GET", API_ROUTES.batches.list)).status).toBe(200);
    const res = await t.call(superAdmin, "POST", API_ROUTES.batches.create, { name: "Blocked" });
    expect(res).toMatchObject({ body: { code: "SUBSCRIPTION_READ_ONLY" }, status: 402 });
  });

  it("EXPIRED locks everything but sign-in and the subscription page", async () => {
    await setSubscription({ status: "EXPIRED" });
    const res = await t.call(superAdmin, "GET", API_ROUTES.batches.list);
    expect(res).toMatchObject({ body: { code: "SUBSCRIPTION_LOCKED" }, status: 402 });
    expect(await t.call(superAdmin, "GET", API_ROUTES.subscription.admin)).toMatchObject({ status: 200 });
  });

  it("platform staff change the plan; it applies at once and is logged", async () => {
    await t.prisma.platformStaff.create({ data: { userId: superAdmin.id } });
    const res = await t.call(superAdmin, "PUT", API_ROUTES.platform.tenantSubscription(DEFAULT_TENANT_ID), {
      note: "Downgrade test",
      planCode: "GROWTH"
    });
    expect(res).toMatchObject({ body: { plan: { code: "GROWTH" } }, status: 200 });
    expect((await t.call(superAdmin, "GET", API_ROUTES.analytics.users)).status).toBe(402);
    const events = await t.prisma.tenantSubscriptionEvent.findMany({ where: { tenantId: DEFAULT_TENANT_ID } });
    expect(events).toEqual([
      expect.objectContaining({
        actorUserId: superAdmin.id,
        fromPlanCode: "ENTERPRISE",
        note: "Downgrade test",
        source: "ADMIN",
        toPlanCode: "GROWTH"
      })
    ]);
  });
});
