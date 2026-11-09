import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { API_ROUTES } from "@nexa-chess/types";
import { api, login, loginContext, TEST_USERS, type Cookie } from "./fixtures";

/**
 * Tournaments end to end (docs/TOURNAMENTS.md): an admin creates a one-round
 * Swiss in the editor, publishes it, enters two students and starts it; the
 * two students play a game on the board in their own browsers (fool's mate),
 * the result reaches both boards and the standings, the tournament finishes,
 * results are published, and an anonymous visitor watches it on /watch.
 *
 * Needs web + API running against a seeded database (`npm run db:seed`).
 * Run: npx playwright test e2e/tournaments.spec.ts
 */

const SECOND_STUDENT = { email: "student2.tournament@nexa.test", password: "Test@12345" };

async function ensureSecondStudent(admin: Cookie[], request: Parameters<typeof api>[0]) {
  const res = await api(request, "POST", API_ROUTES.users.create, admin, {
    email: SECOND_STUDENT.email,
    firstName: "Rival",
    lastName: "Player",
    password: SECOND_STUDENT.password,
    role: "STUDENT"
  });
  if (res.ok()) return;
  // Already there from an earlier run.
  expect(await res.text()).toMatch(/already/i);
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Signs a context in, waiting out the login rate limit (5 a minute) like `loginContext`. */
async function signIn(context: BrowserContext, account: { email: string; password: string }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await context.request.post(`${API_URL}/auth/login`, { data: account });
    if (res.ok()) return;
    expect(res.status(), await res.text()).toBe(429);
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  throw new Error(`Login for ${account.email} kept hitting the rate limiter.`);
}

/** Clicks a square on the chessground board, whichever way up it is. */
async function clickSquare(page: Page, square: string, orientation: "white" | "black") {
  const board = page.locator("cg-board").first();
  const box = await board.boundingBox();
  if (!box) throw new Error("board not visible");
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  const size = box.width / 8;
  await page.mouse.click(box.x + size * (col + 0.5), box.y + size * (row + 0.5));
}

async function play(page: Page, uci: string, orientation: "white" | "black") {
  await clickSquare(page, uci.slice(0, 2), orientation);
  await clickSquare(page, uci.slice(2, 4), orientation);
}

test.describe("Tournaments", () => {
  test.describe.configure({ mode: "serial" });

  test("create, enter, start, play a game, finish and watch publicly", async ({ browser, request }) => {
    test.setTimeout(300_000);
    const adminCookies = await login(request, "admin");
    await ensureSecondStudent(adminCookies, request);
    // Public spectating on for the academy (it is off by default).
    const settings = await api(request, "GET", API_ROUTES.tournaments.adminSettings, adminCookies);
    expect(settings.ok()).toBeTruthy();
    const current = (await settings.json()).settings;
    const saved = await api(request, "PUT", API_ROUTES.tournaments.adminSettings, adminCookies, {
      allowAnonymousSpectating: true,
      coachesMayCreate: current.coachesMayCreate,
      coachesMayPublishPublic: current.coachesMayPublishPublic,
      defaultSpectatorDelaySec: 0,
      publicNameFormat: current.publicNameFormat
    });
    expect(saved.ok()).toBeTruthy();

    // ── The admin creates and publishes it in the UI ──
    const adminContext = await browser.newContext();
    await loginContext(adminContext, "admin");
    const admin = await adminContext.newPage();
    const name = `E2E Swiss ${Date.now().toString(36)}`;
    await admin.goto("/tournaments/new");
    await admin.getByLabel("Name", { exact: true }).fill(name);
    await admin.getByLabel("Rounds", { exact: true }).fill("1");
    await admin.getByRole("button", { name: "3 + 2 Blitz" }).click();
    await admin.getByRole("button", { name: "Create draft" }).click();
    await admin.waitForURL(/\/tournaments\/[^/]+\/edit$/);
    const tournamentId = admin.url().split("/").at(-2)!;

    await admin.goto(`/tournaments/${tournamentId}`);
    await expect(admin.getByRole("heading", { name })).toBeVisible();
    await admin.getByRole("button", { exact: true, name: "Publish" }).click();
    await expect(admin.getByText("Tournament published")).toBeVisible();

    // ── Enter both students from Manage → Players ──
    await admin.goto(`/tournaments/${tournamentId}/manage`);
    await admin.getByRole("tab", { name: "Players" }).click();
    for (const [search, label, count] of [
      ["Rival", "Select Rival Player", 1],
      [TEST_USERS.student.email, "Select Test Student", 2]
    ] as const) {
      await admin.getByLabel("Search students").fill(search);
      const box = admin.getByRole("checkbox", { exact: true, name: label });
      await expect(box).toBeEnabled();
      await box.click();
      await admin.getByRole("button", { name: /^Enter/ }).click();
      await expect(admin.getByText(`Entries (${count} entered)`)).toBeVisible();
    }
    await expect(admin.getByText("Entries (2 entered)")).toBeVisible();

    // ── Start ──
    await admin.getByRole("tab", { name: "Run" }).click();
    await admin.getByRole("button", { name: "Start now" }).click();
    await admin.getByRole("button", { exact: true, name: "Start" }).click();
    await expect(admin.getByText("Tournament started")).toBeVisible();

    // ── The two students open their game from the tournament page ──
    const contexts: BrowserContext[] = [];
    const players: { page: Page; color: "white" | "black" }[] = [];
    for (const account of [TEST_USERS.student, SECOND_STUDENT]) {
      const context = await browser.newContext();
      contexts.push(context);
      await signIn(context, account);
      const page = await context.newPage();
      await page.goto(`/tournaments/${tournamentId}`);
      await page.getByRole("link", { exact: true, name: "Play" }).click();
      await page.waitForURL(/\/games\//);
      await expect(page.locator("cg-board")).toBeVisible();
      const gameId = page.url().split("/").at(-1)!;
      const game = await page.request.get(`${API_URL}${API_ROUTES.tournaments.game(tournamentId, gameId)}`);
      const color = (await game.json()).game.viewerColor as "white" | "black";
      players.push({ color, page });
    }
    const white = players.find((p) => p.color === "white")!;
    const black = players.find((p) => p.color === "black")!;
    expect(white && black).toBeTruthy();
    await expect(white.page.getByText("Your move.")).toBeVisible();

    // Fool's mate, every move made on the board and seen by the opponent.
    const moves: [typeof white, string, string][] = [
      [white, "f2f3", "f3"],
      [black, "e7e5", "e5"],
      [white, "g2g4", "g4"],
      [black, "d8h4", "Qh4#"]
    ];
    for (const [side, uci, san] of moves) {
      const other = side === white ? black : white;
      await play(side.page, uci, side.color);
      await expect(other.page.getByRole("list", { name: "Moves" }).getByRole("button", { exact: true, name: san })).toBeVisible({ timeout: 15_000 });
    }
    for (const side of [white, black]) await expect(side.page.getByText("0–1 · Checkmate")).toBeVisible({ timeout: 15_000 });

    // ── One round: it finishes on its own; the winner tops the standings ──
    await admin.goto(`/tournaments/${tournamentId}`);
    await expect(admin.getByText("Finished", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await admin.getByRole("tab", { name: "Standings" }).click();
    const firstRow = admin.getByRole("table").last().getByRole("row").nth(1);
    await expect(firstRow).toContainText(black.page === players[0].page ? "Student" : "Rival");

    await admin.goto(`/tournaments/${tournamentId}/manage`);
    await admin.getByRole("button", { name: "Publish results" }).click();
    await expect(admin.getByText("Results published")).toBeVisible();

    // ── An anonymous visitor watches it ──
    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(`/watch/${tournamentId}`);
    await expect(visitor.getByRole("heading", { name })).toBeVisible();
    await expect(visitor.getByText("Standings")).toBeVisible();
    // No account data: names are the academy's public format, never an email.
    await expect(visitor.getByText(TEST_USERS.student.email)).toHaveCount(0);

    for (const context of [...contexts, adminContext, anonymous]) await context.close();
  });
});
