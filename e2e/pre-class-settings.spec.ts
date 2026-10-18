import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginContext, scheduleClass, seededBatchId } from "./fixtures";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const COACH = { email: "coach@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };
const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  // /auth/login is throttled 5/60s. These specs do 2 logins per test across
  // several tests, so a burst run trips the limiter — back off and retry on 429.
  let res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  for (let attempt = 0; res.status() === 429 && attempt < 6; attempt += 1) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  }
  expect(res.ok(), `Login failed for ${email}: ${await res.text()}`).toBeTruthy();
  return (res.headers()["set-cookie"] || "")
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .filter((c) => c.includes("nexa_"))
    .join("; ");
}

function api(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: string,
  body?: Record<string, unknown>,
) {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookies },
    data: body,
  });
}

/**
 * Cancel/end the coach's leftover E2E classes (stuck SCHEDULED/LIVE from earlier
 * runs on the shared dev DB) so approving a new class doesn't 409 on the
 * scheduling-conflict check.
 */
async function clearCoachSchedule(request: APIRequestContext, cookies: string) {
  for (const path of ["/coach/classes/upcoming", "/coach/classes"]) {
    const res = await api(request, "GET", path, cookies);
    if (!res.ok()) continue;
    const data = await res.json();
    const list: Array<{ id: string; topic?: string; status?: string }> = Array.isArray(data?.classes)
      ? data.classes
      : Array.isArray(data)
        ? data
        : [];
    for (const c of list) {
      if (!/E2E/i.test(c.topic || "")) continue;
      if (c.status === "LIVE") await api(request, "POST", `/live-class/${c.id}/end`, cookies);
      else await api(request, "PATCH", `/coach/classes/${c.id}/cancel`, cookies);
    }
  }
}

test.describe("Pre-class settings — layered resolution & authz", () => {
  test("system policy: admin reads & writes, coach cannot write", async ({ request }) => {
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);
    const coach = await loginAs(request, COACH.email, COACH.password);

    const get = await api(request, "GET", "/live-class-settings/policy", admin);
    expect(get.status()).toBe(200);
    const policy = await get.json();
    expect(policy.settings.student.mic).toBeTruthy();

    const coachWrite = await api(request, "PUT", "/live-class-settings/policy", coach, {
      settings: { student: { chat: "DISABLED" } },
    });
    expect(coachWrite.status()).toBe(403);

    const adminWrite = await api(request, "PUT", "/live-class-settings/policy", admin, {
      settings: { student: { mic: policy.settings.student.mic } },
    });
    expect(adminWrite.status()).toBe(200);
  });

  test("presets: coach makes a personal one, only admin makes an org one", async ({ request }) => {
    const coach = await loginAs(request, COACH.email, COACH.password);
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);

    const personal = await api(request, "POST", "/live-class-presets", coach, {
      name: `E2E personal ${Date.now()}`,
      scope: "PERSONAL",
      settings: { student: { camera: "JOIN_ON" } },
    });
    expect(personal.status()).toBe(201);
    const personalId = (await personal.json()).id;

    const coachOrg = await api(request, "POST", "/live-class-presets", coach, {
      name: "E2E org attempt",
      scope: "ORG",
      settings: {},
    });
    expect(coachOrg.status()).toBe(403);

    const adminOrg = await api(request, "POST", "/live-class-presets", admin, {
      name: `E2E org ${Date.now()}`,
      scope: "ORG",
      settings: { student: { screenShare: "ALLOWED" } },
    });
    expect(adminOrg.status()).toBe(201);
    const orgId = (await adminOrg.json()).id;

    // The coach can see the org preset in their list.
    const list = await (await api(request, "GET", "/live-class-presets", coach)).json();
    const ids = list.presets.map((p: { id: string }) => p.id);
    expect(ids).toContain(orgId);
    expect(ids).toContain(personalId);

    // Cleanup.
    await api(request, "DELETE", `/live-class-presets/${personalId}`, coach);
    await api(request, "DELETE", `/live-class-presets/${orgId}`, admin);
  });

  test("batch → class inheritance and the pre-join settings preview", async ({ request }) => {
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);
    const coach = await loginAs(request, COACH.email, COACH.password);

    const batches = await (await api(request, "GET", "/coach/batches", coach)).json();
    const batchId = seededBatchId(batches);

    // Admin sets a batch default; the coach may read it but not write it.
    const coachBatchWrite = await api(
      request,
      "PUT",
      `/live-class-settings/batch/${batchId}`,
      coach,
      { liveClassSettings: { student: { screenShare: "ALLOWED" } } },
    );
    expect(coachBatchWrite.status()).toBe(403);

    const adminBatchWrite = await api(
      request,
      "PUT",
      `/live-class-settings/batch/${batchId}`,
      admin,
      { liveClassSettings: { student: { screenShare: "ALLOWED" } } },
    );
    expect(adminBatchWrite.status()).toBe(200);

    // New class in that batch inherits the batch default until overridden.
    await clearCoachSchedule(request, coach);
    const now = Date.now();
    const classId = await scheduleClass(
      (method, path, body) => api(request, method, path, coach, body),
      (method, path, body) => api(request, method, path, admin, body),
      {
        batchId,
        topic: "E2E pre-class settings",
        startsAt: new Date(now + 5 * 60_000).toISOString(),
        endsAt: new Date(now + 65 * 60_000).toISOString(),
      },
    );
    const classWrite = await api(request, "PUT", `/live-class-settings/class/${classId}`, coach, {
      liveClassSettings: { student: { mic: "FORCED_OFF" } },
    });
    expect(classWrite.status(), `class settings: ${await classWrite.text()}`).toBe(200);

    const forClass = await (
      await api(request, "GET", `/live-class-settings/class/${classId}`, coach)
    ).json();
    expect(forClass.resolved.student.screenShare).toBe("ALLOWED"); // from batch
    expect(forClass.resolved.student.mic).toBe("FORCED_OFF"); // from class override
    expect(forClass.classOverride.student.mic).toBe("FORCED_OFF");

    // The student-visible class fetch carries the resolved preview.
    const student = await loginAs(request, STUDENT.email, STUDENT.password);
    const liveClass = await (await api(request, "GET", `/live-class/${classId}`, student)).json();
    expect(liveClass.preClassSettings.student.mic).toBe("FORCED_OFF");

    // Reset the batch default so the run is idempotent.
    await api(request, "PUT", `/live-class-settings/batch/${batchId}`, admin, {
      liveClassSettings: null,
    });
  });

  test("audit log: admin only, records the change", async ({ request }) => {
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);
    const student = await loginAs(request, STUDENT.email, STUDENT.password);

    expect((await api(request, "GET", "/live-class-settings/audit", student)).status()).toBe(403);

    await api(request, "PUT", "/live-class-settings/policy", admin, {
      settings: { student: { chat: "ENABLED" } },
    });

    const audit = await (await api(request, "GET", "/live-class-settings/audit", admin)).json();
    expect(Array.isArray(audit.entries)).toBe(true);
    expect(audit.entries.length).toBeGreaterThan(0);
    expect(audit.entries[0].scope).toBeTruthy();
  });
});

test.describe("Pre-class settings — admin UI", () => {
  test("the admin live-class settings page renders its sections", async ({ page }) => {
    // API login backs off on the 5/min throttle the earlier tests use up.
    await loginContext(page.context(), "admin");
    await page.goto("/admin/live-class");
    await expect(page.getByRole("heading", { name: /Live class settings/i })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Platform defaults", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Organisation presets", exact: true })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /Recent changes/i })).toBeVisible();
  });
});
