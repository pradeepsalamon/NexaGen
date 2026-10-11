import { test, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Durable board recovery (`LiveSession.boardState`, `useBoardPersistence`).
 *
 * Opt-in, same infrastructure as live-board-sync:
 *   api + web running (web with NEXT_PUBLIC_E2E=1), LiveKit reachable,
 *   RUN_LIVE_BOARD_E2E=1 npx playwright test live-board-recovery
 */

const RUN = process.env.RUN_LIVE_BOARD_E2E === "1";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };
const COACH = { email: "coach@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };

const START_PLACEMENT = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

type Cookie = { name: string; value: string; domain: string; path: string; httpOnly: boolean };

declare global {
  interface Window {
    __nexaBoard?: { move: (from: string, to: string) => boolean; fen: () => string };
    __seenFens?: string[];
  }
}

async function login(request: APIRequestContext, email: string, password: string): Promise<Cookie[]> {
  let res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  for (let attempt = 0; res.status() === 429 && attempt < 6; attempt += 1) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  }
  expect(res.ok(), `login ${email}: ${await res.text()}`).toBeTruthy();
  return (res.headers()["set-cookie"] || "")
    .split("\n")
    .flatMap((line) => line.split(/,(?=\s*nexa_)/))
    .map((c) => c.trim().split(";")[0])
    .filter((c) => c.startsWith("nexa_"))
    .map((c) => {
      const [name, ...v] = c.split("=");
      return { name, value: v.join("="), domain: "localhost", path: "/", httpOnly: true };
    });
}

function api(request: APIRequestContext, method: string, path: string, cookies: Cookie[], body?: object) {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      Origin: "http://localhost:3000",
    },
    data: body,
  });
}

/** Coaches can't create classes: request an extra class and have the admin approve it. */
async function makeLiveClass(request: APIRequestContext, coach: Cookie[], admin: Cookie[]) {
  const batches = await (await api(request, "GET", "/coach/batches", coach)).json();
  const batchId = (batches.batches || batches)[0].id;

  // Walk forward from now until approval stops reporting a scheduling conflict.
  // Only inside the start window (CLASS_EARLY_START_MINUTES = 30): a class any
  // further out can't be started yet.
  for (let offsetMin = 1; offsetMin < 30; offsetMin += 7) {
    const startsAt = new Date(Date.now() + offsetMin * 60_000);
    const created = await api(request, "POST", "/class-requests", coach, {
      type: "EXTRA_CLASS",
      batchId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      topic: "E2E Board Recovery",
      reason: "e2e board recovery spec",
    });
    expect(created.ok(), `request: ${await created.text()}`).toBeTruthy();
    const { request: req } = await created.json();

    const approved = await api(request, "POST", `/class-requests/${req.id}/approve`, admin, {});
    if (approved.ok()) {
      const classId = (await approved.json()).request.classId as string;
      const start = await api(request, "POST", `/live-class/${classId}/start`, coach);
      expect(start.ok(), `start: ${await start.text()}`).toBeTruthy();
      return classId;
    }
    await api(request, "POST", `/class-requests/${req.id}/withdraw`, coach);
    if (approved.status() !== 409) throw new Error(`approve: ${approved.status()} ${await approved.text()}`);
  }
  throw new Error("no free slot for the coach");
}

async function enterRoom(page: Page) {
  const join = page.getByRole("button", { name: /join room/i });
  const toolbar = page.getByRole("toolbar", { name: /meeting controls/i });
  await expect(join.or(toolbar)).toBeVisible({ timeout: 45_000 });
  if (await join.isVisible()) await join.click();
  await expect(toolbar).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => !!window.__nexaBoard, null, { timeout: 30_000 });
}

async function joinMeeting(context: BrowserContext, classId: string) {
  const page = await context.newPage();
  await page.goto(`/live-class/${classId}`);
  await enterRoom(page);
  return page;
}

const fen = (page: Page) => page.evaluate(() => window.__nexaBoard!.fen());
const move = (page: Page, from: string, to: string) =>
  page.evaluate(([f, t]) => window.__nexaBoard!.move(f, t), [from, to] as const);

