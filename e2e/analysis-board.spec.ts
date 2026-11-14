import { test, expect, type APIRequestContext } from "@playwright/test";
import { api, login, scheduleClass, seededBatchId, type Cookie } from "./fixtures";

/**
 * Board workspace — Engine analysis, Load Game, Setup Position (in place, tap-to-place, illegal positions), Save.
 *
 * Opt-in (needs infrastructure the rest of the suite doesn't):
 *   1. LiveKit + Postgres + Redis running:  docker compose up -d livekit postgres redis
 *   2. api + web running:                   npm run dev
 *   3. web built/run with the board harness: NEXT_PUBLIC_E2E=1 (apps/web/.env.local)
 *   4. Stockfish reachable from the API:     STOCKFISH_PATH set in apps/api/.env
 *   5. enable this spec:                     RUN_ANALYSIS_E2E=1 npx playwright test analysis-board
 */

const RUN = process.env.RUN_ANALYSIS_E2E === "1";
/**
 * Sweep the coach's leftover E2E classes (stuck SCHEDULED/LIVE from earlier
 * runs on the shared dev DB) so the scheduling-conflict check doesn't 409 the
 * class approval below.
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

test.describe("Analysis board", () => {
  test.skip(!RUN, "opt-in: RUN_ANALYSIS_E2E=1 + LiveKit + NEXT_PUBLIC_E2E=1 web + Stockfish");

  let classId = "";
  let coachCookies: Cookie[] = [];

  test.afterAll(async ({ playwright }) => {
    if (!classId) return;
    const request = await playwright.request.newContext();
    await api(request, "POST", `/live-class/${classId}/end`, coachCookies).catch(() => {});
    await request.dispose();
  });

  test("engine analysis, load game, setup position, save", async ({ browser, playwright }) => {
    const request = await playwright.request.newContext();
    coachCookies = await login(request, "coach");

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
        topic: "E2E Analysis Board",
        startsAt: new Date(now + 60_000).toISOString(),
        endsAt: new Date(now + 3_660_000).toISOString(),
      },
    );

    const startRes = await api(request, "POST", `/live-class/${classId}/start`, coachCookies);
    expect(startRes.ok(), `start: ${await startRes.text()}`).toBeTruthy();

    const ctx = await browser.newContext();
    await ctx.addCookies(coachCookies);
    const page = await ctx.newPage();
    await page.goto(`/live-class/${classId}/board`);

    await page.waitForFunction(() => !!window.__nexaBoard, null, { timeout: 20_000 });

    // ── Engine analysis ───────────────────────────────────────────
    await page.getByRole("tab", { name: "Engine" }).click();
    await page.evaluate(() => window.__nexaBoard!.move("e2", "e4"));

    const evalText = page.locator("text=Evaluation").locator("xpath=following-sibling::*[1]");
    await expect
      .poll(async () => (await evalText.textContent())?.trim() ?? "", { timeout: 20_000 })
      .toMatch(/^[+-]?\d+\.\d{2}$|^M\d+$/); // a real score, never "MNaN"

    await expect(page.getByText("Best Move")).toBeVisible();

    // ── Load Game (PGN) ───────────────────────────────────────────
    await page.getByRole("button", { name: /^Setup Position$/ }).click();
    await page.getByRole("tab", { name: /Load Game/i }).click();
    await page
      .getByPlaceholder(/Casual game/i)
      .fill("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *");
    await page.getByRole("button", { name: /^Load Game$/ }).click();

    await expect.poll(() => page.evaluate(() => window.__nexaBoard!.moveCount())).toBe(6);
    await expect(page.getByText("Nf3", { exact: false })).toBeVisible();

    // ── Setup Position (in place of the board, not a dialog) ─────
    await page.getByRole("button", { name: /^Setup Position$/ }).click();
    const fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
    const workspace = page.getByTestId("setup-position-workspace");
    await expect(workspace).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(workspace.getByRole("tab", { name: /Setup Position/i })).toHaveAttribute("aria-selected", "true");

    const editorBoard = workspace.getByTestId("position-editor-board");
    const boardPieces = editorBoard.locator("piece:not(.ghost)");

    // Starts from the board's own position (the PGN loaded above), not the start position.
    await expect.poll(() => boardPieces.count()).toBe(32);
    await expect(workspace.getByLabel("FEN")).toHaveValue(/^r1bqkbnr\/1ppp1ppp\/p1n5\/1B2p3/);

    // Spare-piece palette renders (6 roles x 2 colors).
    await expect(workspace.locator("[data-spare-piece]")).toHaveCount(12);
    await expect(workspace.locator('[data-spare-piece="white-queen"]')).toBeVisible();

    // Castling controls are visible and clickable (regression: a stray bar used
    // to overlap the black-castling row).
    const blackKingside = workspace.getByRole("checkbox", { name: "Black kingside (O-O)" });
    await expect(blackKingside).toBeVisible();
    await blackKingside.uncheck();
    await expect(blackKingside).not.toBeChecked();

    // FEN field drives the board reactively.
    await workspace.getByLabel("FEN").fill("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    await expect.poll(() => boardPieces.count()).toBe(2);

    // Tap-to-place: select a spare piece, then tap squares (it stays selected).
    const square = async (sq: string) => {
      const box = (await editorBoard.boundingBox())!;
      const col = "abcdefgh".indexOf(sq[0]);
      const row = 8 - Number(sq[1]);
      return { x: box.x + (col + 0.5) * (box.width / 8), y: box.y + (row + 0.5) * (box.height / 8) };
    };
    const whiteQueen = workspace.locator('[data-spare-piece="white-queen"]');
    await whiteQueen.click();
    await expect(whiteQueen).toHaveAttribute("aria-pressed", "true");
    for (const sq of ["d4", "a6"]) {
      const at = await square(sq);
      await page.mouse.click(at.x, at.y);
    }
    await expect(workspace.getByLabel("FEN")).toHaveValue(/^4k3\/8\/Q7\/8\/3Q4\/8\/8\/4K3 /);

    // An illegal position (kings removed, a pawn on the 8th rank) loads as set-up only.
    await workspace.getByRole("button", { name: "Remove", exact: true }).click();
    for (const sq of ["e1", "e8"]) {
      const at = await square(sq);
      await page.mouse.click(at.x, at.y);
    }
    await workspace.locator('[data-spare-piece="white-pawn"]').click();
    {
      const at = await square("h8");
      await page.mouse.click(at.x, at.y);
    }
    await expect(workspace.getByText(/Set-up position \(no white king, no black king/)).toBeVisible();
    await workspace.getByRole("button", { name: /^Load Position$/ }).click();
    await expect(workspace).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__nexaBoard!.fen())).toContain("7P/8/Q7/8/3Q4/8/8/8");
    await expect(page.getByTestId("setup-only-notice")).toBeVisible();
    expect(await page.evaluate(() => window.__nexaBoard!.move("d4", "d5"))).toBe(false);

    // Back to a legal position; play resumes under normal rules.
    await page.getByRole("button", { name: /^Setup Position$/ }).click();
    await workspace.getByLabel("FEN").fill(fen);
    await expect.poll(() => boardPieces.count()).toBe(32);

    await workspace.getByRole("button", { name: /^Load Position$/ }).click();

    await expect
      .poll(() => page.evaluate(() => window.__nexaBoard!.fen()))
      .toContain("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R");
    await expect(page.getByTestId("setup-only-notice")).toHaveCount(0);
    expect(await page.evaluate(() => window.__nexaBoard!.positionIssues())).toEqual([]);

    // ── Save ──────────────────────────────────────────────────────
    // navigator.clipboard is a getter-only property: plain assignment is a no-op.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => {} },
      });
    });
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText(/PGN saved to Cloud/i)).toBeVisible({ timeout: 15_000 });

    await request.dispose();
  });
});
