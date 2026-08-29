import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const WEB_URL = process.env.WEB_URL || "http://localhost:3000";

const COACH = { email: "coach@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };
const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };

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

import crypto from "crypto";

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "APIWLsbggsQnKdN";
const LIVEKIT_API_SECRET =
  process.env.LIVEKIT_API_SECRET || "juXmqj30DR0SRmcF3xfeLp6EilDxrUdtesUgWaNebZJB";

function createWebhookSignature(body: string | Record<string, unknown>): string {
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const sha256 = crypto.createHash("sha256").update(rawBody).digest("hex");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: LIVEKIT_API_KEY,
      sub: LIVEKIT_API_KEY,
      sha256,
      exp: Math.floor(Date.now() / 1000) + 300,
    })
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", LIVEKIT_API_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

async function sendWebhook(
  request: APIRequestContext,
  event: Record<string, unknown>
) {
  const body = JSON.stringify(event);
  const authHeader = createWebhookSignature(body);
  const res = await request.post(`${API_URL}/webhooks/livekit`, {
    data: event,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
  });
  return res;
}

test.describe("Full Recording Lifecycle & Download Flow", () => {
  test("recording start → egress webhook → stop → egress ended → download across roles", async ({
    request,
    browser,
  }) => {
    // 1. Login as Coach
    const coachCookies = await loginAs(request, COACH.email, COACH.password);
    expect(coachCookies).toBeTruthy();

    // 2. Get batch for Coach
    const batchesRes = await api(request, "GET", "/coach/batches", coachCookies);
    expect(batchesRes.ok()).toBeTruthy();
    const batchesData = await batchesRes.json();
    const batches = batchesData.batches || batchesData;
    expect(batches.length).toBeGreaterThan(0);
    const batchId = batches[0].id;

    // 3. Create a class
    const now = new Date();
    const startsAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
    const endsAt = new Date(now.getTime() + 62 * 60 * 1000).toISOString();

    const createRes = await api(request, "POST", "/coach/classes", coachCookies, {
      batchId,
      topic: "Recording E2E Test Class - Endgame Strategy",
      title: "Recording Flow E2E Test",
      description: "Class to test recording start, stop, webhook, and download",
      startsAt,
      endsAt,
    });
    expect(createRes.ok(), `Create class failed: ${await createRes.text()}`).toBeTruthy();
    const createdData = await createRes.json();
    const classId = createdData.class?.id || createdData.id;
    const roomName = `class_${classId}`;
    expect(classId).toBeTruthy();

    // 4. Start Live Class
    const startRes = await api(request, "POST", `/live-class/${classId}/start`, coachCookies);
    expect(startRes.ok(), `Start class failed: ${await startRes.text()}`).toBeTruthy();

    // 5. Send egress_started webhook to simulate active recording
    const egressId = `egress_test_${Date.now()}`;
    const recordingPath = `recordings/${roomName}-${Date.now()}.mp4`;

    const egressStartedRes = await sendWebhook(request, {
      event: "egress_started",
      id: `evt_start_${Date.now()}`,
      egressInfo: {
        egressId,
        roomName,
        status: 1, // EGRESS_ACTIVE
      },
    });
    expect(egressStartedRes.ok()).toBeTruthy();

    // 6. Simulate egress_ended webhook with successful completion
    const egressEndedRes = await sendWebhook(request, {
      event: "egress_ended",
      id: `evt_end_${Date.now()}`,
      egressInfo: {
        egressId,
        roomName,
        status: 3, // EGRESS_COMPLETE
        fileResults: [
          {
            filename: recordingPath,
            location: `https://mock-oci-storage.test/${recordingPath}`,
          },
        ],
      },
    });
    expect(egressEndedRes.ok()).toBeTruthy();

    // 7. End Live Class
    const endRes = await api(request, "POST", `/live-class/${classId}/end`, coachCookies);
    expect(endRes.ok(), `End class failed: ${await endRes.text()}`).toBeTruthy();

    // 8. Verify Coach can fetch download URL
    const coachDownloadRes = await api(
      request,
      "GET",
      `/live-class/${classId}/recording/download`,
      coachCookies
    );
    expect(coachDownloadRes.ok(), `Coach download failed: ${await coachDownloadRes.text()}`).toBeTruthy();
    const coachDownloadData = await coachDownloadRes.json();
    expect(coachDownloadData.url).toBeTruthy();

    // 9. Verify Student in batch can fetch download URL
    const studentCookies = await loginAs(request, STUDENT.email, STUDENT.password);
    expect(studentCookies).toBeTruthy();

    const studentDownloadRes = await api(
      request,
      "GET",
      `/live-class/${classId}/recording/download`,
      studentCookies
    );
    expect(studentDownloadRes.ok(), `Student download failed: ${await studentDownloadRes.text()}`).toBeTruthy();
    const studentDownloadData = await studentDownloadRes.json();
    expect(studentDownloadData.url).toBeTruthy();

    // 10. Verify Super Admin can fetch download URL
    const adminCookies = await loginAs(request, ADMIN.email, ADMIN.password);
    expect(adminCookies).toBeTruthy();

    const adminDownloadRes = await api(
      request,
      "GET",
      `/live-class/${classId}/recording/download`,
      adminCookies
    );
    expect(adminDownloadRes.ok(), `Admin download failed: ${await adminDownloadRes.text()}`).toBeTruthy();
    const adminDownloadData = await adminDownloadRes.json();
    expect(adminDownloadData.url).toBeTruthy();

    // 11. Verify Coach History Page displays class with recording
    const coachCtx = await browser.newContext();
    for (const cookieStr of coachCookies.split("; ")) {
      const [name, value] = cookieStr.split("=");
      await coachCtx.addCookies([
        { name, value, domain: "localhost", path: "/", httpOnly: true },
      ]);
    }
    const coachPage = await coachCtx.newPage();
    await coachPage.goto("/coach/history");
    await coachPage.waitForLoadState("networkidle");

    // The created class should appear in history
    await expect(coachPage.getByText("Recording E2E Test Class - Endgame Strategy")).toBeVisible({ timeout: 10000 });
    // The download button should be rendered for this row
    await expect(coachPage.getByRole("button", { name: /download recording/i }).first()).toBeVisible({ timeout: 10000 });

    await coachCtx.close();
  });
});
