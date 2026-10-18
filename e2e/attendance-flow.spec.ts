import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { scheduleClass, seededBatchId, sendLiveKitWebhook } from "./fixtures";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WEB_URL = process.env.WEB_URL || "http://localhost:3000";

const COACH = { email: "coach@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };
const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };

// ─── Helper: Login via API and return cookies ────────────────────────────────

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  // /auth/login is throttled 5/60s. A full suite run does far more than 5
  // logins/min, so back off and retry on 429 instead of failing the test.
  let res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  for (let attempt = 0; res.status() === 429 && attempt < 6; attempt++) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  }
  expect(res.ok(), `Login failed for ${email}: ${await res.text()}`).toBeTruthy();

  const setCookies = res.headers()["set-cookie"] || "";
  const cookies = setCookies
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .filter((c) => c.includes("nexa_"))
    .join("; ");
  return cookies;
}

// ─── Helper: Make authenticated API call ─────────────────────────────────────

async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: string,
  body?: Record<string, unknown>
) {
  const res = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookies },
    data: body,
  });
  return res;
}

const E2E_CLASS_TOPIC = "E2E Test Class - Pawn Structures";

// ─── Helper: end/cancel any leftover E2E classes for the coach ───────────────
// A prior run that failed between "start" and "end" leaves a class stuck LIVE.
// Those rows keep matching the coach's time-overlap conflict check, so a later
// run's class approval 409s. Sweep them before/after every full-flow run.
async function cleanupLeftoverE2EClasses(
  request: APIRequestContext,
  coachCookies: string
): Promise<void> {
  const res = await api(request, "GET", "/coach/classes/upcoming", coachCookies);
  if (!res.ok()) return;
  const data = await res.json();
  const classes: Array<{ id: string; topic?: string; status?: string }> =
    Array.isArray(data?.classes) ? data.classes : Array.isArray(data) ? data : [];
  for (const cls of classes) {
    if (cls.topic !== E2E_CLASS_TOPIC) continue;
    if (cls.status === "LIVE") {
      await api(request, "POST", `/live-class/${cls.id}/end`, coachCookies);
    } else {
      await api(request, "PATCH", `/coach/classes/${cls.id}/cancel`, coachCookies);
    }
  }
}
// ─── Helper: Send LiveKit webhook event ──────────────────────────────────────

/**
 * Signed LiveKit webhook delivery. Shared with the recording suite so both send
 * the same base64 digest over the same raw bytes the API verifies.
 */
async function sendWebhook(
  request: APIRequestContext,
  event: Record<string, unknown>
) {
  return sendLiveKitWebhook(request, event);
}

// ─── Helper: Build webhook event ─────────────────────────────────────────────

function livekitEvent(
  eventType: string,
  roomName: string,
  participantIdentity: string,
  extra?: Record<string, unknown>
) {
  return {
    event: eventType,
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    room: { name: roomName },
    participant: {
      identity: participantIdentity,
      ...extra,
    },
    timestamp: Math.floor(Date.now() / 1000),
  };
}

// ─── Helper: Login via browser UI ────────────────────────────────────────────