/** Records every FEN the student's board passes through, so a transient reset is caught. */
async function watchFens(page: Page) {
  await page.evaluate(() => {
    window.__seenFens = [];
    setInterval(() => {
      const f = window.__nexaBoard?.fen();
      const seen = window.__seenFens!;
      if (f && seen[seen.length - 1] !== f) seen.push(f);
    }, 50);
  });
}
const seenFens = (page: Page) => page.evaluate(() => window.__seenFens ?? []);
const placement = (f: string) => f.split(" ")[0];

test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

test.describe("Live board recovery", () => {
  test.skip(!RUN, "opt-in: RUN_LIVE_BOARD_E2E=1 + LiveKit + NEXT_PUBLIC_E2E=1 web");
  test.setTimeout(240_000);

  let classId = "";
  let coachCookies: Cookie[] = [];

  test.afterAll(async ({ playwright }) => {
    if (!classId) return;
    const request = await playwright.request.newContext();
    await api(request, "POST", `/live-class/${classId}/end`, coachCookies).catch(() => {});
    await request.dispose();
  });

  test("coach refresh restores the board and never resets the students", async ({ browser, playwright }) => {
    const request = await playwright.request.newContext();
    const adminCookies = await login(request, ADMIN.email, ADMIN.password);
    coachCookies = await login(request, COACH.email, COACH.password);
    const studentCookies = await login(request, STUDENT.email, STUDENT.password);
    classId = await makeLiveClass(request, coachCookies, adminCookies);

    const coachCtx = await browser.newContext();
    await coachCtx.addCookies(coachCookies);
    const studentCtx = await browser.newContext();
    await studentCtx.addCookies(studentCookies);

    const coachPage = await joinMeeting(coachCtx, classId);
    const studentPage = await joinMeeting(studentCtx, classId);

    // ── a few moves, synced to the student ────────────────────
    expect(await move(coachPage, "e2", "e4")).toBe(true);
    expect(await move(coachPage, "e7", "e5")).toBe(true);
    expect(await move(coachPage, "g1", "f3")).toBe(true);
    const afterNf3 = await fen(coachPage);
    await expect.poll(() => fen(studentPage), { timeout: 15_000 }).toBe(afterNf3);

    // ── the throttled save lands on the server ────────────────
    await expect
      .poll(
        async () => {
          const res = await api(request, "GET", `/live-class/${classId}/board-state`, coachCookies);
          return res.ok() ? (await res.json()).state?.fen : `HTTP ${res.status()}`;
        },
        { timeout: 10_000 },
      )
      .toBe(afterNf3);

    // ── 1. coach refresh after the save ───────────────────────
    await watchFens(studentPage);
    await coachPage.reload();
    await enterRoom(coachPage);
    await expect.poll(() => fen(coachPage), { timeout: 15_000 }).toBe(afterNf3);
    await studentPage.waitForTimeout(3_000);
    expect(await fen(studentPage)).toBe(afterNf3);
    expect((await seenFens(studentPage)).map(placement)).not.toContain(START_PLACEMENT);

    // the refreshed coach is still the authority
    expect(await move(coachPage, "b8", "c6")).toBe(true);
    const afterNc6 = await fen(coachPage);
    await expect.poll(() => fen(studentPage), { timeout: 15_000 }).toBe(afterNc6);

    // ── 2. coach refresh straight after a move (pagehide flush) ─
    expect(await move(coachPage, "f1", "b5")).toBe(true);
    const afterBb5 = await fen(coachPage);
    await coachPage.reload();
    await enterRoom(coachPage);
    await expect.poll(() => fen(coachPage), { timeout: 15_000 }).toBe(afterBb5);
    await studentPage.waitForTimeout(3_000);
    expect(await fen(studentPage)).toBe(afterBb5);
    expect((await seenFens(studentPage)).map(placement)).not.toContain(START_PLACEMENT);

    // ── 3. student refresh ────────────────────────────────────
    await studentPage.reload();
    await enterRoom(studentPage);
    await expect.poll(() => fen(studentPage), { timeout: 15_000 }).toBe(afterBb5);

    // ── 4. coach alone: only the server snapshot can restore it ─
    await studentCtx.close();
    expect(await move(coachPage, "a7", "a6")).toBe(true);
    const afterA6 = await fen(coachPage);
    await coachPage.reload();
    await enterRoom(coachPage);
    await expect.poll(() => fen(coachPage), { timeout: 15_000 }).toBe(afterA6);

    await request.dispose();
  });
});
