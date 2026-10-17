import { expect, test, type APIRequestContext } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };

async function loginCookies(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  // /auth/login is throttled 5/60s; a full-suite run trips it — back off on 429.
  let res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password }
  });
  for (let attempt = 0; res.status() === 429 && attempt < 6; attempt += 1) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  }
  expect(res.ok(), `login ${email}: ${await res.text()}`).toBeTruthy();
  const setCookies = res.headers()["set-cookie"] || "";
  return setCookies
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .filter((c) => c.includes("nexa_"))
    .join("; ");
}

const SECTIONS = [
  "overview",
  "users",
  "acquisition",
  "students",
  "coaches",
  "classes",
  "attendance",
  "batches",
  "recordings",
  "storage",
  "engagement",
  "operations",
  "today",
  "alerts"
] as const;

test.describe("Admin analytics API", () => {
  test("every section responds for an admin", async ({ request }) => {
    const cookies = await loginCookies(request, ADMIN.email, ADMIN.password);
    for (const section of SECTIONS) {
      const res = await request.get(`${API_URL}/analytics/${section}`, {
        headers: { Cookie: cookies }
      });
      expect(res.status(), `${section} status`).toBe(200);
      const body = await res.json();
      expect(body.meta, `${section} meta`).toBeTruthy();
      expect(body.meta.timezone).toBeTruthy();
    }
  });

  test("date-range presets change the returned window", async ({ request }) => {
    const cookies = await loginCookies(request, ADMIN.email, ADMIN.password);
    const last7 = await (
      await request.get(`${API_URL}/analytics/overview?preset=last7`, {
        headers: { Cookie: cookies }
      })
    ).json();
    const thisYear = await (
      await request.get(`${API_URL}/analytics/overview?preset=thisYear`, {
        headers: { Cookie: cookies }
      })
    ).json();
    expect(new Date(last7.meta.rangeStart).getTime()).toBeGreaterThan(
      new Date(thisYear.meta.rangeStart).getTime()
    );
  });

  test("drill-down tables paginate", async ({ request }) => {
    const cookies = await loginCookies(request, ADMIN.email, ADMIN.password);
    const res = await request.get(
      `${API_URL}/analytics/tables/users?page=1&pageSize=5`,
      { headers: { Cookie: cookies } }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.pagination.pageSize).toBe(5);
  });

  test("CSV export returns a text/csv attachment", async ({ request }) => {
    const cookies = await loginCookies(request, ADMIN.email, ADMIN.password);
    const res = await request.get(`${API_URL}/analytics/export/coaches`, {
      headers: { Cookie: cookies }
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
    expect(res.headers()["content-disposition"]).toContain("attachment");
    const text = await res.text();
    expect(text.split("\n")[0]).toContain("Coach");
  });

  test("a student is forbidden", async ({ request }) => {
    const cookies = await loginCookies(request, STUDENT.email, STUDENT.password);
    const res = await request.get(`${API_URL}/analytics/overview`, {
      headers: { Cookie: cookies }
    });
    expect(res.status()).toBe(403);
  });

  test("an anonymous request is unauthorized", async ({ request }) => {
    const res = await request.get(`${API_URL}/analytics/overview`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Admin analytics dashboard UI", () => {
  test("renders sections and drills down", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(ADMIN.email);
    await page.locator('input[type="password"]').fill(ADMIN.password);
    await page
      .getByRole("button", { name: /sign in|log in|login/i })
      .click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000
    });

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: "Dashboard", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Executive overview")).toBeVisible();
    await expect(page.getByText("Total users").first()).toBeVisible();

    // drill down from the dashboard's report links into the coach analytics page
    await page.getByRole("main").getByRole("link", { name: /coach analytics/i }).click();
    await page.waitForURL(/\/admin\/analytics\/coaches/);
    // The header repeats the name as a plain label; the page body owns the heading.
    await expect(
      page.getByRole("main").getByRole("heading", { name: /Coach Analytics/i })
    ).toBeVisible();
  });

  test("a student hitting /admin is redirected or blocked", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/email/i).fill(STUDENT.email);
    await page.locator('input[type="password"]').fill(STUDENT.password);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000
    });

    await page.goto("/admin");
    // middleware.ts sends a wrong role to its own dashboard (lib/routeAccess.ts);
    // the API would refuse the analytics calls anyway.
    await page.waitForURL(/\/student(\/|$)/, { timeout: 15_000 });
    await expect(page.getByText("Executive overview")).toHaveCount(0);
  });
});
