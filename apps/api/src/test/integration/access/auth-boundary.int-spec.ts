import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { hashSecret } from "../../../auth/auth.utils";
import { TEST_ORIGIN } from "../app-env";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";
import { registeredRoutes } from "../routes";

/**
 * Routes that answer without a session, by design. Everything else the app
 * mounts must refuse an anonymous caller. Webhooks authenticate by signature
 * (refused here because the test sends none); demo pages are guest-facing.
 */
const ANONYMOUS_OK = new Set([
  "GET /health",
  "GET /health/ready",
  "POST /auth/logout"
]);


describe("auth boundary (real app, real Postgres)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("every mounted route refuses an anonymous caller unless it is public by design", async () => {
    const routes = registeredRoutes(t);
    expect(routes.length).toBeGreaterThan(400);
    const answered: string[] = [];
    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      if (ANONYMOUS_OK.has(key)) continue;
      const path = route.path.replace(/:(\w+)/g, "anon-probe");
      const res = await t.call(null, route.method, path, route.method === "GET" ? undefined : {});
      // 4xx only: a 2xx served someone with no session, and a 5xx means the
      // handler ran far enough to fail before deciding who was asking.
      if (res.status < 400 || res.status >= 500) answered.push(`${res.status} ${key}`);
    }
    expect(answered).toEqual([]);
  });

  describe("a revoked session", () => {
    const password = "Boundary@12345";

    async function login() {
      const user = await createUser(t.prisma, UserRole.STUDENT);
      await t.prisma.user.update({
        data: { password: await hashSecret(password), status: UserStatus.ACTIVE },
        where: { id: user.id }
      });
      await t.prisma.studentProfile.create({ data: { parentName: "Parent", userId: user.id } });
      const res = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.auth.login}`, {
        body: JSON.stringify({ email: user.email, password }),
        headers: { "Content-Type": "application/json", Origin: TEST_ORIGIN },
        method: "POST"
      });
      expect(res.status).toBe(200);
      const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0]);
      return { cookie: cookies.join("; "), user };
    }

    const get = (path: string, cookie: string) =>
      fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${path}`, { headers: { Cookie: cookie, Origin: TEST_ORIGIN } });

    it("logout ends the access token at once, not when it expires", async () => {
      const { cookie } = await login();
      expect((await get(API_ROUTES.auth.me, cookie)).status).toBe(200);
      expect((await get(API_ROUTES.student.dashboard, cookie)).status).toBe(200);

      const out = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.auth.logout}`, {
        headers: { Cookie: cookie, Origin: TEST_ORIGIN },
        method: "POST"
      });
      expect(out.status).toBe(200);

      // The same (still unexpired) access cookie, replayed after logout.
      expect((await get(API_ROUTES.auth.me, cookie)).status).toBe(401);
      expect((await get(API_ROUTES.student.dashboard, cookie)).status).toBe(401);
    });

    it("a session revoked elsewhere (password reset, reuse detection) is refused too", async () => {
      const { cookie, user } = await login();
      expect((await get(API_ROUTES.student.dashboard, cookie)).status).toBe(200);
      await t.prisma.authSession.updateMany({ data: { revokedAt: new Date() }, where: { userId: user.id } });
      expect((await get(API_ROUTES.student.dashboard, cookie)).status).toBe(401);
    });

    it("a deactivated account is refused on its next request", async () => {
      const { cookie, user } = await login();
      await t.prisma.user.update({ data: { status: UserStatus.ARCHIVED }, where: { id: user.id } });
      expect((await get(API_ROUTES.student.dashboard, cookie)).status).toBe(401);
    });
  });
});