async function loginViaUI(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    await page.getByLabel(/email/i).fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: /sign in|log in|login/i }).click();

    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), {
        timeout: 15_000,
      });
      return;
    } catch {
      // /auth/login is throttled 5/60s; on a busy suite run the redirect
      // never happens because login 429s. Wait out the window and retry.
      await page.waitForTimeout(12_000);
    }
  }
  throw new Error(`loginViaUI: still on /login after retries for ${email}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Full Attendance Flow
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Full Attendance Flow", () => {
  let classId: string;
  let roomName: string;

  test.beforeAll(async () => {
    const ctx = await playwrightRequest.newContext();
    try {
      const coachCookies = await loginAs(ctx, COACH.email, COACH.password);
      await cleanupLeftoverE2EClasses(ctx, coachCookies);
    } finally {
      await ctx.dispose();
    }
  });

  test.afterAll(async () => {
    const ctx = await playwrightRequest.newContext();
    try {
      const coachCookies = await loginAs(ctx, COACH.email, COACH.password);
      if (classId) {
        // best-effort: end it if the test bailed before Step 12
        await api(ctx, "POST", `/live-class/${classId}/end`, coachCookies);
      }
      await cleanupLeftoverE2EClasses(ctx, coachCookies);
    } finally {
      await ctx.dispose();
    }
  });

  test("complete flow: create class → start → student joins → end → verify", async ({
    request,
    browser,
  }) => {
    // ─────────────────────────────────────────────────────────────────────────
    // Step 1: Login as Coach via API
    // ─────────────────────────────────────────────────────────────────────────
    const coachCookies = await loginAs(request, COACH.email, COACH.password);
    expect(coachCookies).toBeTruthy();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2: Get the seeded batch ID for this coach
    // ─────────────────────────────────────────────────────────────────────────
    const batchesRes = await api(request, "GET", "/coach/batches", coachCookies);
    expect(batchesRes.ok()).toBeTruthy();
    const batchId = seededBatchId(await batchesRes.json());

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Schedule a class (coach requests, admin approves). It must start
    // within the early-start window so Step 4 can start it.
    // ─────────────────────────────────────────────────────────────────────────
    const adminCookies = await loginAs(request, ADMIN.email, ADMIN.password);
    const now = Date.now();
    classId = await scheduleClass(
      (method, path, body) => api(request, method, path, coachCookies, body),
      (method, path, body) => api(request, method, path, adminCookies, body),
      {
        batchId,
        topic: E2E_CLASS_TOPIC,
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 3_660_000).toISOString(),
      }
    );
    roomName = `class_${classId}`;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 4: Start the live class
    // ─────────────────────────────────────────────────────────────────────────
    const startRes = await api(
      request,
      "POST",
      `/live-class/${classId}/start`,
      coachCookies
    );
    expect(startRes.ok(), `Start class failed: ${await startRes.text()}`).toBeTruthy();
    const startData = await startRes.json();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 5: Simulate Coach joining via webhook
    // ─────────────────────────────────────────────────────────────────────────
    // Get the coach user ID from the auth/me endpoint
    const meRes = await api(request, "GET", "/auth/me", coachCookies);
    const meData = await meRes.json();
    const coachId = meData.user.id;

    const coachJoinRes = await sendWebhook(
      request,
      livekitEvent("participant_joined", roomName, coachId)
    );
    expect(coachJoinRes.ok()).toBeTruthy();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 6: Login as Student
    // ─────────────────────────────────────────────────────────────────────────
    const studentCookies = await loginAs(
      request,
      STUDENT.email,
      STUDENT.password
    );
    expect(studentCookies).toBeTruthy();

    // Get student user ID
    const studentMeRes = await api(request, "GET", "/auth/me", studentCookies);
    const studentMeData = await studentMeRes.json();
    const studentId = studentMeData.user.id;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Student requests a LiveKit token.
    // ─────────────────────────────────────────────────────────────────────────
    // This flow simulates every join over signed webhooks — there is no real
    // LiveKit room — so `getToken` sees no live participants and correctly
    // withholds the token with a structured `COACH_NOT_JOINED` (the coach is
    // "present" only in the webhook-driven attendance tables, not on the SFU).
    // Assert the endpoint responds sanely either way; attendance itself is
    // driven by the webhooks below, not by this call.
    const tokenRes = await api(
      request,
      "POST",
      `/live-class/${classId}/token`,
      studentCookies
    );
    if (!tokenRes.ok()) {
      const body = await tokenRes.json().catch(() => ({}));
      expect(
        body?.code,
        `Unexpected token failure: ${JSON.stringify(body)}`
      ).toBe("COACH_NOT_JOINED");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 8: Simulate student joining via webhook
    // ─────────────────────────────────────────────────────────────────────────
    const studentJoinRes = await sendWebhook(
      request,
      livekitEvent("participant_joined", roomName, studentId)
    );
    expect(studentJoinRes.ok()).toBeTruthy();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 9: Wait some time (simulate class duration ~5 seconds)
    // ─────────────────────────────────────────────────────────────────────────
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // ─────────────────────────────────────────────────────────────────────────
    // Step 10: Simulate student disconnect + reconnect
    // ─────────────────────────────────────────────────────────────────────────
    await sendWebhook(
      request,
      livekitEvent("participant_left", roomName, studentId, {
        disconnectReason: "1",
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await sendWebhook(
      request,
      livekitEvent("participant_joined", roomName, studentId)
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // ─────────────────────────────────────────────────────────────────────────
    // Step 11: Simulate student leaving
    // ─────────────────────────────────────────────────────────────────────────
    await sendWebhook(
      request,
      livekitEvent("participant_left", roomName, studentId, {
        disconnectReason: "1",
      })
    );

    // ─────────────────────────────────────────────────────────────────────────
    // Step 12: End the class as coach
    // ─────────────────────────────────────────────────────────────────────────
    const endRes = await api(
      request,
      "POST",
      `/live-class/${classId}/end`,
      coachCookies
    );
    expect(endRes.ok(), `End class failed: ${await endRes.text()}`).toBeTruthy();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 13: Verify attendance was recorded via API
    // ─────────────────────────────────────────────────────────────────────────
    const classAttRes = await api(
      request,
      "GET",
      `/attendance/class/${classId}`,
      coachCookies
    );
    expect(classAttRes.ok()).toBeTruthy();
    const classAttData = await classAttRes.json();
    expect(classAttData).toBeTruthy();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 14: Verify Coach Attendance Page via Browser
    // ─────────────────────────────────────────────────────────────────────────
    const coachCtx = await browser.newContext();
    const coachPage = await coachCtx.newPage();
    // Set auth cookies
    for (const cookieStr of coachCookies.split("; ")) {
      const [name, value] = cookieStr.split("=");
      await coachCtx.addCookies([
        {
          name,
          value,
          domain: "localhost",
          path: "/",
          httpOnly: true,
        },
      ]);
    }

    await coachPage.goto("/coach/attendance");
    await coachPage.waitForLoadState("networkidle");

    // Verify the page loaded
    await expect(coachPage.getByText(/teaching attendance/i)).toBeVisible();

    // Check stat cards exist
    await expect(coachPage.getByText(/total teaching hours/i)).toBeVisible();
    await expect(coachPage.getByText(/classes completed/i)).toBeVisible();

    // Check the table has our class (the shared dev DB carries many rows with
    // this topic from earlier runs, so match the first).
    await expect(coachPage.getByText(E2E_CLASS_TOPIC).first()).toBeVisible({ timeout: 10000 });
    await coachCtx.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 15: Verify Student Attendance Page via Browser
    // ─────────────────────────────────────────────────────────────────────────
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    for (const cookieStr of studentCookies.split("; ")) {
      const [name, value] = cookieStr.split("=");
      await studentCtx.addCookies([
        {
          name,
          value,
          domain: "localhost",
          path: "/",
          httpOnly: true,
        },
      ]);
    }

    await studentPage.goto("/student/attendance");
    await studentPage.waitForLoadState("networkidle");

    await expect(
      studentPage.getByRole("heading", { level: 1, name: "Attendance", exact: true })
    ).toBeVisible();

    // Check stat cards
    await expect(studentPage.getByText(/^overall$/i)).toBeVisible();

    // Check the table shows our class
    await expect(studentPage.getByText(E2E_CLASS_TOPIC).first()).toBeVisible({ timeout: 10000 });

    // Click the row to open the session-logs dialog
    const classRow = studentPage.getByText(E2E_CLASS_TOPIC).first();
    await classRow.click();
    // Dialog appears — titled "Session Logs" with a "Connection Timeline" section.
    await expect(
      studentPage.getByRole("dialog").getByText(/session logs|connection timeline/i).first()
    ).toBeVisible({ timeout: 10000 });
    await studentCtx.close();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 16: Verify Admin Dashboard via Browser
    // ─────────────────────────────────────────────────────────────────────────
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    for (const cookieStr of coachCookies.split("; ")) {
      // Re-use superadmin cookies - let's login as admin instead
      break;
    }
    // Login as admin via UI
    await loginViaUI(adminPage, ADMIN.email, ADMIN.password);

    // ─────────────────────────────────────────────────────────────────────────
    // Step 17: Verify Admin Attendance Dashboard
    // ─────────────────────────────────────────────────────────────────────────
    await adminPage.goto("/admin/attendance");
    await adminPage.waitForLoadState("networkidle");

    await expect(adminPage.getByText(/platform attendance/i)).toBeVisible();

    // Check Quick Actions links exist
    await expect(adminPage.getByText(/completed classes/i).first()).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 18: Verify Admin Completed Classes Page
    // ─────────────────────────────────────────────────────────────────────────
    await adminPage.goto("/admin/attendance/completed-classes");
    await adminPage.waitForLoadState("networkidle");

    await expect(adminPage.getByText(/completed classes/i).first()).toBeVisible();

    // Our class should appear
    await expect(adminPage.getByText(E2E_CLASS_TOPIC).first()).toBeVisible({ timeout: 10000 });

    // Open the class detail via the row's "Details" button.
    await adminPage
      .getByRole("row", { name: new RegExp(E2E_CLASS_TOPIC) })
      .first()
      .getByRole("button", { name: /details/i })
      .click();
    await adminPage.waitForURL(/\/admin\/attendance\/completed-classes\/[^/]+$/);
    await adminPage.waitForLoadState("networkidle");

    // The detail page is headed by the class topic.
    await expect(
      adminPage.getByRole("heading", { name: E2E_CLASS_TOPIC }).first()
    ).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 19: Verify Admin Coach Teaching Report
    // ─────────────────────────────────────────────────────────────────────────
    await adminPage.goto("/admin/attendance/coaches");
    await adminPage.waitForLoadState("networkidle");

    await expect(adminPage.getByText(/coach teaching report/i)).toBeVisible();

    // The coach should be listed
    await expect(adminPage.getByText(/testcoach|Test Coach/i)).toBeVisible({ timeout: 10000 });
    await adminCtx.close();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Admin Pages Render Correctly
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Admin Attendance Pages", () => {
  test("admin dashboard renders with quick actions", async ({ page }) => {
    await loginViaUI(page, ADMIN.email, ADMIN.password);

    await page.goto("/admin/attendance");
    await page.waitForLoadState("networkidle");

    // Title
    await expect(page.getByText(/platform attendance/i)).toBeVisible();

    // Stat cards
    await expect(page.getByText(/total active students/i)).toBeVisible();

    // Quick actions
    await expect(page.getByText(/completed classes/i).first()).toBeVisible();
    await expect(page.getByText(/coach teaching report/i).first()).toBeVisible();
  });

  test("completed classes page loads with filters", async ({ page }) => {
    await loginViaUI(page, ADMIN.email, ADMIN.password);

    await page.goto("/admin/attendance/completed-classes");
    await page.waitForLoadState("networkidle");

    // Title
    await expect(page.getByText(/completed classes/i).first()).toBeVisible();

    // Filters
    await expect(page.getByText(/^from$/i)).toBeVisible();
    await expect(page.getByText(/^to$/i)).toBeVisible();
  });

  test("coach teaching report page loads", async ({ page }) => {
    await loginViaUI(page, ADMIN.email, ADMIN.password);

    await page.goto("/admin/attendance/coaches");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/coach teaching report/i)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Coach Attendance Page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Coach Attendance Page", () => {
  test("coach attendance page renders stats and history", async ({ page }) => {
    await loginViaUI(page, COACH.email, COACH.password);

    await page.goto("/coach/attendance");
    await page.waitForLoadState("networkidle");

    // Title
    await expect(page.getByText(/teaching attendance/i)).toBeVisible();

    // Stat cards
    await expect(page.getByText(/total teaching hours/i)).toBeVisible();
    await expect(page.getByText(/classes completed/i)).toBeVisible();
    await expect(page.getByText(/avg session/i)).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Student Attendance Page
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Student Attendance Page", () => {
  test("student attendance page renders stats and history", async ({ page }) => {
    await loginViaUI(page, STUDENT.email, STUDENT.password);

    await page.goto("/student/attendance");
    await page.waitForLoadState("networkidle");

    // Title
    await expect(
      page.getByRole("heading", { level: 1, name: "Attendance", exact: true })
    ).toBeVisible();

    // KPI cards (labels were shortened from the original "Overall Attendance" /
    // "Classes Attended" / "Total Learning Time" copy).
    await expect(page.getByText(/^overall$/i)).toBeVisible();
    await expect(page.getByText(/^attended$/i)).toBeVisible();
    await expect(page.getByText(/^total time$/i)).toBeVisible();

    // Class history section
    await expect(
      page.getByRole("heading", { name: /class history/i })
    ).toBeVisible();
  });
});
