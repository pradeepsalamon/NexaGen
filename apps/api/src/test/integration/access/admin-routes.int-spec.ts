import { UserRole, UserStatus, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";
import { registeredRoutes } from "../routes";

// Every registered route under these is checked automatically, so a new admin
// route is covered the moment it exists. Mixed modules list their admin routes.
const ADMIN_PREFIXES = ["/admin", "/analytics", "/announcements", "/batch-schedules", "/messaging", "/users"];
const ADMIN_ROUTES = [
  "GET /batches/assignable-users",
  "GET /live-class-settings/audit",
  "POST /class-requests/:id/approve",
  "POST /class-requests/:id/reject"
];
// /courses is admin-only except the student's own /courses/mine.
const isAdminCourseRoute = (path: string) =>
  (path === "/courses" || path.startsWith("/courses/")) && !path.startsWith("/courses/mine");

// AdminController is SUPER_ADMIN only (routeAccess.ts mirrors it on the web).
const SUPER_ADMIN_PREFIXES = [
  "/admin/ai",
  "/admin/backups",
  "/admin/classes",
  "/admin/coaches",
  "/admin/demo-classes",
  "/admin/demo-schedules",
  "/admin/trash"
];

// Never called with a privileged user: they act on the outside world (pg_dump, object storage).
const OUTSIDE_EFFECTS = new Set([
  "DELETE /admin/backups",
  "GET /admin/backups",
  "GET /admin/backups/download",
  "POST /admin/backups/trigger"
]);

// Coach routes admins may also read (the analytics pages link to a class).
const STAFF_READABLE_COACH_ROUTES = new Set(["GET /coach/classes/:id"]);

const DUMMY_ID ="00000000-0000-0000-0000-000000000000";

type Route = { method: string; path: string };

const under = (path: string, prefixes: string[]) =>
  prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));


describe("admin-only routes refuse other roles (real app, real Postgres)", () => {
  let t: TestApp;
  let users: Record<"student" | "coach" | "admin" | "superAdmin", User>;
  let adminRoutes: Route[];

  const call = (user: User, route: Route) =>
    t.call(
      user,
      route.method,
      route.path.replace(/:[^/]+/g, DUMMY_ID),
      route.method === "GET" || route.method === "DELETE" ? undefined : {}
    );

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    const active = async (role: UserRole) =>
      t.prisma.user.update({
        data: { status: UserStatus.ACTIVE },
        where: { id: (await createUser(t.prisma, role)).id }
      });
    users = {
      admin: await active(UserRole.ADMIN),
      coach: await active(UserRole.COACH),
      student: await active(UserRole.STUDENT),
      superAdmin: await active(UserRole.SUPER_ADMIN)
    };
    adminRoutes = registeredRoutes(t).filter(
      (r) =>
        under(r.path, ADMIN_PREFIXES) ||
        ADMIN_ROUTES.includes(`${r.method} ${r.path}`) ||
        isAdminCourseRoute(r.path)
    );
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("discovers the routes (a broken discovery must not pass silently)", () => {
    const keys = adminRoutes.map((r) => `${r.method} ${r.path}`);
    expect(keys).toEqual(expect.arrayContaining(["GET /users", "GET /admin/trash", "GET /analytics/overview"]));
    for (const key of ADMIN_ROUTES) expect(keys).toContain(key);
  });

  // A 400 is accepted only when an admin gets the same 400: the body or params
  // were rejected before any role-dependent code ran, so nothing was reached.
  async function expectRefused(route: Route, roles: ("student" | "coach" | "admin")[]) {
    const privileged = OUTSIDE_EFFECTS.has(`${route.method} ${route.path}`)
      ? null
      : await call(users.superAdmin, route);
    for (const role of roles) {
      const res = await call(users[role], route);
      const ok = res.status === 403 || (res.status === 400 && privileged?.status === 400);
      expect({ role, route: `${route.method} ${route.path}`, status: res.status, ok }).toMatchObject({ ok: true });
    }
  }

  it("students and coaches get 403 on every admin route", async () => {
    for (const route of adminRoutes) await expectRefused(route, ["student", "coach"]);
  }, 600_000);

  it("plain admins get 403 on every super-admin route", async () => {
    for (const route of adminRoutes.filter((r) => under(r.path, SUPER_ADMIN_PREFIXES))) {
      await expectRefused(route, ["admin"]);
    }
  }, 300_000);

  // A wrong role is 403, never 401: the web client treats 401 as an expired
  // session and spends a refresh-token rotation retrying it.
  it.each([
    ["/coach", ["student", "admin", "superAdmin"]],
    ["/student", ["coach", "admin", "superAdmin"]]
  ] as const)("routes under %s refuse other roles with 403", async (prefix, roles) => {
    const routes = registeredRoutes(t).filter((r) => under(r.path, [prefix]));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      for (const role of roles) {
        const key = `${route.method} ${route.path}`;
        if (role !== "student" && STAFF_READABLE_COACH_ROUTES.has(key)) continue;
        const res = await call(users[role], route);
        expect({ role, route: key, status: res.status }).toEqual({ role, route: key, status: 403 });
      }
    }
  }, 120_000);

  // Platform powers come from a PlatformStaff row, never a tenant role (docs/SAAS_PLANS.md).
  it("every /platform route refuses every tenant role, super admin included, with 403", async () => {
    const routes = registeredRoutes(t).filter((r) => under(r.path, ["/platform"]));
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      for (const role of ["student", "coach", "admin", "superAdmin"] as const) {
        const key = `${route.method} ${route.path}`;
        const body = route.method === "PUT" ? { status: "ACTIVE" } : route.method === "GET" ? undefined : {};
        const res = await t.call(users[role], route.method, route.path.replace(/:[^/]+/g, DUMMY_ID), body);
        const ok = res.status === 403;
        expect({ role, route: key, status: res.status, ok }).toMatchObject({ ok: true });
      }
    }
  }, 120_000);

  it("a super admin is never refused (positive control)", async () => {
    for (const route of adminRoutes) {
      if (route.method !== "GET" || OUTSIDE_EFFECTS.has(`${route.method} ${route.path}`)) continue;
      const res = await call(users.superAdmin, route);
      expect({ refused: [401, 403].includes(res.status), route: route.path, status: res.status }).toMatchObject({
        refused: false
      });
    }
  }, 300_000);
});
