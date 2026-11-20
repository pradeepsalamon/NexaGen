import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { api, login, openRoomTab, scheduleClass, seededBatchId, type Cookie } from "./fixtures";

/**
 * Move annotations in a live class (docs/FEATURES.md "Annotations"): the coach
 * marks moves with glyphs and a comment from the Moves tab, and the student
 * sees them in their own move list and as a badge on the board.
 *
 * Opt-in, like live-board-sync (two real participants over LiveKit):
 *   RUN_LIVE_BOARD_E2E=1 npx playwright test move-annotations
 * Moves are played by clicking squares, so no `NEXT_PUBLIC_E2E` harness is needed.
 * Screenshots of both boards land in test-results/move-annotations/.
 */

const RUN = process.env.RUN_LIVE_BOARD_E2E === "1";
const SHOTS = "test-results/move-annotations";

async function joinMeeting(context: BrowserContext, classId: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/live-class/${classId}`);
  await page.getByRole("button", { name: /join room/i }).click({ timeout: 30_000 });
  await expect(page.getByRole("toolbar", { name: /class controls/i })).toBeVisible({ timeout: 30_000 });
  return page;
}

/** The room's main board (the largest one on the page). */
async function mainBoard(page: Page): Promise<Locator> {
  const boards = page.locator("cg-board");
  await expect(boards.first()).toBeVisible({ timeout: 20_000 });
  let best = boards.first();
  let bestWidth = 0;
  for (let i = 0; i < (await boards.count()); i += 1) {
    const box = await boards.nth(i).boundingBox();
    if (box && box.width > bestWidth) {
      bestWidth = box.width;
      best = boards.nth(i);
    }
  }
  return best;
}

/** Click-click a move on a White-oriented board. */
async function play(page: Page, from: string, to: string) {
  const board = await mainBoard(page);
  const box = await board.boundingBox();
  if (!box) throw new Error("board has no box");
  const at = (square: string) => {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    return { x: box.x + ((file + 0.5) * box.width) / 8, y: box.y + ((8 - rank + 0.5) * box.height) / 8 };
  };
  const a = at(from);
  const b = at(to);
  await page.mouse.click(a.x, a.y);
  await page.mouse.click(b.x, b.y);
}

const moveButton = (page: Page, name: RegExp) => page.getByRole("button", { name }).first();

test.describe("Move annotations", () => {
  test.skip(!RUN, "opt-in: RUN_LIVE_BOARD_E2E=1 + LiveKit");

  let classId = "";
  let coachCookies: Cookie[] = [];

  test.afterAll(async ({ playwright }) => {
    if (!classId) return;
    const request = await playwright.request.newContext();
    await api(request, "POST", `/live-class/${classId}/end`, coachCookies).catch(() => {});
    await request.dispose();
  });

  test("coach annotates moves; the student sees glyphs, comment and board badge", async ({ browser, playwright }) => {
    test.setTimeout(240_000);
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
        topic: "E2E Move Annotations",
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 3_660_000).toISOString(),
      },
    );
    const started = await api(request, "POST", `/live-class/${classId}/start`, coachCookies);
    expect(started.ok(), `start: ${await started.text()}`).toBeTruthy();

    const coachCtx = await browser.newContext();
    await coachCtx.addCookies(coachCookies);
    const studentCtx = await browser.newContext();
    await studentCtx.addCookies(studentCookies);

    const coachPage = await joinMeeting(coachCtx, classId);
    const studentPage = await joinMeeting(studentCtx, classId);
    // Classes open on the Gallery stage; the board is its own stage tab.
    await openRoomTab(coachPage, /^Board$/);
    await openRoomTab(studentPage, /^Board$/).catch(() => undefined);

    // ── coach plays 1.e4 e5 2.Nf3 ─────────────────────────────
    await openRoomTab(coachPage, /^Moves/);
    await play(coachPage, "e2", "e4");
    await expect(moveButton(coachPage, /^1\. e4/)).toBeVisible();
    await play(coachPage, "e7", "e5");
    await expect(moveButton(coachPage, /^1\.\.\. e5/)).toBeVisible();
    await play(coachPage, "g1", "f3");
    await expect(moveButton(coachPage, /^2\. Nf3/)).toBeVisible();

    // ── Annotate the move on the board: !!, ±, a comment ─────
    await coachPage.getByRole("button", { name: "Annotate", exact: true }).click();
    const panel = coachPage.getByRole("dialog").filter({ hasText: "Annotate" });
    await expect(panel.getByText("Annotate")).toBeVisible();
    await panel.getByRole("button", { name: "Brilliant move" }).click();
    await panel.getByRole("button", { name: "White is better" }).click();
    await expect(panel.getByRole("button", { name: "Brilliant move" })).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("list", { name: "Chosen glyphs" })).toContainText("An excellent move that is hard to find.");
    await panel.getByRole("textbox", { name: "Move comment" }).fill("Develops and attacks e5.");
    await panel.getByRole("button", { name: "Save comment" }).click();
    await expect(panel).toBeHidden();

    await expect(moveButton(coachPage, /^2\. Nf3, Brilliant move, White is better/)).toBeVisible();
    await expect(coachPage.getByText("Develops and attacks e5.")).toBeVisible();
    const coachBadge = coachPage.locator("cg-container svg text", { hasText: "!!" });
    await expect(coachBadge).toHaveCount(1);
    await (await mainBoard(coachPage)).screenshot({ path: `${SHOTS}/coach-board.png` });

    // ── one glyph per group: ? replaces !! ───────────────────
    await coachPage.getByRole("button", { name: "Edit annotation", exact: true }).click();
    await panel.getByRole("button", { name: "Mistake", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Brilliant move" })).toHaveAttribute("aria-pressed", "false");
    await coachPage.keyboard.press("Escape");
    await expect(moveButton(coachPage, /^2\. Nf3, Mistake, White is better/)).toBeVisible();

    // ── right-click an earlier move opens Annotate for it ────
    await moveButton(coachPage, /^1\.\.\. e5/).click({ button: "right" });
    await expect(panel.getByText(/Annotate\s*e5/)).toBeVisible();
    await panel.getByRole("button", { name: "Dubious move" }).click();
    await coachPage.keyboard.press("Escape");
    await expect(moveButton(coachPage, /^1\.\.\. e5, Dubious move/)).toBeVisible();
    // The board followed the right-click: the badge is now e5's "?!".
    await expect(coachPage.locator("cg-container svg text", { hasText: "?!" })).toHaveCount(1);
    await moveButton(coachPage, /^2\. Nf3/).click();

    // ── the student sees it all, read-only ───────────────────
    await openRoomTab(studentPage, /^Moves/);
    await expect(moveButton(studentPage, /^2\. Nf3, Mistake, White is better/)).toBeVisible({ timeout: 15_000 });
    await expect(moveButton(studentPage, /^1\.\.\. e5, Dubious move/)).toBeVisible();
    await expect(studentPage.getByText("Develops and attacks e5.")).toBeVisible();
    await expect(studentPage.locator("cg-container svg text", { hasText: /^\?$/ })).toHaveCount(1);
    await expect(studentPage.getByRole("button", { name: /^(Annotate|Edit annotation)$/ })).toHaveCount(0);
    await moveButton(studentPage, /^2\. Nf3/).click({ button: "right" });
    await expect(studentPage.getByRole("dialog")).toHaveCount(0);
    await (await mainBoard(studentPage)).screenshot({ path: `${SHOTS}/student-board.png` });
    await studentPage.screenshot({ path: `${SHOTS}/student-page.png` });
    await coachPage.screenshot({ path: `${SHOTS}/coach-page.png` });

    await request.dispose();
  });
});
