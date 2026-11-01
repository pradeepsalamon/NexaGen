/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { StockfishService } from "../stockfish/stockfish.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";
import { UploadService } from "../upload/upload.service";
import { ActivityRunEventsService } from "./activity-run-events.service";
import { LibraryActivityService } from "./library-activity.service";
import { LiveKitService } from "../live-class/livekit.service";

// MCQs and Playouts over HTTP against real Postgres: authored once, listed with
// puzzles, run through the activity queue, played independently per student and
// watched read-only. The engine is a stub picking the first legal move
// (`engineMove` overrides it), so the assertions don't depend on Stockfish;
// playout-engine.real.spec.ts uses the real one.

const MATE_IN_ONE = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const KRK = "8/8/8/4k3/8/8/8/R3K3 w - - 0 1";
const R = API_ROUTES.liveClass;

describe("MCQ + Playout activities (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let classmate: { email: string; id: string; role: UserRole };
  let engineMove: ((fen: string) => { uci: string; san: string | null } | null) | null = null;
  let topicId: string;
  let toManagers: jest.SpyInstance;
  let queueCounter = 0;

  const firstLegal = (fen: string) => {
    const [move] = new Chess(fen).moves({ verbose: true });
    return move ? { san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ""}` } : null;
  };
  const classId = () => w.a.liveClass.id;

  beforeAll(async () => {
    jest.spyOn(StockfishService.prototype, "isAvailable").mockReturnValue(true);
    jest.spyOn(StockfishService.prototype, "getBestMove").mockImplementation(async (fen: string) => (engineMove ?? firstLegal)(fen));
    toManagers = jest.spyOn(ActivityRunEventsService.prototype, "toManagers").mockImplementation(() => undefined);
    jest.spyOn(LiveKitService.prototype, "listParticipants").mockResolvedValue([]);
    process.env.CLOUDINARY_CLOUD_NAME = "nexa-test";

    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    topicId = w.a.privatePuzzle.topicId;
    // The world's own runs would get in the way of the queue here.
    await t.prisma.liveClassActivityRun.updateMany({ data: { endedAt: new Date(), status: "ENDED" }, where: {} });

    // A second student in the same class: the independence tests need one.
    const user = await createUser(t.prisma, UserRole.STUDENT);
    classmate = await t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: user.id } });
    await t.prisma.studentProfile.create({ data: { parentName: "Parent C", userId: classmate.id } });
    await t.prisma.batchStudent.create({ data: { batchId: w.a.batch.id, studentId: classmate.id } });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
  });
  beforeEach(() => {
    engineMove = null;
  });

  const playoutBody = (over: Record<string, unknown> = {}, config: Record<string, unknown> = {}) => ({
    config: {
      engine: { movetimeMs: 100, skillLevel: 3 },
      goal: { type: "CHECKMATE" },
      hints: ["First hint", "Second hint"],
      maxAttempts: 2,
      startFen: KRK,
      studentColor: "white",
      ...config
    },
    difficulty: "BEGINNER",
    kind: "PLAYOUT",
    status: "PUBLISHED",
    tags: ["endgame"],
    title: "Single Rook Mate",
    topic: "Endgames",
    topicId,
    ...over
  });

  const mcqBody = (over: Record<string, unknown> = {}, config: Record<string, unknown> = {}) => ({
    config: {
      explanation: "Because it is.",
      marks: 5,
      options: [
        { id: "opt-a", isCorrect: false, text: "e4" },
        { id: "opt-b", isCorrect: true, text: "e1" },
        { fen: MATE_IN_ONE, id: "opt-c", isCorrect: false }
      ],
      question: { fen: MATE_IN_ONE, text: "Which square holds the white king?" },
      ...config
    },
    difficulty: "BEGINNER",
    kind: "MCQ",
    status: "PUBLISHED",
    tags: [],
    title: "King square",
    topicId,
    ...over
  });

  async function createActivity(body: unknown): Promise<string> {
    const res = await t.call(w.admin, "POST", API_ROUTES.puzzles.activities, body);
    expect(res.status).toBe(201);
    return (res.body as any).activity.id;
  }

  /** Puts the activities in a fresh queue and launches it; returns what the class is on. */
  async function launch(items: { kind: "MCQ" | "PLAYOUT"; activityId: string }[]) {
    await t.prisma.liveClassActivityQueue.updateMany({ data: { status: "FINISHED" }, where: { liveClassId: classId(), status: "LIVE" } });
    await t.prisma.liveClassActivityRun.updateMany({ data: { status: "ENDED" }, where: { liveClassId: classId(), status: "ACTIVE" } });
    queueCounter += 1;
    const created = await t.call(w.a.coach, "POST", R.activityQueues(classId()), { clientId: `activity-q-${queueCounter}`, title: `Q${queueCounter}` });
    const queueId = (created.body as any).queue.id as string;
    const added = await t.call(w.a.coach, "POST", R.activityQueueItems(classId(), queueId), { items });
    expect(added.status).toBe(201);
    const launched = await t.call(w.a.coach, "POST", R.activityQueueLaunch(classId(), queueId));
    expect(launched.status).toBe(201);
    const queue = (launched.body as any).queue;
    expect(queue.items[0].activationError).toBeNull();
    return { queue, queueId, runId: queue.items[0].activityRunId as string };
  }

  const startGame = async (student: any, runId: string) => {
    const res = await t.call(student, "POST", R.playoutStart(classId(), runId));
    expect(res.status).toBe(200);
    return (res.body as any).game;
  };

  describe("authoring", () => {
    it("refuses what could never be played or marked", async () => {
      const bad = async (body: unknown) => (await t.call(w.admin, "POST", API_ROUTES.puzzles.activities, body)).status;
      // The goal is already met; the game is already over; the position is illegal.
      expect(await bad(playoutBody({}, { goal: { placement: KRK.split(" ")[0], type: "REACH_POSITION" } }))).toBe(400);
      expect(await bad(playoutBody({}, { startFen: "R6k/6pp/8/8/8/8/8/6K1 b - - 0 1" }))).toBe(400);
      expect(await bad(playoutBody({}, { startFen: "8/8/8/8/8/8/8/K7 w - - 0 1" }))).toBe(400);
      // No correct answer; a host we don't control.
      expect(await bad(mcqBody({}, { options: [{ id: "a", isCorrect: false, text: "x" }, { id: "b", isCorrect: false, text: "y" }] }))).toBe(400);
      expect(await bad(mcqBody({}, { question: { imageUrl: "https://evil.example.com/pixel.png" } }))).toBe(400);
      // A file from our own upload folder is fine.
      expect(
        await bad(mcqBody({ status: "DRAFT", title: "With image" }, { question: { imageUrl: "https://res.cloudinary.com/nexa-test/image/upload/v1/nexa_chess/activities/q.png" } }))
      ).toBe(201);
    });

    it("lists puzzles, MCQs and Playouts together, never with an answer key", async () => {
      const mcq = await createActivity(mcqBody({ title: "Listed MCQ" }));
      const playout = await createActivity(playoutBody({ title: "Listed Playout" }));
      const draft = await createActivity(mcqBody({ status: "DRAFT", title: "Hidden draft" }));

      const all = await t.call(w.admin, "GET", `${API_ROUTES.puzzles.library}?pageSize=100`);
      expect(all.status).toBe(200);
      const ids = (all.body as any).items.map((i: any) => i.id);
      expect(ids).toEqual(expect.arrayContaining([mcq, playout, draft, w.a.privatePuzzle.id]));
      expect(JSON.stringify(all.body)).not.toContain("isCorrect");
      expect(JSON.stringify(all.body)).not.toContain("solutionMoves");
      expect((all.body as any).pagination.total).toBe(ids.length);

      const kinds = async (query: string, user: any = w.admin) =>
        (await t.call(user, "GET", `${API_ROUTES.puzzles.library}?pageSize=100&${query}`)).body as any;
      expect((await kinds("kind=MCQ")).items.every((i: any) => i.kind === "MCQ")).toBe(true);
      expect((await kinds("kind=PLAYOUT")).items.every((i: any) => i.kind === "PLAYOUT")).toBe(true);
      expect((await kinds("kind=PUZZLE")).items.every((i: any) => i.kind === "PUZZLE")).toBe(true);
      expect((await kinds("search=Listed%20MCQ")).items.map((i: any) => i.id)).toEqual([mcq]);
      expect((await kinds("topic=Endgames")).items.map((i: any) => i.id)).toContain(playout);
      expect((await kinds("kind=PLAYOUT")).topics).toContain("Endgames");
      expect((await kinds(`topicId=${topicId}&topicScope=direct`)).items.map((i: any) => i.id)).toContain(playout);
      expect((await kinds("difficulty=EXPERT")).items).toEqual([]);

      // A coach sees what is published, plus only their own private puzzles.
      const coach = (await kinds("", w.a.coach)).items.map((i: any) => i.id);
      expect(coach).toEqual(expect.arrayContaining([mcq, playout, w.a.privatePuzzle.id]));
      expect(coach).not.toContain(draft);
      expect(coach).not.toContain(w.b.privatePuzzle.id);

      // Paging is exact across both tables: no row twice, none lost.
      const paged: string[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const res = (await t.call(w.admin, "GET", `${API_ROUTES.puzzles.library}?pageSize=2&page=${page}`)).body as any;
        paged.push(...res.items.map((i: any) => i.id));
        if (page >= res.pagination.totalPages) break;
      }
      expect(new Set(paged).size).toBe(paged.length);
      expect(paged.sort()).toEqual([...ids].sort());
    });

    it("edits, duplicates and bulk-handles activities; a draft can't be queued", async () => {
      const id = await createActivity(mcqBody({ status: "DRAFT", title: "To edit" }));
      const patched = await t.call(w.admin, "PATCH", API_ROUTES.puzzles.activity(id), { title: "Edited" });
      expect((patched.body as any).activity.title).toBe("Edited");
      // A broken config can't sneak in through an update.
      expect((await t.call(w.admin, "PATCH", API_ROUTES.puzzles.activity(id), { config: { options: [] } })).status).toBe(400);

      const copy = await t.call(w.admin, "POST", API_ROUTES.puzzles.activityDuplicate(id));
      expect((copy.body as any).activity).toMatchObject({ status: "DRAFT", title: "Edited (copy)" });
      const copyId = (copy.body as any).activity.id;

      const queued = await t.call(w.a.coach, "POST", R.activityQueues(classId()), { clientId: "activity-draft-q", title: "Draft Q" });
      const queueId = (queued.body as any).queue.id;
      expect((await t.call(w.a.coach, "POST", R.activityQueueItems(classId(), queueId), { items: [{ activityId: id, kind: "MCQ" }] })).status).toBe(404);

      const bulk = await t.call(w.admin, "POST", API_ROUTES.puzzles.activityBulk, { action: "PUBLISH", ids: [id, "missing"] });
      expect(bulk.body).toEqual({ done: [id], skipped: [{ id: "missing", reason: "Not found." }] });
      // Now published it can be queued, but not as the wrong kind.
      expect((await t.call(w.a.coach, "POST", R.activityQueueItems(classId(), queueId), { items: [{ activityId: id, kind: "PLAYOUT" }] })).status).toBe(404);
      expect((await t.call(w.a.coach, "POST", R.activityQueueItems(classId(), queueId), { items: [{ activityId: id, kind: "MCQ" }] })).status).toBe(201);

      // Coach read: the key is staff-only but a coach is staff here; a student has no route at all.
      expect((await t.call(w.a.coach, "GET", API_ROUTES.puzzles.activity(id))).status).toBe(200);
      expect((await t.call(w.a.coach, "GET", API_ROUTES.puzzles.activity(copyId))).status).toBe(404);
      expect((await t.call(w.a.student, "GET", API_ROUTES.puzzles.activity(id))).status).toBe(403);
      expect((await t.call(w.a.coach, "PATCH", API_ROUTES.puzzles.activity(id), { title: "x" })).status).toBe(403);

      expect((await t.call(w.admin, "DELETE", API_ROUTES.puzzles.activity(copyId))).status).toBe(200);
      expect((await t.call(w.admin, "GET", API_ROUTES.puzzles.activity(copyId))).status).toBe(404);
      expect(await t.prisma.withDeleted.libraryActivity.count({ where: { id: copyId, isDeleted: true } })).toBe(1);
      await t.prisma.liveClassActivityQueue.delete({ where: { id: queueId } });
    });

    it("takes uploaded images from admins only", async () => {
      // At the service: under Jest the route's file-type check can't load its ESM
      // module and refuses every file, so the route itself can't be driven here.
      const upload = jest.spyOn(UploadService.prototype, "uploadActivityImage").mockResolvedValue({
        secure_url: "https://res.cloudinary.com/nexa-test/image/upload/v1/nexa_chess/activities/new.png"
      } as never);
      const service = t.app.get(LibraryActivityService);
      const file = { buffer: Buffer.from("x") } as Express.Multer.File;

      await expect(service.uploadImage(await t.tokenFor(w.a.student), file)).rejects.toMatchObject({ status: 403 });
      await expect(service.uploadImage(await t.tokenFor(w.a.coach), file)).rejects.toMatchObject({ status: 403 });
      await expect(service.uploadImage(undefined, file)).rejects.toMatchObject({ status: 401 });
      expect(upload).not.toHaveBeenCalled();

      await expect(service.uploadImage(await t.tokenFor(w.admin), file)).resolves.toEqual({
        url: expect.stringContaining("nexa_chess/activities/")
      });
      upload.mockRestore();
    });

    it("folders carry their activities: delete to Trash, restore, copy", async () => {
      const folder = await t.call(w.admin, "POST", API_ROUTES.puzzles.topics, { name: "Beginner rook endings" });
      const folderId = (folder.body as any).topic.id;
      const id = await createActivity(playoutBody({ title: "In a folder", topicId: folderId }));

      const list = await t.call(w.admin, "GET", API_ROUTES.puzzles.topics);
      expect((list.body as any).topics.find((f: any) => f.id === folderId)).toMatchObject({ activityCount: 1, puzzleCount: 0 });

      // A folder with an activity in it isn't "empty".
      expect((await t.call(w.admin, "POST", API_ROUTES.puzzles.archiveTopic(folderId))).status).toBe(400);

      const copied = await t.call(w.admin, "POST", API_ROUTES.puzzles.copyTopic(folderId), { parentId: null });
      expect(copied.status).toBe(201);
      const copyFolder = (copied.body as any).topic.id;
      expect(await t.prisma.libraryActivity.count({ where: { title: "In a folder", topicId: copyFolder } })).toBe(1);

      expect((await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(folderId))).status).toBe(200);
      expect(await t.prisma.libraryActivity.findUnique({ where: { id } })).toBeNull();
      const row = await t.prisma.withDeleted.libraryActivity.findUniqueOrThrow({ where: { id } });
      expect(row.isDeleted).toBe(true);
      expect(row.deleteGroupId).toBeTruthy();
      // The sibling copy is untouched.
      expect(await t.prisma.libraryActivity.count({ where: { topicId: copyFolder } })).toBe(1);
    });
  });

  describe("MCQ in class", () => {
    it("keeps the key off the wire until the student may see it", async () => {
      const activityId = await createActivity(mcqBody({ title: "Key test" }, { maxAttempts: 2, revealMode: "ON_SUBMIT" }));
      const { runId } = await launch([{ activityId, kind: "MCQ" }]);

      const before = await t.call(w.a.student, "GET", R.activityRun(classId()));
      expect(before.status).toBe(200);
      const text = JSON.stringify(before.body);
      expect(text).not.toContain("isCorrect");
      expect(text).not.toContain("Because it is.");
      expect((before.body as any).mcq.correctOptionIds).toBeNull();
      expect((before.body as any).mcq.options).toHaveLength(3);

      // Wrong, with a try left: told it's wrong, still not told the answer.
      const wrong = await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 1, selectedOptionIds: ["opt-a"] });
      expect(wrong.status).toBe(200);
      expect((wrong.body as any).mcq).toMatchObject({ canSubmit: true, correctOptionIds: null, explanation: null, finalScore: 0 });
      expect((wrong.body as any).mcq.attempts[0]).toMatchObject({ correct: false, score: 0 });

      // A retried request returns what is stored and adds nothing.
      const replay = await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 1, selectedOptionIds: ["opt-a"] });
      expect((replay.body as any).mcq.attempts).toHaveLength(1);
      expect((await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 1, selectedOptionIds: ["opt-b"] })).status).toBe(409);

      // Junk selections are refused; picking two on a single-answer question too.
      expect((await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 2, selectedOptionIds: ["nope"] })).status).toBe(400);
      expect((await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 2, selectedOptionIds: ["opt-a", "opt-b"] })).status).toBe(400);

      // Right: now the key and explanation appear, and no more tries.
      const right = await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 2, selectedOptionIds: ["opt-b"] });
      expect((right.body as any).mcq).toMatchObject({ canSubmit: false, correctOptionIds: ["opt-b"], explanation: "Because it is.", finalScore: 5 });

      const row = await t.prisma.liveClassMcqAttempt.findFirstOrThrow({ where: { attemptNumber: 2, runId, studentId: w.a.student.id } });
      expect(row).toMatchObject({ correct: true, correctOptionIds: ["opt-b"], maxScore: 5, score: 5, selectedOptionIds: ["opt-b"] });
      expect(toManagers).toHaveBeenCalledWith(expect.any(String), { runId, type: "MCQ_ANSWERED" });
    });

    it("hides right and wrong until the coach reveals, for the student and on the coach's option bars", async () => {
      const activityId = await createActivity(mcqBody({ title: "Coach reveal" }, { maxAttempts: 2, revealMode: "COACH" }));
      const { runId } = await launch([{ activityId, kind: "MCQ" }]);

      const answered = await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 1, selectedOptionIds: ["opt-b"] });
      expect((answered.body as any).mcq.attempts[0]).toMatchObject({ correct: null, score: null });
      // Being right doesn't stop a second try: stopping would give the answer away.
      expect((answered.body as any).mcq.canSubmit).toBe(true);
      expect((answered.body as any).mcq.finalScore).toBeNull();

      const monitor = await t.call(w.a.coach, "GET", R.activityRunMonitor(classId(), runId));
      expect(monitor.status).toBe(200);
      const m = monitor.body as any;
      expect(m.options.every((o: any) => o.isCorrect === null)).toBe(true);
      expect(m.options.find((o: any) => o.id === "opt-b").count).toBe(1);
      expect(m.totals).toMatchObject({ accuracyPercent: 100, answered: 1, correct: 1, incorrect: 0, pending: 1, students: 2 });
      expect(m.students.find((s: any) => s.studentId === w.a.student.id)).toMatchObject({ correct: true, score: 5, status: "ANSWERED" });
      expect(m.students.find((s: any) => s.studentId === classmate.id)).toMatchObject({ correct: null, status: "PENDING" });

      // A classmate's view shows nothing of anyone else's.
      const other = await t.call(classmate, "GET", R.activityRun(classId()));
      expect((other.body as any).mcq.attempts).toEqual([]);

      expect((await t.call(w.a.student, "POST", R.activityRunReveal(classId(), runId))).status).toBe(403);
      expect((await t.call(w.a.coach, "POST", R.activityRunReveal(classId(), runId))).status).toBe(200);
      const after = await t.call(w.a.student, "GET", R.activityRun(classId()));
      expect((after.body as any).mcq).toMatchObject({ correctOptionIds: ["opt-b"], finalScore: 5 });
      expect((after.body as any).mcq.attempts[0].correct).toBe(true);
      const revealed = await t.call(w.a.coach, "GET", R.activityRunMonitor(classId(), runId));
      expect((revealed.body as any).options.find((o: any) => o.id === "opt-b").isCorrect).toBe(true);
    });

    it("reveals at the end when set to, closes on the timer, and shuffles per student", async () => {
      const activityId = await createActivity(mcqBody({ title: "Timed" }, { randomizeOptions: true, revealMode: "ON_ACTIVITY_END", timeLimitSeconds: 60 }));
      const { queueId, queue, runId } = await launch([{ activityId, kind: "MCQ" }]);

      const order = async (student: any) => ((await t.call(student, "GET", R.activityRun(classId()))).body as any).mcq.options.map((o: any) => o.id);
      expect(await order(w.a.student)).toEqual(await order(w.a.student));
      expect([...(await order(classmate))].sort()).toEqual(["opt-a", "opt-b", "opt-c"]);

      const before = await t.call(w.a.student, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 1, selectedOptionIds: ["opt-b"] });
      expect((before.body as any).mcq.correctOptionIds).toBeNull();

      // The timer passes with nobody pressing anything: the next read ends it.
      await t.prisma.liveClassActivityRun.update({ data: { endsAt: new Date(Date.now() - 60_000) }, where: { id: runId } });
      expect((await t.call(classmate, "POST", R.mcqAnswers(classId(), runId), { attemptNumber: 1, selectedOptionIds: ["opt-a"] })).status).toBe(409);
      const closed = await t.call(w.a.student, "GET", R.activityRun(classId()));
      expect((closed.body as any).run.status).toBe("ENDED");
      expect((closed.body as any).mcq).toMatchObject({ canSubmit: false, correctOptionIds: ["opt-b"], finalScore: 5 });

      // The queue's grid and the student's own pill know about it.
      const progress = await t.call(w.a.coach, "GET", R.activityQueueProgress(classId(), queueId));
      expect((progress.body as any).cells[queue.items[0].id][w.a.student.id].state).toBe("CORRECT");
      const mine = await t.call(w.a.student, "GET", R.activityQueueCurrent(classId()));
      expect((mine.body as any).queue.mine[0]).toMatchObject({ kind: "MCQ", responded: true });
    });
  });

  describe("Playout in class", () => {
    it("gives each student their own game; nothing crosses between them", async () => {
      const activityId = await createActivity(playoutBody({ title: "Independent" }));
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);

      const mine = await startGame(w.a.student, runId);
      const theirs = await startGame(classmate, runId);
      expect(mine.id).not.toBe(theirs.id);
      expect(mine).toMatchObject({ fen: KRK, ply: 0, studentColor: "white", turn: "STUDENT" });

      // A student opening twice (reload, second tab) finds the same game.
      expect((await startGame(w.a.student, runId)).id).toBe(mine.id);

      const moved = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, mine.id), { ply: 0, uci: "a1a5" });
      expect(moved.status).toBe(200);
      const game = (moved.body as any).game;
      expect(game.ply).toBe(2);
      expect(game.moves.map((m: any) => m.by)).toEqual(["STUDENT", "COMPUTER"]);
      expect(game.turn).toBe("STUDENT");
      expect(game.pgn).toContain("Ra5+");

      // The classmate's board has not moved at all.
      const untouched = await t.prisma.liveClassPlayoutGame.findUniqueOrThrow({ where: { id: theirs.id } });
      expect(untouched).toMatchObject({ fen: KRK, ply: 0 });

      // Another student's game doesn't exist as far as this student can tell, on any route.
      for (const path of [R.playoutMove, R.playoutContinue, R.playoutHint, R.playoutRetry, R.playoutResign]) {
        const res = await t.call(w.a.student, "POST", path(classId(), runId, theirs.id), path === R.playoutMove ? { ply: 0, uci: "a1a5" } : undefined);
        expect(res.status).toBe(404);
      }
      expect((await t.call(w.a.student, "GET", R.activityRunGame(classId(), runId, theirs.id))).status).toBe(403);
      // The student's view has only their own game.
      const state = await t.call(w.a.student, "GET", R.activityRun(classId()));
      expect((state.body as any).playout.game.id).toBe(mine.id);
      expect(JSON.stringify(state.body)).not.toContain(theirs.id);
      expect(JSON.stringify(state.body)).not.toContain("skillLevel");
    });

    it("validates moves on the server and survives duplicates and stale boards", async () => {
      const activityId = await createActivity(playoutBody({ title: "Validation" }));
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      const game = await startGame(w.a.student, runId);
      const move = (body: unknown) => t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), body);

      expect((await move({ ply: 0, uci: "a1b2" })).status).toBe(400); // illegal for a rook
      expect((await move({ ply: 0, uci: "e5e4" })).status).toBe(400); // the computer's king
      expect((await move({ ply: 0, uci: "nonsense" })).status).toBe(400);
      expect((await move({ ply: 7, uci: "a1a5" })).status).toBe(409); // a board that isn't this one

      const first = await move({ ply: 0, uci: "a1a2" });
      expect(first.status).toBe(200);
      const plyAfter = (first.body as any).game.ply;
      // The same request again (a lost response) changes nothing.
      const again = await move({ ply: 0, uci: "a1a2" });
      expect(again.status).toBe(200);
      expect((again.body as any).game.ply).toBe(plyAfter);
      expect((again.body as any).game.moves.filter((m: any) => m.by === "STUDENT")).toHaveLength(1);
      // A different move from the old ply is stale, not a second move.
      expect((await move({ ply: 0, uci: "a1a3" })).status).toBe(409);

      // Two moves racing from one ply: exactly one lands.
      engineMove = () => null;
      const raced = await Promise.all([move({ ply: plyAfter, uci: "a2a3" }), move({ ply: plyAfter, uci: "a2a4" })]);
      expect(raced.map((r) => r.status).sort()).toEqual([200, 409]);
      const stored = await t.prisma.liveClassPlayoutGame.findUniqueOrThrow({ where: { id: game.id } });
      expect(stored.ply).toBe(plyAfter + 1);
    });

    it("reaches a real checkmate goal, and scores and records the game", async () => {
      const activityId = await createActivity(playoutBody({ title: "Mate in one" }, { hints: ["Back rank"], scoring: { goalPoints: 10, hintPenalty: 2 }, startFen: MATE_IN_ONE }));
      const { queue, queueId, runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      const game = await startGame(w.a.student, runId);

      const hint = await t.call(w.a.student, "POST", R.playoutHint(classId(), runId, game.id));
      expect((hint.body as any).game.hints).toEqual(["Back rank"]);
      expect((await t.call(w.a.student, "POST", R.playoutHint(classId(), runId, game.id))).status).toBe(400);

      const moved = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "a1a8" });
      const done = (moved.body as any).game;
      expect(done).toMatchObject({ endReason: "GOAL_ACHIEVED", goalAchieved: true, result: "WIN", score: 8, status: "COMPLETED", studentMoves: 1 });
      expect(done.pgn).toContain("Ra8#");
      expect(done.fen).not.toBe(done.startFen);
      // A reached goal is done: no retry that could hide it from the coach's board.
      expect((moved.body as any).canRetry).toBe(false);
      expect((await t.call(w.a.student, "POST", R.playoutRetry(classId(), runId, game.id))).status).toBe(400);
      // A finished game takes no more moves.
      expect((await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 1, uci: "a8a7" })).status).toBe(409);

      // The coach's monitor and grid see it; the monitor sends no move lists.
      const monitor = await t.call(w.a.coach, "GET", R.activityRunMonitor(classId(), runId));
      const entry = (monitor.body as any).entries.find((e: any) => e.studentId === w.a.student.id);
      expect(entry).toMatchObject({ goalAchieved: true, lastMoveSan: "Ra8#", status: "COMPLETED", studentMoves: 1 });
      expect(entry.moves).toBeUndefined();
      expect((monitor.body as any).entries.find((e: any) => e.studentId === classmate.id)).toMatchObject({ gameId: null, status: "PENDING" });
      const progress = await t.call(w.a.coach, "GET", R.activityQueueProgress(classId(), queueId));
      expect((progress.body as any).cells[queue.items[0].id][w.a.student.id].state).toBe("CORRECT");

      // One opened board gives the coach the moves and the PGN, and changes nothing.
      const before = await t.prisma.liveClassPlayoutGame.findUniqueOrThrow({ where: { id: game.id } });
      const detail = await t.call(w.a.coach, "GET", R.activityRunGame(classId(), runId, game.id));
      expect((detail.body as any).game.moves).toHaveLength(1);
      expect(await t.prisma.liveClassPlayoutGame.findUniqueOrThrow({ where: { id: game.id } })).toEqual(before);

      // Student history, as the student and as the coach.
      for (const [user, route] of [
        [w.a.student, API_ROUTES.progress.historyMine],
        [w.a.coach, API_ROUTES.progress.history(w.a.student.id)]
      ] as const) {
        const history = await t.call(user, "GET", `${route}?type=CLASS_PLAYOUT`);
        expect(history.status).toBe(200);
        const row = (history.body as any).entries.find((e: any) => e.title === "Mate in one");
        expect(row).toMatchObject({ detail: "Goal achieved", hintsUsed: 1, maxScore: 10, outcome: "CORRECT", score: 8 });
        expect(row.playout).toMatchObject({ goalAchieved: true, startFen: MATE_IN_ONE });
        expect(row.playout.pgn).toContain("Ra8#");
        expect(row.queue).toMatchObject({ position: 1 });
      }
      // ...and in the performance summary.
      const summary = await t.call(w.a.student, "GET", `${API_ROUTES.progress.summaryMine}?type=CLASS_PLAYOUT`);
      expect(summary.status).toBe(200);
    });

    it("lets the computer open when it plays first, and honours Black", async () => {
      const activityId = await createActivity(
        playoutBody({ title: "As Black" }, { startFen: "4k3/8/8/8/8/8/R7/4K3 w - - 0 1", studentColor: "black" , goal: { type: "DRAW" } })
      );
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      const game = await startGame(w.a.student, runId);
      expect(game).toMatchObject({ ply: 1, studentColor: "black", turn: "STUDENT" });
      expect(game.moves[0].by).toBe("COMPUTER");
    });

    it("keeps the game on the computer's move when the engine fails, and resumes on request", async () => {
      const activityId = await createActivity(playoutBody({ title: "Engine outage" }));
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      const game = await startGame(w.a.student, runId);

      engineMove = () => {
        throw new Error("pool down");
      };
      const stalled = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "a1a2" });
      expect(stalled.status).toBe(200);
      expect(stalled.body).toMatchObject({ engineRetry: true, game: { ply: 1, turn: "COMPUTER" } });
      // The student can't play the computer's move for it.
      expect((await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 1, uci: "e5e6" })).status).toBe(409);

      engineMove = null;
      const resumed = await t.call(w.a.student, "POST", R.playoutContinue(classId(), runId, game.id));
      expect(resumed.body).toMatchObject({ engineRetry: false, game: { ply: 2, turn: "STUDENT" } });
      // Reconnecting: the state read returns the latest position.
      const state = await t.call(w.a.student, "GET", R.activityRun(classId()));
      expect((state.body as any).playout.game).toMatchObject({ id: game.id, ply: 2 });
    });

    it("enforces restrictions, the clock, retries and giving up", async () => {
      const activityId = await createActivity(
        playoutBody(
          { title: "Restricted" },
          { maxAttempts: 2, restrictions: { lockedPieces: ["k"], maxStudentMoves: 2 }, timeLimitSeconds: 60 }
        )
      );
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      const game = await startGame(w.a.student, runId);
      expect(game.endsAt).toBeTruthy();

      expect((await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "e1e2" })).status).toBe(400);
      const one = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "a1a2" });
      expect((one.body as any).game.status).toBe("IN_PROGRESS");
      const two = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: (one.body as any).game.ply, uci: "a2a3" });
      // The limit is a failure, never a success: reaching a move count achieves nothing.
      expect((two.body as any).game).toMatchObject({ endReason: "MOVE_LIMIT", goalAchieved: false, score: 0, status: "COMPLETED" });

      const retried = await t.call(w.a.student, "POST", R.playoutRetry(classId(), runId, game.id));
      const second = (retried.body as any).game;
      expect(second).toMatchObject({ attemptNumber: 2, fen: KRK, ply: 0, status: "IN_PROGRESS" });
      expect((retried.body as any).canRetry).toBe(false);
      // A double click on Retry from the old game returns the new one, not a third.
      expect(((await t.call(w.a.student, "POST", R.playoutRetry(classId(), runId, game.id))).body as any).game.id).toBe(second.id);
      expect((await t.call(w.a.student, "POST", R.playoutRetry(classId(), runId, second.id))).status).toBe(400);

      // The clock runs out while away: the move that comes back is refused as a move, and the game ends.
      await t.prisma.liveClassPlayoutGame.update({ data: { endsAt: new Date(Date.now() - 60_000) }, where: { id: second.id } });
      const late = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, second.id), { ply: 0, uci: "a1a2" });
      expect((late.body as any).game).toMatchObject({ endReason: "TIME_UP", goalAchieved: false, ply: 0, status: "COMPLETED" });

      // Classmate gives up.
      const other = await startGame(classmate, runId);
      const resigned = await t.call(classmate, "POST", R.playoutResign(classId(), runId, other.id));
      expect((resigned.body as any).game).toMatchObject({ endReason: "RESIGNED", goalAchieved: false, result: "LOSS" });

      // And a clock that ran out with the student gone is settled by the coach's monitor.
      const third = await t.prisma.liveClassPlayoutGame.update({ data: { status: "IN_PROGRESS", endReason: null, finishedAt: null, result: null, endsAt: new Date(Date.now() - 60_000) }, where: { id: other.id } });
      await t.call(w.a.coach, "GET", R.activityRunMonitor(classId(), runId));
      expect(await t.prisma.liveClassPlayoutGame.findUnique({ where: { id: third.id } })).toMatchObject({ endReason: "TIME_UP", status: "COMPLETED" });
    });

    it("moving on closes open games with their position kept; the class ending does too", async () => {
      const first = await createActivity(playoutBody({ title: "Cut off" }));
      const second = await createActivity(mcqBody({ title: "After" }));
      const { queue, queueId, runId } = await launch([
        { activityId: first, kind: "PLAYOUT" },
        { activityId: second, kind: "MCQ" }
      ]);
      const game = await startGame(w.a.student, runId);
      const moved = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "a1a2" });
      const position = (moved.body as any).game.fen;

      const advanced = await t.call(w.a.coach, "POST", R.activityQueueAdvance(classId(), queueId), { fromItemId: queue.items[0].id });
      expect(advanced.status).toBe(201);
      expect((advanced.body as any).queue.items[1].activityRunId).toBeTruthy();

      const closed = await t.prisma.liveClassPlayoutGame.findUniqueOrThrow({ where: { id: game.id } });
      expect(closed).toMatchObject({ endReason: "ACTIVITY_ENDED", fen: position, goalAchieved: false, status: "COMPLETED" });
      expect((await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: closed.ply, uci: "a2a3" })).status).toBe(409);

      // History: cut off is unfinished, not wrong; and nobody's accuracy suffers for it.
      const history = await t.call(w.a.student, "GET", `${API_ROUTES.progress.historyMine}?type=CLASS_PLAYOUT`);
      expect((history.body as any).entries.find((e: any) => e.title === "Cut off")).toMatchObject({ completed: false, outcome: "INCOMPLETE" });
    });

    it("leaves the student's game alone when the coach disappears", async () => {
      const activityId = await createActivity(playoutBody({ title: "Coach gone" }));
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      const game = await startGame(w.a.student, runId);
      // Nothing on the student's path depends on the coach: LiveKit says the room is empty.
      const moved = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "a1a5" });
      expect(moved.status).toBe(200);
      expect((moved.body as any).game.ply).toBe(2);
      // And the coach reconnecting gets every board back from REST.
      const monitor = await t.call(w.a.coach, "GET", R.activityRunMonitor(classId(), runId));
      expect((monitor.body as any).entries.find((e: any) => e.studentId === w.a.student.id)).toMatchObject({ gameId: game.id, ply: 2 });
    });

    it("a frozen run ignores edits to the library item, and survives it being deleted", async () => {
      const activityId = await createActivity(playoutBody({ title: "Frozen" }));
      const { runId } = await launch([{ activityId, kind: "PLAYOUT" }]);
      await t.call(w.admin, "PATCH", API_ROUTES.puzzles.activity(activityId), { config: { ...playoutBody().config, startFen: MATE_IN_ONE }, title: "Renamed" });
      const game = await startGame(w.a.student, runId);
      expect(game.startFen).toBe(KRK);
      const run = await t.prisma.liveClassActivityRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run.title).toBe("Frozen");

      await t.call(w.admin, "DELETE", API_ROUTES.puzzles.activity(activityId));
      const moved = await t.call(w.a.student, "POST", R.playoutMove(classId(), runId, game.id), { ply: 0, uci: "a1a5" });
      expect(moved.status).toBe(200);
    });

    it("refuses two running activities at the database", async () => {
      const base = { configJson: {}, difficulty: "EASY" as const, kind: "MCQ" as const, title: "x" };
      await t.prisma.liveClassActivityRun.updateMany({ data: { status: "ENDED" }, where: { liveClassId: w.b.liveClass.id } });
      await t.prisma.liveClassActivityRun.create({ data: { ...base, liveClassId: w.b.liveClass.id } });
      await expect(t.prisma.liveClassActivityRun.create({ data: { ...base, liveClassId: w.b.liveClass.id } })).rejects.toMatchObject({ code: "P2002" });
    });

    it("exports a student's answers and games with their data", async () => {
      const res = await t.call(w.a.student, "GET", API_ROUTES.privacy.dataExport);
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).toContain("playoutGames");
      expect(text).toContain("mcqAttempts");
    });
  });
});
