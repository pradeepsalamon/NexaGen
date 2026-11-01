/* eslint-disable @typescript-eslint/no-explicit-any */
import { getApiEnv } from "@nexa-chess/config/api";
import {
  API_ROUTES,
  type EngineLine,
  type Evaluation,
  type GameAnalysisStateResponse,
  type GameEngineAnalysis,
  type ImportPgnResponse,
  type StudentGameInsights
} from "@nexa-chess/types";
import { GameAnalysisStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createWorld } from "../test/integration/access/world";
import { resetDatabase } from "../test/integration/db";
import { GameAnalysisEngineService, replayGame } from "../stockfish/game-analysis-engine.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { GameAnalysisWorker, MAX_ATTEMPTS, STALE_AFTER_MS } from "./game-analysis.worker";
import { GameSourcesService } from "../game-sources/game-sources.service";

// Engine analysis end to end through the real app and Postgres: a student's
// own PGN upload, who may see and analyse it, the DB-backed job loop
// (claim / heartbeat / finish / stale sweep / cancel) with a scripted engine,
// the report, a missed tactic turned into a Smart Revision puzzle only its
// owner can open, and insight scoping.

const cp = (v: number): Evaluation => ({ cp: v, kind: "cp" });
const line = (rank: number, evaluation: Evaluation, pv: string[]): EngineLine => ({
  bound: "exact",
  depth: 20,
  evaluation,
  pvSan: [],
  pvUci: pv,
  rank
});

// 1...Ke8?? walks into Nc7+; 2.Ke2 misses it.
const FORK_PGN = `[Event "Club game"]
[White "me"]
[Black "rival"]
[Result "*"]
[SetUp "1"]
[FEN "r2k4/8/8/3N4/8/8/8/4K3 b - - 0 1"]

1... Ke8 2. Ke2 *`;
const FORK_LINES: Record<number, EngineLine[]> = {
  0: [line(1, cp(-150), ["d8d7"])],
  1: [line(1, cp(500), ["d5c7", "e8d7", "c7a8", "d7c8"]), line(2, cp(-150), ["e1e2"])],
  2: [line(1, cp(-150), ["e8d7"])]
};

