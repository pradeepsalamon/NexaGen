import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { sendLiveKitWebhook } from "./fixtures";

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
  const res = await request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
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
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  const emailInput = page.getByLabel(/email/i);
  await emailInput.fill(email);

  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.fill(password);

  await page.getByRole("button", { name: /sign in|log in|login/i }).click();

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Full Attendance Flow
// ═══════════════════════════════════════════════════════════════════════════════

test.describe("Full Attendance Flow", () => {
  let classId: string;
  let roomName: string;

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
    const batchesData = await batchesRes.json();
    const batches = batchesData.batches || batchesData;
    expect(batches.length).toBeGreaterThan(0);
    const batchId = batches[0].id;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 3: Create a class via Coach API
    // ─────────────────────────────────────────────────────────────────────────
    const now = new Date();
    const startsAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString(); // 2 min from now
    const endsAt = new Date(now.getTime() + 62 * 60 * 1000).toISOString(); // 62 min from now

    const createRes = await api(request, "POST", "/coach/classes", coachCookies, {
      batchId,
      topic: "E2E Test Class - Pawn Structures",
      title: "E2E Attendance Test",
      description: "Automated test class for attendance flow verification",
      startsAt,
      endsAt,
    });
    expect(createRes.ok(), `Create class failed: ${await createRes.text()}`).toBeTruthy();
    const createdClass = await createRes.json();
    classId = createdClass.id;
    roomName = `class_${classId}`;
    expect(classId).toBeTruthy();

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
    const coachId = meData.id;

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
    const studentId = studentMeData.id;

    // ─────────────────────────────────────────────────────────────────────────
    // Step 7: Get a LiveKit token for the student (triggers auto-attendance)
    // ─────────────────────────────────────────────────────────────────────────
    const tokenRes = await api(
      request,
      "POST",
      `/live-class/${classId}/token`,
      studentCookies
    );
    expect(
      tokenRes.ok(),
      `Token failed: ${await tokenRes.text()}`
    ).toBeTruthy();

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

    // Check the table has our class
    await expect(coachPage.getByText("E2E Test Class - Pawn Structures")).toBeVisible({ timeout: 10000 });
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

    await expect(studentPage.getByText(/attendance/i).first()).toBeVisible();

    // Check stat cards
    await expect(studentPage.getByText(/overall attendance/i)).toBeVisible();

    // Check the table shows our class
    await expect(studentPage.getByText("E2E Test Class - Pawn Structures")).toBeVisible({ timeout: 10000 });

    // Click the row to open the attendance detail dialog
    const classRow = studentPage.getByText("E2E Test Class - Pawn Structures");
    await classRow.click();
    // Dialog should appear with attendance details
    await expect(studentPage.getByText(/event timeline|session details|attendance details/i).first()).toBeVisible({ timeout: 10000 });
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

    await expect(adminPage.getByText(/attendance overview/i)).toBeVisible();

    // Check Quick Actions links exist
    await expect(adminPage.getByText(/completed classes/i).first()).toBeVisible();

    // ─────────────────────────────────────────────────────────────────────────
    // Step 18: Verify Admin Completed Classes Page
    // ─────────────────────────────────────────────────────────────────────────
    await adminPage.goto("/admin/attendance/completed-classes");
    await adminPage.waitForLoadState("networkidle");

    await expect(adminPage.getByText(/completed classes/i).first()).toBeVisible();

    // Our class should appear
    await expect(adminPage.getByText("E2E Test Class - Pawn Structures")).toBeVisible({ timeout: 10000 });

    // Click View to go to class detail
    const viewBtn = adminPage.getByRole("link", { name: /view/i }).first();
    await viewBtn.click();
    await adminPage.waitForLoadState("networkidle");

    // Should see class detail info
    await expect(adminPage.getByText(/class details/i).first()).toBeVisible();
    await expect(adminPage.getByText("E2E Test Class - Pawn Structures")).toBeVisible();

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
    await expect(page.getByText(/attendance overview/i)).toBeVisible();

    // Stat cards
    await expect(page.getByText(/total students/i)).toBeVisible();

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
    await expect(page.getByLabel(/from/i)).toBeVisible();
    await expect(page.getByLabel(/to/i)).toBeVisible();
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
    await expect(page.getByText(/attendance/i).first()).toBeVisible();

    // Stat cards
    await expect(page.getByText(/overall attendance/i)).toBeVisible();
    await expect(page.getByText(/classes attended/i)).toBeVisible();
    await expect(page.getByText(/learning time/i)).toBeVisible();
  });
});
