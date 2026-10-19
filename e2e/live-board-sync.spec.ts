import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { api, login, scheduleClass, seededBatchId, type Cookie } from "./fixtures";

/**
 * Shared live-class chessboard sync — two real participants over LiveKit.
 *
 * Opt-in (needs infrastructure the rest of the suite doesn't):
 *   1. LiveKit + Postgres + Redis running:  docker compose up -d livekit postgres redis
 *   2. api + web running:                   npm run dev
 *   3. web run with the board test harness:  NEXT_PUBLIC_E2E=1 (in apps/web/.env.local)
 *   4. enable this spec:                     RUN_LIVE_BOARD_E2E=1 npx playwright test live-board-sync
 *
 * The harness (`window.__nexaBoard`, see features/chessboard/lib/testHarness.ts)
 * drives moves and reads state directly so the test doesn't fight chessground's
 * drag-and-drop.
 */

const RUN = process.env.RUN_LIVE_BOARD_E2E === "1";
const FAKE_MEDIA_ARGS = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
];

interface NexaBoardHarness {
  move: (from: string, to: string, promotion?: string) => boolean;
  fen: () => string;
  turn: () => "white" | "black";
  clock: () => { running: string | null; enabled: boolean };
  permission: () => { mode: string; selectedStudentIds: string[] };
  detach: () => void;
  resync: () => void;
  isDetached: () => boolean;
}
declare global {
  interface Window {
    __nexaBoard?: NexaBoardHarness;
  }
}

/**
 * The shared dev DB carries leftover E2E classes stuck SCHEDULED/LIVE from
 * earlier runs; they overlap "now" and make the class approval 409 on the
 * coach's scheduling-conflict check. Sweep the coach's own upcoming/live ones.
 */
async function clearCoachSchedule(request: APIRequestContext, cookies: Cookie[]) {
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
      if (c.status === "LIVE") await api(request, "POST", `/live-class/${c.id}/end`, cookies).catch(() => {});
      else await api(request, "PATCH", `/coach/classes/${c.id}/cancel`, cookies).catch(() => {});
    }
  }
}

