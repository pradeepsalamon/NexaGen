import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Puzzle Library — permission model + solve flow.
 *
 * Opt-in (mutates the shared dev DB and depends on the puzzle seed):
 *   1. api + web running:  npm run dev
 *   2. seed applied:       npm run db:seed   (creates coach2@nexa.test + puzzles)
 *   3. enable this spec:   RUN_PUZZLE_E2E=1 npx playwright test puzzles
 */

const RUN = process.env.RUN_PUZZLE_E2E === "1";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };
const COACH_A = { email: "coach@nexa.test", password: "Test@12345" };
const COACH_B = { email: "coach2@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };

type Cookie = { name: string; value: string; domain: string; path: string; httpOnly: boolean };

async function login(request: APIRequestContext, email: string, password: string): Promise<Cookie[]> {
  let res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  for (let attempt = 0; res.status() === 429 && attempt < 6; attempt += 1) {
    await new Promise((r) => setTimeout(r, 12_000));
    res = await request.post(`${API_URL}/auth/login`, { data: { email, password } });
  }
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

function api(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: Cookie[],
  body?: Record<string, unknown>
) {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ")
    },
    data: body
  });
}

test.describe("Puzzle Library", () => {
  test.skip(!RUN, "opt-in: RUN_PUZZLE_E2E=1 + seeded DB");

  test("visibility + ownership are enforced server-side", async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const coachA = await login(request, COACH_A.email, COACH_A.password);
    const coachB = await login(request, COACH_B.email, COACH_B.password);
    const student = await login(request, STUDENT.email, STUDENT.password);

    const topics = await (await api(request, "GET", "/puzzles/topics", admin)).json();
    const topicId: string = topics.topics[0].id;

    // Admin creates a GLOBAL puzzle (mate in one) and publishes it.
    const createRes = await api(request, "POST", "/puzzles", admin, {
      title: `E2E admin puzzle ${Date.now()}`,
      topicId,
      puzzleType: "CHECKMATE",
      difficulty: "EASY",
      fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
      solutionMoves: [{ uci: "a1a8", san: "Ra8#" }],
      status: "PUBLISHED"
    });
    const created = await createRes.json();
    const adminPuzzleId: string = created.puzzle.id;
    expect(created.puzzle.visibility).toBe("GLOBAL");

    // Both coaches see the admin puzzle but cannot manage it.
    for (const coach of [coachA, coachB]) {
      const list = await (await api(request, "GET", "/puzzles?visibility=GLOBAL&pageSize=50", coach)).json();
      const row = list.puzzles.find((p: { id: string }) => p.id === adminPuzzleId);
      expect(row, "coach sees admin puzzle").toBeTruthy();
      expect(row.canManage).toBe(false);
    }
    const coachEdit = await api(request, "PATCH", `/puzzles/${adminPuzzleId}`, coachA, { title: "hijacked" });
    expect(coachEdit.status(), "coach cannot edit admin puzzle").toBe(403);

    // Coach A creates a PRIVATE puzzle — forced private even if GLOBAL is asked for.
    const coachCreate = await api(request, "POST", "/puzzles", coachA, {
      title: `E2E coach A puzzle ${Date.now()}`,
      topicId,
      puzzleType: "TACTICAL",
      difficulty: "EASY",
      fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
      solutionMoves: [{ uci: "a1a8", san: "Ra8#" }],
      visibility: "GLOBAL",
      status: "PUBLISHED"
    });
    const coachPuzzle = await coachCreate.json();
    const coachPuzzleId: string = coachPuzzle.puzzle.id;
    expect(coachPuzzle.puzzle.visibility).toBe("PRIVATE");

    // Coach B cannot see or edit Coach A's private puzzle.
    const coachBList = await (await api(request, "GET", "/puzzles?pageSize=100", coachB)).json();
    expect(coachBList.puzzles.some((p: { id: string }) => p.id === coachPuzzleId)).toBe(false);
    expect((await api(request, "GET", `/puzzles/${coachPuzzleId}`, coachB)).status()).toBe(404);

    // Admin can see Coach A's private puzzle.
    expect((await api(request, "GET", `/puzzles/${coachPuzzleId}`, admin)).status()).toBe(200);

    // Student sees + solves the admin puzzle.
    const mine = await (await api(request, "GET", "/puzzles/mine?pageSize=100", student)).json();
    expect(mine.puzzles.some((p: { id: string }) => p.id === adminPuzzleId)).toBe(true);

    const start = await (await api(request, "POST", `/puzzles/${adminPuzzleId}/attempts`, student)).json();
    const attemptId: string = start.attempt.attempt.id;
    const submit = await (
      await api(request, "POST", `/puzzles/${adminPuzzleId}/attempts/${attemptId}/submit`, student, {
        moves: [
          {
            ply: 1,
            uci: "a1a8",
            san: "Ra8#",
            fenAfter: "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1"
          }
        ]
      })
    ).json();
    expect(submit.solved).toBe(true);
    expect(submit.scorePercent).toBe(100);

    // Cleanup.
    await api(request, "DELETE", `/puzzles/${adminPuzzleId}`, admin);
    await api(request, "DELETE", `/puzzles/${coachPuzzleId}`, coachA);
    await request.dispose();
  });

  test("admin puzzle library page renders", async ({ browser, playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await login(request, ADMIN.email, ADMIN.password);
    const ctx = await browser.newContext();
    await ctx.addCookies(admin);
    const page = await ctx.newPage();
    await page.goto("/admin/puzzles");
    // The topbar and the page body both render an <h1>"Puzzle Library"; scope to the page body.
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Puzzle Library" })
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Topics" })).toBeVisible();
    await ctx.close();
    await request.dispose();
  });
});
