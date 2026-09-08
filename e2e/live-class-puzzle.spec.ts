import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Live-class puzzle assignment + leaderboard — API-level flow.
 *
 * Exercises the real authz (LIVE-gate, coach-owner, participant-only), the
 * assign → in-room attempt → submit → leaderboard chain, the hidden-leaderboard
 * toggle, and `assertLiveAssignmentOpen` (a coach ending the puzzle blocks an
 * in-flight submit). The data-channel bridge / sidebar panel are covered by unit
 * specs + the board-sync browser spec; this stays request-only so it is fast and
 * doesn't need LiveKit.
 *
 * Opt-in (mutates the shared dev DB, needs the puzzle seed for `coach2@nexa.test`):
 *   1. api running:      npm run dev:api
 *   2. seed applied:     npm run db:seed
 *   3. enable this spec:  RUN_LIVE_PUZZLE_E2E=1 npx playwright test live-class-puzzle
 */

const RUN = process.env.RUN_LIVE_PUZZLE_E2E === "1";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const ADMIN = { email: "superadmin@nexa.test", password: "Test@12345" };
const COACH = { email: "coach@nexa.test", password: "Test@12345" };
const COACH_B = { email: "coach2@nexa.test", password: "Test@12345" };
const STUDENT = { email: "student@nexa.test", password: "Test@12345" };

// White to move, mate in one: Ra8#.
const MATE_FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const MATE_MOVE = {
  ply: 1,
  uci: "a1a8",
  san: "Ra8#",
  fenAfter: "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1"
};

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
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
    .join("; ");
}

function api(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: string,
  body?: Record<string, unknown>
) {
  return request.fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookies },
    data: body
  });
}

async function json<T = Record<string, unknown>>(
  request: APIRequestContext,
  method: string,
  path: string,
  cookies: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await api(request, method, path, cookies, body);
  expect(res.ok(), `${method} ${path} → ${res.status()}: ${await res.text()}`).toBeTruthy();
  return res.json() as Promise<T>;
}