async function joinMeeting(context: BrowserContext, classId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/live-class/${classId}`);
  await page.getByRole("button", { name: /join room/i }).click({ timeout: 30_000 });
  await expect(page.getByRole("toolbar", { name: /meeting controls/i })).toBeVisible({
    timeout: 30_000,
  });
  return page;
}

function board(page: Page) {
  return {
    waitReady: () =>
      page.waitForFunction(() => !!window.__nexaBoard, null, { timeout: 15_000 }),
    move: (from: string, to: string, promotion?: string) =>
      page.evaluate(
        ([f, t, p]) => window.__nexaBoard!.move(f, t, p || undefined),
        [from, to, promotion ?? ""] as const,
      ),
    fen: () => page.evaluate(() => window.__nexaBoard!.fen()),
    permissionMode: () => page.evaluate(() => window.__nexaBoard!.permission().mode),
    clockRunning: () => page.evaluate(() => window.__nexaBoard!.clock().running),
    detach: () => page.evaluate(() => window.__nexaBoard!.detach()),
    resync: () => page.evaluate(() => window.__nexaBoard!.resync()),
  };
}

test.use({ launchOptions: { args: FAKE_MEDIA_ARGS } });

test.describe("Live board sync", () => {
  test.skip(!RUN, "opt-in: RUN_LIVE_BOARD_E2E=1 + LiveKit + NEXT_PUBLIC_E2E=1 web");

  let classId = "";
  let coachCookies: Cookie[] = [];

  test.afterAll(async ({ playwright }) => {
    if (!classId) return;
    const request = await playwright.request.newContext();
    await api(request, "POST", `/live-class/${classId}/end`, coachCookies).catch(() => {});
    await request.dispose();
  });

  test("coach drives, granted student drives back, clock + detach", async ({ browser, playwright }) => {
    const request = await playwright.request.newContext();
    coachCookies = await login(request, "coach");
    const studentCookies = await login(request, "student");

    // ── class setup ────────────────────────────────────────────
    const batchesRes = await api(request, "GET", "/coach/batches", coachCookies);
    const batchesData = await batchesRes.json();
    const batchId = seededBatchId(batchesData);

    await clearCoachSchedule(request, coachCookies);

    const adminCookies = await login(request, "admin");
    const now = Date.now();
    classId = await scheduleClass(
      (method, path, body) => api(request, method, path, coachCookies, body),
      (method, path, body) => api(request, method, path, adminCookies, body),
      {
        batchId,
        topic: "E2E Board Sync",
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 3_660_000).toISOString(),
      },
    );

    const startRes = await api(request, "POST", `/live-class/${classId}/start`, coachCookies);
    expect(startRes.ok(), `start: ${await startRes.text()}`).toBeTruthy();

    const coachCtx = await browser.newContext();
    await coachCtx.addCookies(coachCookies);
    const studentCtx = await browser.newContext();
    await studentCtx.addCookies(studentCookies);

    // ── coach joins and shares the board ───────────────────────
    const coachPage = await joinMeeting(coachCtx, classId);
    await coachPage.getByRole("button", { name: /share board/i }).click();
    const coach = board(coachPage);
    await coach.waitReady();

    // ── student joins; the shared board tile mounts ────────────
    const studentPage = await joinMeeting(studentCtx, classId);
    const student = board(studentPage);
    await student.waitReady();

    // ── coach move propagates to the student ───────────────────
    // chess.js >=1 emits a lazy en-passant field ("-" unless a capture is
    // actually available), so assert on the piece placement: a white pawn
    // reaching e4 is "4P3" on the 4th rank, which only exists post-e4.
    await coach.move("e2", "e4");
    await expect.poll(() => student.fen(), { timeout: 10_000 }).toContain("8/8/4P3/8/PPPP1PPP");

    // ── grant control; the student's move propagates BACK ──────
    await coachPage.getByRole("button", { name: /^participants$/i }).click();
    await coachPage.getByRole("button", { name: /grant board control/i }).first().click();
    await expect.poll(() => student.permissionMode(), { timeout: 10_000 }).toBe("SELECTED_STUDENT");

    await student.move("e7", "e5");
    // both e-pawns advanced: "4p3/4P3" (black e5 over white e4) is unique to this position.
    await expect.poll(() => coach.fen(), { timeout: 10_000 }).toContain("4p3/4P3");

    // ── coach starts a clock; the student sees it running ──────
    await coachPage.getByRole("button", { name: /clock settings/i }).click();
    await coachPage.getByRole("button", { name: /^start$/i }).click();
    await expect.poll(() => student.clockRunning(), { timeout: 10_000 }).not.toBeNull();

    // ── detach: local exploration stays local; resync snaps back
    const coachFen = await coach.fen();
    await student.detach();
    await student.move("g8", "f6");
    await coachPage.waitForTimeout(1_000);
    expect(await coach.fen()).toBe(coachFen);

    await student.resync();
    await expect.poll(() => student.fen(), { timeout: 10_000 }).toBe(coachFen);

    // ── Simulate mid-call drop (Reconnecting -> Connected) ──────
    await studentCtx.setOffline(true);
    await coachPage.waitForTimeout(2000); // Give LiveKit time to notice the drop and enter Reconnecting

    // The coach moves while the student is offline (1.e4 e5: White to move).
    expect(await coach.move("g1", "f3")).toBe(true);
    const whileOfflineFen = await coach.fen();
    expect(whileOfflineFen).not.toBe(coachFen);
    expect(await student.fen()).not.toBe(whileOfflineFen);
    await studentCtx.setOffline(false); // Reconnect

    // Board should re-sync automatically upon LiveKit reconnect (REQUEST_SYNC -> SYNC_STATE)
    await expect.poll(() => student.fen(), { timeout: 15_000 }).toBe(whileOfflineFen);

    await request.dispose();
  });
});