describe("Game analysis (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let worker: GameAnalysisWorker;

  /** The scripted engine: every position gets the line for its ply (or a quiet 0.20). */
  function scriptEngine(lines: Record<number, EngineLine[]>) {
    jest.spyOn(t.app.get(GameAnalysisEngineService), "analyzeGame").mockImplementation(async (input) => {
      const replay = replayGame(input.startFen, input.movesUci);
      for (const p of replay.positions) {
        if (p.status === "TERMINAL") continue;
        p.lines = lines[p.ply] ?? [line(1, cp(20), [replay.moves[p.ply]?.uci ?? "e2e4"])];
        p.status = "ANALYSED";
      }
      const result: GameEngineAnalysis = {
        budgetExhausted: false,
        complete: true,
        config: { budgetMs: 1000, concurrency: 1, depth: "STANDARD", maxDepth: 18, movetimeMs: 800, multiPv: 2, rootMoveSearch: false },
        conventionVersion: "white-relative-v1",
        engine: "Scripted",
        moves: replay.moves,
        positions: replay.positions,
        startFen: replay.positions[0].fen,
        truncated: replay.truncated
      };
      return result;
    });
  }

  /** Claim and run one queued analysis synchronously. */
  async function runNext() {
    const row = await worker.claim();
    expect(row).not.toBeNull();
    await worker.run(row!);
    return t.prisma.gameAnalysis.findUniqueOrThrow({ where: { id: row!.id } });
  }

  async function importAs(user: any, pgn: string) {
    const res = await t.call(user, "POST", API_ROUTES.games.importPgn, { pgn, side: "AUTO", names: ["me"] });
    expect(res.status).toBe(201);
    return res.body as ImportPgnResponse;
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    worker = t.app.get(GameAnalysisWorker);
    jest.spyOn(t.app.get(StockfishService), "isAvailable").mockReturnValue(true);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
  });

  describe("student PGN upload", () => {
    it("imports each game, skips a duplicate, reports a broken one, and matches the student's side", async () => {
      const broken = `[Event "Bad"]\n\n1. e4 e5 2. Ke3 Ke6 3. Kxe5 *`;
      const res = await importAs(w.a.student, `${FORK_PGN}\n\n${FORK_PGN}\n\n${broken}`);
      expect(res).toMatchObject({ duplicates: 1, imported: 1, unmatchedSide: 0 });
      expect(res.failed).toEqual([{ index: 2, reason: expect.any(String) }]);
      const game = await t.prisma.chessGame.findUniqueOrThrow({ where: { id: res.gameIds[0] } });
      expect(game).toMatchObject({ ownerId: w.a.student.id, source: "IMPORT", status: "COMPLETED", whitePlayerId: w.a.student.id });
    });

    it("refuses an upload over the game limit", async () => {
      const many = Array.from({ length: 101 }, (_, i) => `[Event "${i}"]\n\n1. e4 *`).join("\n\n");
      expect((await t.call(w.a.student, "POST", API_ROUTES.games.importPgn, { pgn: many })).status).toBe(400);
    });

    it("lets the owner and their coach see the game, nobody else", async () => {
      const game = await t.prisma.chessGame.findFirstOrThrow({ where: { ownerId: w.a.student.id } });
      expect((await t.call(w.a.student, "GET", API_ROUTES.games.get(game.id))).status).toBe(200);
      expect((await t.call(w.a.coach, "GET", API_ROUTES.games.get(game.id))).status).toBe(200);
      expect((await t.call(w.b.coach, "GET", API_ROUTES.games.get(game.id))).status).toBe(404);
      expect((await t.call(w.b.student, "GET", API_ROUTES.games.get(game.id))).status).toBe(404);
      expect((await t.call(w.admin, "GET", API_ROUTES.games.get(game.id))).status).toBe(200);
    });
  });

  describe("requesting analysis", () => {
    let gameId: string;
    beforeAll(async () => {
      gameId = (await t.prisma.chessGame.findFirstOrThrow({ where: { ownerId: w.a.student.id } })).id;
    });

    it("queues one analysis per game, moves and depth — a repeat returns the same job", async () => {
      const first = await t.call(w.a.student, "POST", API_ROUTES.gameAnalysis.forGame(gameId), { depth: "STANDARD" });
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ depth: "STANDARD", status: "QUEUED" });
      const again = await t.call(w.a.coach, "POST", API_ROUTES.gameAnalysis.forGame(gameId), {});
      expect((again.body as any).id).toBe((first.body as any).id);
    });

    it("hides the game from outsiders and refuses a game still being played", async () => {
      expect((await t.call(w.b.student, "POST", API_ROUTES.gameAnalysis.forGame(gameId), {})).status).toBe(404);
      expect((await t.call(w.b.coach, "GET", API_ROUTES.gameAnalysis.forGame(gameId))).status).toBe(404);
      const live = await t.prisma.chessGame.create({
        data: {
          blackName: "b",
          blackPlayerId: w.a.student.id,
          moveCount: 1,
          pgn: '[Result "*"]\n\n1. e4 *\n',
          source: "MATCH",
          startFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          status: "IN_PROGRESS",
          title: "Live",
          whiteName: "w"
        }
      });
      const res = await t.call(w.a.student, "POST", API_ROUTES.gameAnalysis.forGame(live.id), {});
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).toMatch(/once it has finished/);
    });

  });

  describe("the job loop", () => {
    it("claims, runs, stores the report and per-side rows, and is visible through GET", async () => {
      scriptEngine(FORK_LINES);
      const done = await runNext();
      expect(done).toMatchObject({ attempts: 1, engine: "Scripted", status: GameAnalysisStatus.COMPLETED });
      const sides = await t.prisma.gameAnalysisSide.findMany({ orderBy: { side: "asc" }, where: { analysisId: done.id } });
      expect(sides.map((s) => [s.side, s.playerId])).toEqual([
        ["WHITE", w.a.student.id],
        ["BLACK", null]
      ]);
      const state = (await t.call(w.a.student, "GET", API_ROUTES.gameAnalysis.forGame(done.gameId))).body as GameAnalysisStateResponse;
      expect(state.report?.moves.map((m) => m.classification)).toEqual(["BLUNDER", "MISSED_WIN"]);
      expect(state.report?.tactics.opportunities[0]).toMatchObject({ outcome: "MISSED", primaryMotif: "FORK", side: "white" });
      expect(state.report?.revisionEligiblePlies).toEqual([1]);
    });

    it("never claims a row twice: concurrent claims split the queue", async () => {
      const game = await t.prisma.chessGame.findFirstOrThrow({ where: { ownerId: w.a.student.id } });
      const base = { configJson: {}, conventionVersion: "white-relative-v1", gameId: game.id };
      await t.prisma.gameAnalysis.createMany({
        data: [
          { ...base, depth: "QUICK", gameFingerprint: "f-q" },
          { ...base, depth: "DEEP", gameFingerprint: "f-d" }
        ]
      });
      const [a, b, c] = await Promise.all([worker.claim(), worker.claim(), worker.claim()]);
      const ids = [a, b, c].filter(Boolean).map((r) => r!.id);
      expect(new Set(ids).size).toBe(2);
      expect(ids).toHaveLength(2);
    });

    it("re-queues a run whose heartbeat stopped, and fails it after the last attempt", async () => {
      const old = new Date(Date.now() - STALE_AFTER_MS - 60_000);
      await t.prisma.gameAnalysis.updateMany({ data: { heartbeatAt: old }, where: { gameFingerprint: "f-q" } });
      await t.prisma.gameAnalysis.updateMany({ data: { attempts: MAX_ATTEMPTS, heartbeatAt: old }, where: { gameFingerprint: "f-d" } });
      (worker as any).running.clear();
      expect(await worker.sweepStale()).toEqual({ failed: 1, requeued: 1 });
      expect((await t.prisma.gameAnalysis.findFirstOrThrow({ where: { gameFingerprint: "f-q" } })).status).toBe("QUEUED");
      expect((await t.prisma.gameAnalysis.findFirstOrThrow({ where: { gameFingerprint: "f-d" } })).status).toBe("FAILED");
    });

    it("a run that lost its claim cannot finish it", async () => {
      const row = await worker.claim();
      await t.prisma.gameAnalysis.update({ data: { claimedAt: null, status: "QUEUED" }, where: { id: row!.id } });
      await worker.run(row!);
      expect((await t.prisma.gameAnalysis.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("QUEUED");
      await t.prisma.gameAnalysis.delete({ where: { id: row!.id } });
    });

    it("cancels a queued analysis", async () => {
      const game = await t.prisma.chessGame.findFirstOrThrow({ where: { ownerId: w.a.student.id } });
      await t.call(w.a.student, "POST", API_ROUTES.gameAnalysis.forGame(game.id), { depth: "QUICK" });
      const res = await t.call(w.a.student, "DELETE", API_ROUTES.gameAnalysis.forGame(game.id));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "CANCELLED" });
      expect((await t.call(w.a.student, "DELETE", API_ROUTES.gameAnalysis.forGame(game.id))).status).toBe(404);
    });
  });

  describe("missed tactic → Smart Revision", () => {
    let analysisId: string;
    beforeAll(async () => {
      analysisId = (await t.prisma.gameAnalysis.findFirstOrThrow({ where: { status: "COMPLETED" } })).id;
    });

    it("builds an owner-only puzzle and a revision item, once", async () => {
      const res = await t.call(w.a.student, "POST", API_ROUTES.gameAnalysis.tacticToRevision(analysisId, "1"));
      expect(res.status).toBe(201);
      const { puzzleId, alreadyAdded } = res.body as any;
      expect(alreadyAdded).toBe(false);
      const puzzle = await t.prisma.puzzle.findUniqueOrThrow({ include: { topic: true }, where: { id: puzzleId } });
      expect(puzzle).toMatchObject({ ownerId: w.a.student.id, source: "GAME", status: "PUBLISHED", visibility: "PRIVATE" });
      expect(puzzle.topic.slug).toBe("__game_analysis");
      expect(puzzle.solutionMovesJson).toEqual([{ san: "Nc7+", uci: "d5c7" }]);

      const again = await t.call(w.a.coach, "POST", API_ROUTES.gameAnalysis.tacticToRevision(analysisId, "1"));
      expect(again.status).toBe(201);
      expect(again.body).toMatchObject({ alreadyAdded: true, puzzleId });
      expect(await t.prisma.revisionItem.count({ where: { puzzleId } })).toBe(1);
    });

    it("opens the puzzle for its owner only", async () => {
      const puzzle = await t.prisma.puzzle.findFirstOrThrow({ where: { source: "GAME" } });
      expect((await t.call(w.a.student, "POST", API_ROUTES.puzzles.attempts(puzzle.id))).status).toBe(201);
      expect((await t.call(w.b.student, "POST", API_ROUTES.puzzles.attempts(puzzle.id))).status).toBe(404);
    });

    it("keeps it out of every coach's library, even the coach who created it", async () => {
      const puzzle = await t.prisma.puzzle.findFirstOrThrow({ where: { source: "GAME" } });
      await t.prisma.puzzle.update({ data: { createdById: w.a.coach.id, createdByRole: "COACH" }, where: { id: puzzle.id } });
      expect((await t.call(w.a.coach, "GET", API_ROUTES.puzzles.get(puzzle.id))).status).toBe(404);
      const listed = await t.call(w.a.coach, "GET", `${API_ROUTES.puzzles.list}?topicId=${puzzle.topicId}`);
      expect(JSON.stringify(listed.body)).not.toContain(puzzle.id);
      // Still the owner's to solve.
      expect((await t.call(w.a.student, "POST", API_ROUTES.puzzles.attempts(puzzle.id))).status).toBe(201);
    });

    it("refuses outsiders and positions that aren't missed tactics", async () => {
      expect((await t.call(w.b.student, "POST", API_ROUTES.gameAnalysis.tacticToRevision(analysisId, "1"))).status).toBe(404);
      expect((await t.call(w.b.coach, "POST", API_ROUTES.gameAnalysis.tacticToRevision(analysisId, "1"))).status).toBe(403);
      expect((await t.call(w.a.student, "POST", API_ROUTES.gameAnalysis.tacticToRevision(analysisId, "0"))).status).toBe(404);
      expect((await t.call(w.a.student, "POST", API_ROUTES.gameAnalysis.tacticToRevision(analysisId, "x"))).status).toBe(400);
    });
  });

  describe("insights", () => {
    it("are the student's own, their coach's and an admin's to read", async () => {
      const mine = await t.call(w.a.student, "GET", API_ROUTES.gameInsights.mine);
      expect(mine.status).toBe(200);
      expect(mine.body as StudentGameInsights).toMatchObject({ gamesAnalysed: 1, studentId: w.a.student.id });
      expect((await t.call(w.a.coach, "GET", API_ROUTES.gameInsights.student(w.a.student.id))).status).toBe(200);
      expect((await t.call(w.admin, "GET", API_ROUTES.gameInsights.student(w.a.student.id))).status).toBe(200);
      expect((await t.call(w.b.coach, "GET", API_ROUTES.gameInsights.student(w.a.student.id))).status).toBe(403);
      expect((await t.call(w.b.student, "GET", API_ROUTES.gameInsights.student(w.a.student.id))).status).toBe(403);
      expect((await t.call(w.a.coach, "GET", API_ROUTES.gameInsights.mine)).status).toBe(403);
    });

    it("lists analysed games with filters, refusing a malformed one", async () => {
      const list = await t.call(w.a.student, "GET", `${API_ROUTES.gameInsights.gamesMine}?side=white`);
      expect(list.status).toBe(200);
      expect((list.body as any).items).toHaveLength(1);
      expect((await t.call(w.a.student, "GET", `${API_ROUTES.gameInsights.gamesMine}?side=purple`)).status).toBe(400);
      expect((await t.call(w.a.student, "GET", `${API_ROUTES.gameInsights.gamesMine}?side=white&side=black`)).status).toBe(400);
    });
  });

  describe("online accounts", () => {
    it("stay switched off unless the operator enables them", async () => {
      const overview = await t.call(w.a.student, "GET", API_ROUTES.gameSources.overview);
      expect(overview.body).toMatchObject({ config: { externalImportEnabled: false } });
      const link = await t.call(w.a.student, "POST", API_ROUTES.gameSources.accounts, { provider: "LICHESS", username: "someone" });
      expect(link.status).toBe(503);
    });

    it("link → verify → sync with a scripted provider; only a verified link imports", async () => {
      const env = getApiEnv();
      env.EXTERNAL_GAME_IMPORT_ENABLED = true;
      try {
        const service = t.app.get(GameSourcesService);
        let bio = "";
        (service as any).providers.LICHESS = {
          fetchGames: async () => ({
            games: [{ externalId: "abcd1234", pgn: FORK_PGN.replace('"me"', '"MyLichess"'), playedAt: new Date(), url: "https://lichess.org/abcd1234" }],
            more: false,
            nextCursor: "123"
          }),
          fetchProfile: async () => ({ exists: true, verificationText: bio }),
          provider: "LICHESS"
        };
        const linked = await t.call(w.b.student, "POST", API_ROUTES.gameSources.accounts, { provider: "LICHESS", username: "MyLichess" });
        expect(linked.status).toBe(201);
        const account = linked.body as any;
        expect(account.verificationCode).toMatch(/^nexa-/);

        expect((await t.call(w.b.student, "POST", API_ROUTES.gameSources.sync(account.id), {})).status).toBe(403);
        expect((await t.call(w.b.student, "POST", API_ROUTES.gameSources.verify(account.id))).status).toBe(400);
        bio = `Hello ${account.verificationCode}`;
        expect((await t.call(w.b.student, "POST", API_ROUTES.gameSources.verify(account.id))).body).toMatchObject({ verified: true });

        const synced = await t.call(w.b.student, "POST", API_ROUTES.gameSources.sync(account.id), {});
        expect(synced.status).toBe(201);
        expect(synced.body).toMatchObject({ imported: 1 });
        const game = await t.prisma.chessGame.findFirstOrThrow({ where: { externalId: "abcd1234" } });
        expect(game).toMatchObject({ externalProvider: "LICHESS", ownerId: w.b.student.id, whitePlayerId: w.b.student.id });
        // Immediately again: the per-account cool-down applies.
        expect((await t.call(w.b.student, "POST", API_ROUTES.gameSources.sync(account.id), {})).status).toBe(429);

        // Another student can't verify the same username while it is held.
        const other = await t.call(w.a.student, "POST", API_ROUTES.gameSources.accounts, { provider: "LICHESS", username: "mylichess" });
        bio = `x ${(other.body as any).verificationCode}`;
        expect((await t.call(w.a.student, "POST", API_ROUTES.gameSources.verify((other.body as any).id))).status).toBe(409);
        // Nobody else can touch the account.
        expect((await t.call(w.a.student, "POST", API_ROUTES.gameSources.sync(account.id), {})).status).toBe(404);
        expect((await t.call(w.a.coach, "POST", API_ROUTES.gameSources.accounts, { provider: "LICHESS", username: "coachname" })).status).toBe(403);

        const unlinked = await t.call(w.b.student, "DELETE", `${API_ROUTES.gameSources.account(account.id)}?deleteGames=true`);
        expect(unlinked.body).toMatchObject({ deletedGames: 1 });
      } finally {
        env.EXTERNAL_GAME_IMPORT_ENABLED = false;
      }
    });

    it("auto sync follows the academy, then the per-student rule, then the student", async () => {
      const env = getApiEnv();
      env.EXTERNAL_GAME_IMPORT_ENABLED = true;
      const service = t.app.get(GameSourcesService);
      const original = (service as any).providers.CHESS_COM;
      const fetched: string[] = [];
      (service as any).providers.CHESS_COM = {
        fetchGames: async (username: string) => {
          fetched.push(username);
          return { games: [], more: false, nextCursor: null };
        },
        fetchProfile: async () => ({ exists: true, verificationText: "" }),
        provider: "CHESS_COM"
      };
      const pass = async () => {
        fetched.length = 0;
        await t.prisma.externalChessAccount.updateMany({ data: { lastAutoSyncAt: null, nextSyncAllowedAt: null }, where: {} });
        await service.runAutoSync(new AbortController().signal);
        return [...fetched].sort();
      };
      const [a, b] = [w.a.externalAccount, w.b.externalAccount];
      const switchTo = (who: any, id: string, autoSync: boolean) => t.call(who, "PATCH", API_ROUTES.gameSources.account(id), { autoSync });
      const setRule = (who: any, studentId: string, rule: string | null) => t.call(who, "PUT", API_ROUTES.gameSources.student(studentId), { rule });
      const setPolicy = (who: any, policy: string) => t.call(who, "PUT", API_ROUTES.gameSources.autoSyncPolicy, { policy });

      try {
        // Off by default, and a student's switch can't turn it on.
        expect(await pass()).toEqual([]);
        expect((await switchTo(w.a.student, a.id, true)).status).toBe(403);
        expect((await setPolicy(w.a.coach, "REQUIRED")).status).toBe(403);

        // Students choose: only the one who said yes.
        expect((await setPolicy(w.admin, "OPTIONAL")).status).toBe(200);
        expect((await t.call(w.a.student, "GET", API_ROUTES.gameSources.overview)).body).toMatchObject({ autoSyncRule: null, config: { autoSyncPolicy: "OPTIONAL" } });
        expect((await switchTo(w.a.student, a.id, true)).status).toBe(200);
        expect(await pass()).toEqual([a.username]);

        // A coach's ALWAYS turns it on for their student, who can't turn it off.
        expect((await setRule(w.b.coach, w.b.student.id, "ALWAYS")).status).toBe(200);
        expect((await switchTo(w.b.student, b.id, false)).status).toBe(403);
        expect(await pass()).toEqual([a.username, b.username].sort());

        // An admin's NEVER beats the student's yes, and the coach can't lift it.
        expect((await setRule(w.admin, w.a.student.id, "NEVER")).status).toBe(200);
        expect((await setRule(w.a.coach, w.a.student.id, null)).status).toBe(403);
        expect(await pass()).toEqual([b.username]);

        // REQUIRED covers every student, minus that exemption.
        expect((await setRule(w.b.coach, w.b.student.id, null)).status).toBe(200);
        expect((await setPolicy(w.admin, "REQUIRED")).status).toBe(200);
        expect(await pass()).toEqual([b.username]);
        expect((await setRule(w.admin, w.a.student.id, null)).status).toBe(200);
        expect((await setRule(w.a.coach, w.a.student.id, "NEVER")).status).toBe(200);
        expect(await pass()).toEqual([b.username]);

        // An archived student and an unproved link are never read.
        await t.prisma.user.update({ data: { status: "ARCHIVED" }, where: { id: w.b.student.id } });
        expect(await pass()).toEqual([]);
        await t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: w.b.student.id } });
        await t.prisma.externalChessAccount.update({ data: { verifiedAt: null, verificationCode: "nexa-secret" }, where: { id: b.id } });
        expect(await pass()).toEqual([]);

        // The code that proves ownership never reaches staff.
        const staffView = await t.call(w.b.coach, "GET", API_ROUTES.gameSources.student(w.b.student.id));
        expect((staffView.body as any).accounts[0]).toMatchObject({ verificationCode: null, verified: false });
        await t.prisma.externalChessAccount.update({ data: { verifiedAt: new Date(), verificationCode: null }, where: { id: b.id } });

        // Run now: the student's coach can, and the games stay the student's.
        fetched.length = 0;
        expect((await t.call(w.b.coach, "POST", API_ROUTES.gameSources.sync(b.id), { analyse: true })).body).toMatchObject({ analysesQueued: 0 });
        expect(fetched).toEqual([b.username]);

        // A sync that died mid-run doesn't block the scheduler for good.
        await t.prisma.externalChessAccount.update({
          data: { lastAutoSyncAt: null, nextSyncAllowedAt: null, syncStatus: "SYNCING", updatedAt: new Date(Date.now() - 11 * 60_000) },
          where: { id: b.id },
        });
        fetched.length = 0;
        await service.runAutoSync(new AbortController().signal);
        expect(fetched).toEqual([b.username]);

        // A day's wait after an attempt: a second pass right away reads nothing.
        await t.prisma.externalChessAccount.updateMany({ data: { nextSyncAllowedAt: null }, where: {} });
        await t.prisma.externalChessAccount.update({ data: { lastAutoSyncAt: new Date() }, where: { id: b.id } });
        fetched.length = 0;
        await service.runAutoSync(new AbortController().signal);
        expect(fetched).toEqual([]);
      } finally {
        env.EXTERNAL_GAME_IMPORT_ENABLED = false;
        (service as any).providers.CHESS_COM = original;
        await t.prisma.gameSourceSettings.deleteMany();
        await t.prisma.studentProfile.updateMany({ data: { gameAutoSyncRule: null, gameAutoSyncRuleByAdmin: false }, where: {} });
      }
    });
  });
});
