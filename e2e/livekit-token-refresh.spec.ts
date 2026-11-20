import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { api, login, openRoomTab, scheduleClass, seededBatchId, type Cookie } from "./fixtures";

/**
 * LiveKit access tokens last 10 minutes (`LIVEKIT_TOKEN_TTL`, livekit.service.ts).
 * A client that stays connected must get a fresh token from LiveKit's own refresh
 * (the server pushes one before expiry) and not be dropped. This keeps a coach
 * and a student in one class for longer than the TTL and fails if either loses
 * the room.
 *
 * Opt-in, slow (about 12 minutes), needs LiveKit and a seeded database:
 *   RUN_TOKEN_REFRESH_E2E=1 npx playwright test livekit-token-refresh
 */
const RUN = process.env.RUN_TOKEN_REFRESH_E2E === "1";
const HOLD_MS = 11.5 * 60_000;
const CHECK_EVERY_MS = 30_000;

async function joinMeeting(context: BrowserContext, classId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/live-class/${classId}`);
  await page.getByRole("button", { name: /join room/i }).click({ timeout: 30_000 });
  await expect(page.getByRole("toolbar", { name: /class controls/i })).toBeVisible({ timeout: 30_000 });
  return page;
}

test.describe("LiveKit token refresh", () => {
  test.skip(!RUN, "opt-in: RUN_TOKEN_REFRESH_E2E=1 (12 minutes, needs LiveKit)");
  test.setTimeout(HOLD_MS + 5 * 60_000);

  let classId = "";
  let coachCookies: Cookie[] = [];

  test.afterAll(async ({ playwright }) => {
    if (!classId) return;
    const request = await playwright.request.newContext();
    await api(request, "POST", `/live-class/${classId}/end`, coachCookies).catch(() => {});
    await request.dispose();
  });

  test("coach and student stay connected past the 10-minute token", async ({ browser, playwright }) => {
    const request = await playwright.request.newContext();
    coachCookies = await login(request, "coach");
    const studentCookies = await login(request, "student");
    const adminCookies = await login(request, "admin");

    const batchId = seededBatchId(await (await api(request, "GET", "/coach/batches", coachCookies)).json());
    const now = Date.now();
    classId = await scheduleClass(
      (method, path, body) => api(request, method, path, coachCookies, body),
      (method, path, body) => api(request, method, path, adminCookies, body),
      {
        batchId,
        topic: "E2E Token Refresh",
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 3_660_000).toISOString()
      }
    );
    const startRes = await api(request, "POST", `/live-class/${classId}/start`, coachCookies);
    expect(startRes.ok(), `start: ${await startRes.text()}`).toBeTruthy();

    const coachCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
    await coachCtx.addCookies(coachCookies);
    const studentCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
    await studentCtx.addCookies(studentCookies);

    const coach = await joinMeeting(coachCtx, classId);
    const student = await joinMeeting(studentCtx, classId);

    const problems: string[] = [];
    for (const [who, page] of [["coach", coach], ["student", student]] as const) {
      page.on("console", (m) => {
        if (/disconnect|token.*(expired|invalid)|unauthor/i.test(m.text())) problems.push(`${who}: ${m.text().slice(0, 160)}`);
      });
    }

    // The coach sees the student in the room before the wait, and again after it.
    await openRoomTab(coach, /^People/);
    await expect(coach.getByRole("button", { name: /^Actions for / }).first()).toBeVisible({ timeout: 30_000 });

    const started = Date.now();
    while (Date.now() - started < HOLD_MS) {
      await coach.waitForTimeout(CHECK_EVERY_MS);
      for (const [who, page] of [["coach", coach], ["student", student]] as const) {
        const minutes = ((Date.now() - started) / 60_000).toFixed(1);
        await expect(
          page.getByRole("toolbar", { name: /class controls/i }),
          `${who} lost the room after ${minutes} min (console: ${problems.join(" | ") || "nothing"})`
        ).toBeVisible({ timeout: 5_000 });
      }
    }

    // Still really connected, not just showing a stale toolbar: the student is still listed for the coach.
    await expect(coach.getByRole("button", { name: /^Actions for / }).first()).toBeVisible({ timeout: 15_000 });
    expect(problems, "disconnect or token errors in the browser console").toEqual([]);
  });
});
