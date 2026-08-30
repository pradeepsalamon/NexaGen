import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Board workspace — Engine analysis, Load Game, Setup Position, Save.
 *
 * Opt-in (needs infrastructure the rest of the suite doesn't):
 *   1. LiveKit + Postgres + Redis running:  docker compose up -d livekit postgres redis
 *   2. api + web running:                   npm run dev
 *   3. web built/run with the board harness: NEXT_PUBLIC_E2E=1 (apps/web/.env.local)
 *   4. Stockfish reachable from the API:     STOCKFISH_PATH set in apps/api/.env
 *   5. enable this spec:                     RUN_ANALYSIS_E2E=1 npx playwright test analysis-board
 */

const RUN = process.env.RUN_ANALYSIS_E2E === "1";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const COACH = { email: "coach@nexa.test", password: "Test@12345" };

type Cookie = { name: string; value: string; domain: string; path: string; httpOnly: boolean };

async function login(request: APIRequestContext, email: string, password: string): Promise<Cookie[]> {
  const res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  expect(res.ok(), `login ${email}: ${await res.text()}`).toBeTruthy();
  const raw = res.headers()["set-cookie"] || "";
  return raw
    .split("\n")
    .flatMap((line) => line.split(/,(?=\s*nexa_)/))
    .map((c) => c.trim().split(";")[0])
    .filter((c) => c.startsWith("nexa_"))
    .map((c) => {
      const [name, ...v] = c.split("=");
      return { name, value: v.join("="), domain: "localhost", path: "/", httpOnly: true };
    });
}

async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: Cookie[],
  body?: Record<string, unknown>,
) {
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    data: body,
  });
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
    coachCookies = await login(request, COACH.email, COACH.password);

    const batchesRes = await api(request, "GET", "/coach/batches", coachCookies);
    const batchesData = await batchesRes.json();
    const batchId = (batchesData.batches || batchesData)[0].id;

    const now = Date.now();
    const createRes = await api(request, "POST", "/coach/classes", coachCookies, {
      batchId,
      topic: "E2E Analysis Board",
      title: "E2E Analysis Board",
      description: "analysis board spec",
      startsAt: new Date(now + 60_000).toISOString(),
      endsAt: new Date(now + 3_660_000).toISOString(),
    });
    classId = (await createRes.json()).id;
    expect(classId).toBeTruthy();

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
    await page.getByRole("button", { name: /Load Games\/Positions/i }).click();
    await page.getByRole("tab", { name: /Load Game/i }).click();
    await page
      .getByPlaceholder(/Casual game/i)
      .fill("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *");
    await page.getByRole("button", { name: /^Load Game$/ }).click();

    await expect.poll(() => page.evaluate(() => window.__nexaBoard!.moveCount())).toBe(6);
    await expect(page.getByText("Nf3", { exact: false })).toBeVisible();

    // ── Setup Position ────────────────────────────────────────────
    await page.getByRole("button", { name: /Load Games\/Positions/i }).click();
    const fen = "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1";
    await page.getByRole("tab", { name: /Setup Position/i }).click();

    const dialog = page.getByRole("dialog");
    const boardPieces = dialog.locator('[data-testid="position-editor-board"] piece');

    // Board actually renders (regression: the setup board used to be blank).
    await expect.poll(() => boardPieces.count()).toBe(32);

    // Spare-piece palette renders (6 roles x 2 colors).
    await expect(dialog.locator("[data-spare-piece]")).toHaveCount(12);
    await expect(dialog.locator('[data-spare-piece="white-queen"]')).toBeVisible();

    // Castling controls are visible and clickable (regression: a stray bar used
    // to overlap the black-castling row).
    const blackKingside = dialog.getByRole("checkbox", { name: "Black kingside (O-O)" });
    await expect(blackKingside).toBeVisible();
    await blackKingside.uncheck();
    await expect(blackKingside).not.toBeChecked();

    // FEN field drives the board reactively.
    await dialog.getByLabel("FEN").fill("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    await expect.poll(() => boardPieces.count()).toBe(2);

    await dialog.getByLabel("FEN").fill(fen);
    await expect.poll(() => boardPieces.count()).toBe(32);

    await page.getByRole("button", { name: /^Load Position$/ }).click();

    await expect
      .poll(() => page.evaluate(() => window.__nexaBoard!.fen()))
      .toContain("r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R");

    // ── Save ──────────────────────────────────────────────────────
    await page.evaluate(() => {
      // @ts-expect-error test stub
      navigator.clipboard = { writeText: async () => {} };
    });
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByText(/PGN saved to Cloud/i)).toBeVisible({ timeout: 15_000 });

    await request.dispose();
  });
});