/** Clear the coach's leftover E2E classes so `POST /coach/classes` doesn't 409. */
async function clearCoachSchedule(request: APIRequestContext, cookies: string) {
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

async function makeLiveClass(request: APIRequestContext, coach: string): Promise<string> {
  const batches = await json<{ batches?: Array<{ id: string }> } & Array<{ id: string }>>(
    request,
    "GET",
    "/coach/batches",
    coach
  );
  const batchId = (batches.batches || batches)[0].id;
  await clearCoachSchedule(request, coach);

  const now = Date.now();
  const created = await json<{ class?: { id: string }; id?: string }>(
    request,
    "POST",
    "/coach/classes",
    coach,
    {
      batchId,
      topic: "E2E live puzzle",
      title: "E2E live puzzle",
      startsAt: new Date(now + 60_000).toISOString(),
      endsAt: new Date(now + 3_660_000).toISOString()
    }
  );
  const classId = created.class ? created.class.id : (created.id as string);
  expect(classId).toBeTruthy();

  const start = await api(request, "POST", `/live-class/${classId}/start`, coach);
  expect(start.ok(), `start: ${await start.text()}`).toBeTruthy();
  return classId;
}

async function makePublishedPuzzle(request: APIRequestContext, admin: string): Promise<string> {
  const topics = await json<{ topics: Array<{ id: string }> }>(request, "GET", "/puzzles/topics", admin);
  const created = await json<{ puzzle: { id: string; visibility: string } }>(
    request,
    "POST",
    "/puzzles",
    admin,
    {
      title: `E2E live puzzle ${Date.now()}`,
      topicId: topics.topics[0].id,
      puzzleType: "CHECKMATE",
      difficulty: "EASY",
      fen: MATE_FEN,
      solutionMoves: [{ uci: "a1a8", san: "Ra8#" }],
      status: "PUBLISHED"
    }
  );
  expect(created.puzzle.visibility).toBe("GLOBAL");
  return created.puzzle.id;
}

test.describe("Live-class puzzle assignment", () => {
  test.skip(!RUN, "opt-in: RUN_LIVE_PUZZLE_E2E=1 + seeded DB");

  test("assign → in-room attempt → leaderboard → end", async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);
    const coach = await loginAs(request, COACH.email, COACH.password);
    const student = await loginAs(request, STUDENT.email, STUDENT.password);

    const puzzleId = await makePublishedPuzzle(request, admin);
    const classId = await makeLiveClass(request, coach);

    try {
      // Coach shares the puzzle.
      const assigned = await json<{ assignment: { id: string; puzzleId: string } }>(
        request,
        "POST",
        `/live-class/${classId}/puzzle`,
        coach,
        { puzzleId }
      );
      expect(assigned.assignment.puzzleId).toBe(puzzleId);

      // The student sees it — without the solution line.
      const current = await json<{
        assignment: { puzzleId: string; solutionLength: number; fen: string } & Record<string, unknown>;
      }>(request, "GET", `/live-class/${classId}/puzzle`, student);
      expect(current.assignment.puzzleId).toBe(puzzleId);
      expect(current.assignment.solutionLength).toBe(1);
      expect(current.assignment).not.toHaveProperty("solutionMoves");

      // Student starts an in-room attempt (stamped with liveClassId) and solves it
      // through the shared puzzle attempt route.
      const started = await json<{ attempt: { attempt: { id: string } } }>(
        request,
        "POST",
        `/live-class/${classId}/puzzle/attempt`,
        student
      );
      const attemptId = started.attempt.attempt.id;

      const submit = await json<{ solved: boolean; scorePercent: number }>(
        request,
        "POST",
        `/puzzles/${puzzleId}/attempts/${attemptId}/submit`,
        student,
        { moves: [MATE_MOVE] }
      );
      expect(submit.solved).toBe(true);
      expect(submit.scorePercent).toBe(100);

      // The leaderboard ranks the student first.
      const board = await json<{
        entries: Array<{ studentId: string; rank: number; scorePercent: number; solved: boolean; isSelf: boolean }>;
        revealLeaderboard: boolean;
      }>(request, "GET", `/live-class/${classId}/puzzle/leaderboard`, student);
      expect(board.revealLeaderboard).toBe(true);
      expect(board.entries.length).toBe(1);
      expect(board.entries[0]).toMatchObject({ rank: 1, scorePercent: 100, solved: true, isSelf: true });

      // Coach ends it.
      const ended = await json<{ assignment: unknown }>(
        request,
        "DELETE",
        `/live-class/${classId}/puzzle`,
        coach
      );
      expect(ended.assignment).toBeNull();
      const after = await json<{ assignment: unknown }>(
        request,
        "GET",
        `/live-class/${classId}/puzzle`,
        student
      );
      expect(after.assignment).toBeNull();

      // Starting a fresh attempt now fails — nothing is active.
      const reStart = await api(request, "POST", `/live-class/${classId}/puzzle/attempt`, student);
      expect(reStart.status()).toBe(404);
    } finally {
      await api(request, "POST", `/live-class/${classId}/end`, coach).catch(() => {});
      await api(request, "DELETE", `/puzzles/${puzzleId}`, admin).catch(() => {});
      await request.dispose();
    }
  });

  test("authz: coach-owner + participant only, LIVE-gated", async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);
    const coach = await loginAs(request, COACH.email, COACH.password);
    const coachB = await loginAs(request, COACH_B.email, COACH_B.password);
    const student = await loginAs(request, STUDENT.email, STUDENT.password);

    const puzzleId = await makePublishedPuzzle(request, admin);
    const classId = await makeLiveClass(request, coach);

    try {
      // A different coach cannot assign into, or even read, someone else's class.
      expect(
        (await api(request, "POST", `/live-class/${classId}/puzzle`, coachB, { puzzleId })).status()
      ).toBe(403);
      expect((await api(request, "GET", `/live-class/${classId}/puzzle`, coachB)).status()).toBe(403);

      // A student cannot assign.
      expect(
        (await api(request, "POST", `/live-class/${classId}/puzzle`, student, { puzzleId })).status()
      ).toBe(403);

      // A student cannot start an attempt before a puzzle is shared.
      expect(
        (await api(request, "POST", `/live-class/${classId}/puzzle/attempt`, student)).status()
      ).toBe(404);

      // Once the class is over, the LIVE gate rejects a new assignment.
      await api(request, "POST", `/live-class/${classId}/end`, coach);
      const lateAssign = await api(request, "POST", `/live-class/${classId}/puzzle`, coach, { puzzleId });
      expect(lateAssign.status()).toBe(400);
    } finally {
      await api(request, "POST", `/live-class/${classId}/end`, coach).catch(() => {});
      await api(request, "DELETE", `/puzzles/${puzzleId}`, admin).catch(() => {});
      await request.dispose();
    }
  });

  test("hidden leaderboard + a coach-ended puzzle blocks an in-flight submit", async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const admin = await loginAs(request, ADMIN.email, ADMIN.password);
    const coach = await loginAs(request, COACH.email, COACH.password);
    const student = await loginAs(request, STUDENT.email, STUDENT.password);

    const puzzleId = await makePublishedPuzzle(request, admin);
    const classId = await makeLiveClass(request, coach);

    try {
      const assigned = await json<{ assignment: { endsAt: string | null; revealLeaderboard: boolean } }>(
        request,
        "POST",
        `/live-class/${classId}/puzzle`,
        coach,
        { puzzleId, durationSeconds: 300, revealLeaderboard: false }
      );
      expect(assigned.assignment.revealLeaderboard).toBe(false);
      expect(assigned.assignment.endsAt).toBeTruthy(); // startedAt + 300s

      // Student opens an attempt but does not submit yet.
      const started = await json<{ attempt: { attempt: { id: string } } }>(
        request,
        "POST",
        `/live-class/${classId}/puzzle/attempt`,
        student
      );
      const attemptId = started.attempt.attempt.id;

      // A student still sees the hidden flag; the coach always sees the board.
      const studentBoard = await json<{ revealLeaderboard: boolean }>(
        request,
        "GET",
        `/live-class/${classId}/puzzle/leaderboard`,
        student
      );
      expect(studentBoard.revealLeaderboard).toBe(false);
      const coachBoard = await json<{ revealLeaderboard: boolean }>(
        request,
        "GET",
        `/live-class/${classId}/puzzle/leaderboard`,
        coach
      );
      expect(coachBoard.revealLeaderboard).toBe(false);

      // Coach ends the puzzle; the student's in-flight submit is now rejected.
      await json(request, "DELETE", `/live-class/${classId}/puzzle`, coach);
      const lateSubmit = await api(
        request,
        "POST",
        `/puzzles/${puzzleId}/attempts/${attemptId}/submit`,
        student,
        { moves: [MATE_MOVE] }
      );
      expect(lateSubmit.status()).toBe(400);
    } finally {
      await api(request, "POST", `/live-class/${classId}/end`, coach).catch(() => {});
      await api(request, "DELETE", `/puzzles/${puzzleId}`, admin).catch(() => {});
      await request.dispose();
    }
  });
});
