import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { API_URL, loginContext, seededBatchId, scheduleClass, type TestRole } from "./fixtures";

/**
 * MCQ + Playout through the one activity queue, in a real browser against real
 * Stockfish: the key stays off a student's page until it is due, a student's
 * game answers with engine moves, the coach's gallery updates live, the coach's
 * board can't move anything, and a game carries on with the coach gone.
 *
 * Opt-in (needs the API with STOCKFISH_PATH, LiveKit and a seeded database):
 *   RUN_ACTIVITIES_E2E=1 NEXT_PUBLIC_E2E=1 npx playwright test puzzle-activities
 */

const RUN = process.env.RUN_ACTIVITIES_E2E === "1";
const KRK = "8/8/8/4k3/8/8/8/R3K3 w - - 0 1";
const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

async function signedIn(browser: Browser, role: TestRole): Promise<Page> {
  const context = await browser.newContext({ permissions: ["camera", "microphone"], viewport: { height: 900, width: 1440 } });
  await loginContext(context, role);
  return context.newPage();
}

async function call<T>(page: Page, method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
  const res = await page.context().request.fetch(`${API_URL}${path}`, {
    data: data as never,
    headers: { Origin: new URL(page.url() === "about:blank" ? (process.env.E2E_BASE_URL ?? "http://localhost:3000") : page.url()).origin },
    method
  });
  expect(res.ok(), `${method} ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<T>;
}

async function enterRoom(page: Page, classId: string) {
  await page.goto(`/live-class/${classId}`, { timeout: 120_000, waitUntil: "domcontentloaded" });
  await page.mouse.move(700, 450);
  await expect(async () => {
    if (await page.locator("[data-classroom-panel]").count()) return;
    const join = page.getByRole("button", { name: /^Join/i });
    if ((await join.count()) && (await join.first().isEnabled())) await join.first().click();
    throw new Error("not in the room yet");
  }).toPass({ timeout: 60_000 });
}

/** Click-to-move on a chessground board, from White's side. */
async function move(board: Locator, from: string, to: string) {
  const box = await board.boundingBox();
  if (!box) throw new Error("board not visible");
  const size = box.width / 8;
  const click = (square: string) =>
    board.page().mouse.click(
      box.x + (square.charCodeAt(0) - 97 + 0.5) * size,
      box.y + (8 - Number(square[1]) + 0.5) * size
    );
  await click(from);
  await board.page().waitForTimeout(150);
  await click(to);
}

test.describe("MCQ and Playout in a live class", () => {
  test.skip(!RUN, "Set RUN_ACTIVITIES_E2E=1 to run this spec.");
  test.setTimeout(300_000);

  test("share, answer, play, watch read-only, survive the coach leaving", async ({ browser }) => {
    const admin = await signedIn(browser, "admin");
    const coach = await signedIn(browser, "coach");
    const student = await signedIn(browser, "student");

    // Admin prepares both in the shared folder tree.
    const { topics } = await call<{ topics: { id: string; slug: string }[] }>(admin, "GET", "/puzzles/topics");
    const topicId = topics.find((t) => !t.slug.startsWith("__"))!.id;
    const stamp = Date.now();
    const base = { difficulty: "BEGINNER", status: "PUBLISHED", tags: [], topicId };
    const mcq = await call<{ activity: { id: string } }>(admin, "POST", "/puzzles/activities", {
      ...base,
      config: {
        explanation: "The king starts on e1.",
        maxAttempts: 2,
        options: [
          { id: `w${stamp}`, isCorrect: false, text: "e4" },
          { id: `r${stamp}`, isCorrect: true, text: "e1" }
        ],
        question: { text: "Where does the white king start?" },
        revealMode: "ON_SUBMIT"
      },
      kind: "MCQ",
      title: `E2E MCQ ${stamp}`
    });
    const playoutConfig = { engine: { movetimeMs: 200, skillLevel: 3 }, goal: { type: "CHECKMATE" }, maxAttempts: 2, studentColor: "white" };
    const rook = await call<{ activity: { id: string } }>(admin, "POST", "/puzzles/activities", {
      ...base,
      config: { ...playoutConfig, startFen: KRK },
      kind: "PLAYOUT",
      title: `E2E Rook ${stamp}`
    });
    const backRank = await call<{ activity: { id: string } }>(admin, "POST", "/puzzles/activities", {
      ...base,
      config: { ...playoutConfig, startFen: MATE_IN_ONE },
      kind: "PLAYOUT",
      title: `E2E Back rank ${stamp}`
    });

    // Coach queues the three.
    const batchId = seededBatchId(await call(coach, "GET", "/coach/batches"));
    const asRole = (page: Page) => (method: string, path: string, body?: unknown) =>
      page.context().request.fetch(`${API_URL}${path}`, { data: body as never, method });
    const now = Date.now();
    const classId = await scheduleClass(asRole(coach) as never, asRole(admin) as never, {
      batchId,
      endsAt: new Date(now + 3_660_000).toISOString(),
      startsAt: new Date(now + 60_000).toISOString(),
      topic: `E2E activities ${stamp}`
    });
    await call(coach, "POST", `/live-class/${classId}/start`);
    await enterRoom(coach, classId);
    await enterRoom(student, classId);

    const { queue } = await call<{ queue: { id: string } }>(coach, "POST", `/live-class/${classId}/activity-queues`, {
      clientId: `e2e-activities-${stamp}`,
      title: "E2E lesson"
    });
    await call(coach, "POST", `/live-class/${classId}/activity-queues/${queue.id}/items`, {
      items: [
        { activityId: mcq.activity.id, kind: "MCQ" },
        { activityId: rook.activity.id, kind: "PLAYOUT" },
        { activityId: backRank.activity.id, kind: "PLAYOUT" }
      ]
    });
    await coach.getByRole("tab", { name: /Queue/ }).click();
    await coach.getByRole("button", { name: /Launch for the class/ }).click();
    await coach.getByRole("button", { name: "Launch", exact: true }).click();

    // MCQ: nothing on the page gives the answer away until it is due.
    const right = student.getByRole("radio", { name: /e1/ });
    await expect(right).toBeVisible({ timeout: 30_000 });
    expect(await student.content()).not.toContain("The king starts on e1.");
    await student.getByRole("radio", { name: /e4/ }).click();
    await student.getByRole("button", { name: "Submit answer" }).click();
    await expect(student.getByText("Not quite. Try again.")).toBeVisible();
    expect(await student.content()).not.toContain("The king starts on e1.");
    await right.click();
    await student.getByRole("button", { name: "Submit answer" }).click();
    await expect(student.getByText("The king starts on e1.")).toBeVisible();

    // Playout: the real engine answers.
    await coach.getByRole("tab", { name: /Queue/ }).click();
    await coach.getByRole("button", { name: new RegExp(`Next: E2E Rook`) }).click();
    await expect(student.getByText("Your move")).toBeVisible({ timeout: 30_000 });
    await student.waitForTimeout(800);
    await move(student.locator("cg-board").first(), "a1", "a5");
    await expect(student.getByText("Ra5+")).toBeVisible({ timeout: 20_000 });
    await expect(student.getByText("Your move")).toBeVisible({ timeout: 20_000 });

    // The coach sees it live, and can't touch it.
    await coach.getByRole("tab", { name: "Student boards" }).click({ timeout: 15_000 });
    // This student's card: the only one with a move on it.
    const card = coach.getByRole("button", { name: /Open .*'s board/ }).filter({ hasText: /1 move/ });
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    await card.click();
    const dialog = coach.getByRole("dialog");
    await expect(dialog.getByText(/nothing here can change/)).toBeVisible();
    await expect(dialog.getByRole("button")).toHaveText(["Close"]);
    const before = await dialog.locator("cg-board piece").count();
    await move(dialog.locator("cg-board").first(), "a5", "a8");
    await coach.waitForTimeout(400);
    expect(await dialog.locator("cg-board piece").count()).toBe(before);
    await coach.keyboard.press("Escape");

    // The coach leaves: the student's game doesn't notice.
    await coach.goto("about:blank");
    await move(student.locator("cg-board").first(), "a5", "a4");
    await expect(student.getByText(/Ra4/)).toBeVisible({ timeout: 20_000 });

    // A reload brings the same game back.
    await student.reload({ waitUntil: "domcontentloaded" });
    await enterRoom(student, classId);
    await expect(student.getByText("Ra5+")).toBeVisible({ timeout: 30_000 });

    // Back in class: on to a real checkmate.
    await enterRoom(coach, classId);
    await coach.getByRole("tab", { name: /Queue/ }).click();
    await coach.getByRole("button", { name: new RegExp(`Next: E2E Back rank`) }).click();
    await expect(student.getByText("Your move")).toBeVisible({ timeout: 30_000 });
    await student.waitForTimeout(800);
    await move(student.locator("cg-board").first(), "a1", "a8");
    await expect(student.getByText("Goal achieved!")).toBeVisible({ timeout: 20_000 });

    // It lands in the student's own history.
    const history = await call<{ entries: { title: string; outcome: string; playout: { pgn: string } | null }[] }>(
      student,
      "GET",
      "/progress/me/history?type=CLASS_PLAYOUT"
    );
    const entry = history.entries.find((e) => e.title.startsWith("E2E Back rank"));
    expect(entry?.outcome).toBe("CORRECT");
    expect(entry?.playout?.pgn).toContain("Ra8#");

    // Leave the coach's schedule free for the next run.
    await call(coach, "POST", `/live-class/${classId}/end`);
  });
});
