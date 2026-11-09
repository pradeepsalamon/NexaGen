import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  type TournamentBracketResponse,
  type TournamentGameResponse,
  type TournamentLiveDto,
  type TournamentResponse,
  type TournamentRoundsResponse,
  type TournamentStandingsResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { TournamentScheduler } from "./tournament.scheduler";

// Phases 3–5 of docs/TOURNAMENTS.md end to end against the real app: whole
// tournaments of every format played by simulated players over HTTP, with
// results processed by the server, rounds progressing, standings updating,
// concurrency, the clock sweeper, the spectator delay, host decisions and
// withdrawals.
describe("playing tournaments (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let coach: User;
  let outsiderCoach: User;
  let students: User[];

  const DAY = 24 * 60 * 60 * 1000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();
  const nexa = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "spec", fn);
  const userOf = (userId: string) => [admin, coach, ...students].find((u) => u.id === userId)!;

  const active = async (role: UserRole, rating?: number) => {
    const user = await t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });
    if (role === UserRole.STUDENT) await t.prisma.studentProfile.create({ data: { chessRating: rating ?? null, parentName: "Parent", userId: user.id } });
    return user;
  };

  /** A published tournament hosted by the coach, with `count` students entered. */
  const setup = async (over: Record<string, unknown>, count: number) => {
    const created = await t.call(admin, "POST", API_ROUTES.tournaments.create, {
      name: "Sim",
      startsAt: inDays(5),
      timeControl: { incrementSeconds: 2, initialSeconds: 180 },
      ...over
    });
    expect(created.status).toBe(201);
    const id = (created.body as TournamentResponse).tournament.id;
    await t.call(admin, "PUT", API_ROUTES.tournaments.hosts(id), { hosts: [{ role: "HOST", userId: coach.id }] });
    await t.call(admin, "POST", API_ROUTES.tournaments.publish(id), {});
    const added = await t.call(admin, "POST", API_ROUTES.tournaments.players(id), { userIds: students.slice(0, count).map((s) => s.id) });
    expect(added.status).toBe(200);
    return id;
  };

  const rounds = async (id: string) => ((await t.call(admin, "GET", API_ROUTES.tournaments.rounds(id))).body as TournamentRoundsResponse);
  const detail = async (id: string) => ((await t.call(admin, "GET", API_ROUTES.tournaments.get(id))).body as TournamentResponse).tournament;
  const game = async (id: string, gameId: string, as: User = admin) => ((await t.call(as, "GET", API_ROUTES.tournaments.game(id, gameId))).body as TournamentGameResponse).game;

  /** Ends one game by the players' own actions: White resigns, Black resigns, or a draw by agreement. */
  const finishGame = async (id: string, gameId: string, how: "WHITE" | "BLACK" | "DRAW") => {
    const g = await game(id, gameId);
    const white = userOf(g.white.userId);
    const black = userOf(g.black!.userId);
    if (how === "DRAW") {
      expect((await t.call(white, "POST", API_ROUTES.tournaments.gameAction(id, gameId), { action: "OFFER_DRAW" })).status).toBe(200);
      return t.call(black, "POST", API_ROUTES.tournaments.gameAction(id, gameId), { action: "ACCEPT_DRAW" });
    }
    const loser = how === "WHITE" ? black : white;
    return t.call(loser, "POST", API_ROUTES.tournaments.gameAction(id, gameId), { action: "RESIGN" });
  };

  const playRound = async (id: string, number: number, pick: (board: number) => "WHITE" | "BLACK" | "DRAW") => {
    const round = (await rounds(id)).rounds.find((r) => r.number === number)!;
    for (const g of round.games.filter((x) => x.status === "ONGOING")) {
      expect((await finishGame(id, g.id, pick(g.board))).status).toBe(200);
    }
  };

  const tick = (now = new Date()) => nexa(() => t.app.get(TournamentScheduler).tickTenant(now));

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
    outsiderCoach = await active(UserRole.COACH);
    students = [];
    for (let i = 0; i < 9; i += 1) students.push(await active(UserRole.STUDENT, 1500 + i * 50));
  });

  afterAll(() => t?.close());

  describe("Swiss", () => {
    let id: string;

    it("only the host or an admin starts; the field is seeded by rating; round 1 is paired with a bye", async () => {
      id = await setup({ format: "SWISS", rounds: 3, roundBreakSec: 0 }, 7);
      expect((await t.call(outsiderCoach, "POST", API_ROUTES.tournaments.start(id))).status).toBe(403);
      expect((await t.call(students[0], "POST", API_ROUTES.tournaments.start(id))).status).toBe(403);
      const started = await t.call(coach, "POST", API_ROUTES.tournaments.start(id));
      expect(started.body).toMatchObject({ tournament: { phase: "LIVE", status: "LIVE" } });
      const r1 = (await rounds(id)).rounds[0];
      expect(r1.number).toBe(1);
      expect(r1.games).toHaveLength(4);
      const bye = r1.games.find((g) => g.black === null)!;
      expect(bye).toMatchObject({ byeKind: "FULL", status: "FINISHED", whiteHalfPoints: 2 });
      // The lowest seed (lowest rating) gets the bye: students[0] has the lowest rating.
      expect(bye.white.userId).toBe(students[0].id);
      // Top seed (highest rating, students[6]) plays on board 1 with White.
      expect(r1.games.find((g) => g.board === 1)!.white.userId).toBe(students[6].id);
      expect((await rounds(id)).totalRounds).toBe(3);
    });

    it("a move is server-validated, claimed on ply, and only the side to move may make it", async () => {
      const g = (await rounds(id)).rounds[0].games.find((x) => x.board === 1)!;
      const white = userOf(g.white.userId);
      const black = userOf(g.black!.userId);
      expect((await t.call(black, "POST", API_ROUTES.tournaments.gameMove(id, g.id), { ply: 0, uci: "e7e5" })).status).toBe(400);
      expect((await t.call(students[8], "POST", API_ROUTES.tournaments.gameMove(id, g.id), { ply: 0, uci: "e2e4" })).status).toBe(403);
      expect((await t.call(white, "POST", API_ROUTES.tournaments.gameMove(id, g.id), { ply: 0, uci: "e2e5" })).status).toBe(400);
      const [a, b] = await Promise.all([
        t.call(white, "POST", API_ROUTES.tournaments.gameMove(id, g.id), { ply: 0, uci: "e2e4" }),
        t.call(white, "POST", API_ROUTES.tournaments.gameMove(id, g.id), { ply: 0, uci: "e2e4" })
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const after = await game(id, g.id, white);
      expect(after).toMatchObject({ ply: 1, viewerColor: "white" });
      expect(after.firstMoveDeadline).not.toBeNull();
    });

    it("spectators see moves only after the delay; players and hosts see them live", async () => {
      const g = (await rounds(id)).rounds[0].games.find((x) => x.board === 1)!;
      const spectator = students[8]; // not entered
      // Not entered in a PUBLIC tournament: may watch.
      const delayed = await game(id, g.id, spectator);
      expect(delayed).toMatchObject({ delayed: true, moves: [], ply: 0, result: null });
      expect((await game(id, g.id, coach)).moves).toHaveLength(1);
    });

    it("a checkmate ends the game through the engine and scores it", async () => {
      const g = (await rounds(id)).rounds[0].games.find((x) => x.board === 1)!;
      const white = userOf(g.white.userId);
      const black = userOf(g.black!.userId);
      // 1. e4 (played) e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#
      const line: [User, string][] = [[black, "e7e5"], [white, "f1c4"], [black, "b8c6"], [white, "d1h5"], [black, "g8f6"], [white, "h5f7"]];
      for (const [i, [who, uci]] of line.entries()) {
        const res = await t.call(who, "POST", API_ROUTES.tournaments.gameMove(id, g.id), { ply: i + 1, uci });
        expect(res.status).toBe(200);
      }
      expect(await game(id, g.id)).toMatchObject({ endReason: "CHECKMATE", result: "WHITE_WON", status: "FINISHED", whiteHalfPoints: 2 });
      expect((await t.call(white, "GET", API_ROUTES.tournaments.myGame(id))).body).toEqual({ gameId: null });
      // Archived in the Game Library (in the background, after commit).
      let archived = null;
      for (let i = 0; i < 40 && !archived; i += 1) {
        archived = await nexa(() => t.prisma.chessGame.findFirst({ where: { sourceKey: `tournament:${g.id}` } }));
        if (!archived) await new Promise((r) => setTimeout(r, 50));
      }
      expect(archived).toMatchObject({ result: "1-0", source: "TOURNAMENT", whitePlayerId: white.id });
    });

    it("finishing the rest of round 1 at the same moment completes the round exactly once", async () => {
      const open = (await rounds(id)).rounds[0].games.filter((g) => g.status === "ONGOING");
      const results = await Promise.all(open.map((g, i) => finishGame(id, g.id, i % 2 === 0 ? "BLACK" : "DRAW")));
      expect(results.every((r) => r.status === 200)).toBe(true);
      const r1 = (await rounds(id)).rounds[0];
      expect(r1.status).toBe("COMPLETED");
      const completedAudit = await t.prisma.tournamentAuditLog.count({ where: { action: "ROUND_COMPLETED", tournamentId: id } });
      expect(completedAudit).toBe(1);
    });

    it("the standings follow the results", async () => {
      const standings = (await t.call(students[0], "GET", API_ROUTES.tournaments.standings(id))).body as TournamentStandingsResponse;
      expect(standings.pointsUnit).toBe("half-points");
      expect(standings.standings).toHaveLength(7);
      const total = standings.standings.reduce((s, r) => s + r.points, 0);
      expect(total).toBe(4 * 2); // three games + one full bye
      expect(standings.standings[0].rank).toBe(1);
    });

    it("two hosts asking for the next round at once get one round", async () => {
      const [a, b] = await Promise.all([
        t.call(coach, "POST", API_ROUTES.tournaments.nextRound(id)),
        t.call(admin, "POST", API_ROUTES.tournaments.nextRound(id))
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const all = await rounds(id);
      expect(all.rounds).toHaveLength(2);
      // Nobody is paired twice, and no pair from round 1 meets again.
      const r1Pairs = new Set(all.rounds[0].games.filter((g) => g.black).map((g) => [g.white.playerId, g.black!.playerId].sort().join()));
      const seen = new Set<string>();
      for (const g of all.rounds[1].games) {
        for (const p of [g.white.playerId, g.black?.playerId].filter(Boolean) as string[]) {
          expect(seen.has(p)).toBe(false);
          seen.add(p);
        }
        if (g.black) expect(r1Pairs.has([g.white.playerId, g.black.playerId].sort().join())).toBe(false);
      }
      // The round-1 bye doesn't get another.
      const r1Bye = all.rounds[0].games.find((g) => !g.black)!.white.playerId;
      expect(all.rounds[1].games.find((g) => !g.black)!.white.playerId).not.toBe(r1Bye);
    });

    it("a withdrawn player's game is forfeited and they are not paired again", async () => {
      const g = (await rounds(id)).rounds[1].games.find((x) => x.black && x.status === "ONGOING")!;
      const leaving = g.white.playerId;
      const res = await t.call(coach, "POST", API_ROUTES.tournaments.withdrawPlayer(id, leaving), { reason: "Unwell", status: "WITHDRAWN" });
      expect(res.status).toBe(200);
      expect(await game(id, g.id)).toMatchObject({ endReason: "FORFEIT", result: "BLACK_WON" });
      await playRound(id, 2, () => "WHITE");
      // The break is 0: the scheduler starts round 3 on its own.
      await tick();
      const r3 = (await rounds(id)).rounds[2];
      expect(r3).toBeDefined();
      expect(r3.games.some((x) => x.white.playerId === leaving || x.black?.playerId === leaving)).toBe(false);
    });

    it("a host corrects a result with a reason; a stale version is refused; the standings move", async () => {
      const finished = (await rounds(id)).rounds[0].games.find((g) => g.black && g.result === "DRAW")!;
      const before = await game(id, finished.id);
      expect((await t.call(students[1], "POST", API_ROUTES.tournaments.gameDecision(id, finished.id), { reason: "Wrong", result: "WHITE_WON", version: before.version })).status).toBe(403);
      const ok = await t.call(coach, "POST", API_ROUTES.tournaments.gameDecision(id, finished.id), { reason: "Arbiter ruling", result: "WHITE_WON", version: before.version });
      expect(ok.status).toBe(200);
      expect((ok.body as TournamentGameResponse).game).toMatchObject({ result: "WHITE_WON", resultSource: "CORRECTION" });
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.gameDecision(id, finished.id), { reason: "Again", result: "DRAW", version: before.version })).status).toBe(409);
      const audit = await t.prisma.tournamentAuditLog.findFirst({ where: { action: "RESULT_CORRECTED", tournamentId: id } });
      expect(audit).toMatchObject({ actorId: coach.id, reason: "Arbiter ruling" });
    });

    it("after the last round the tournament completes; cached standings equal a recomputation", async () => {
      await playRound(id, 3, (board) => (board % 2 === 0 ? "DRAW" : "BLACK"));
      expect(await detail(id)).toMatchObject({ status: "COMPLETED" });
      const cached = (await t.call(admin, "GET", API_ROUTES.tournaments.standings(id))).body as TournamentStandingsResponse;
      const recomputed = (await t.call(admin, "POST", API_ROUTES.tournaments.recomputeStandings(id))).body as TournamentStandingsResponse;
      expect(recomputed.standings.map((s) => [s.playerId, s.points, s.rank])).toEqual(cached.standings.map((s) => [s.playerId, s.points, s.rank]));
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.publishResults(id))).status).toBe(200);
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.publishResults(id))).status).toBe(409);
    });
  });

  describe("round robin", () => {
    it("everyone plays everyone once", async () => {
      const id = await setup({ format: "ROUND_ROBIN", rounds: 1, roundBreakSec: 0 }, 4);
      await t.call(admin, "POST", API_ROUTES.tournaments.start(id));
      expect((await rounds(id)).totalRounds).toBe(3);
      for (let r = 1; r <= 3; r += 1) {
        await playRound(id, r, (board) => (board === 1 ? "WHITE" : "DRAW"));
        if (r < 3) await tick();
      }
      const all = await rounds(id);
      const pairs = all.rounds.flatMap((r) => r.games).map((g) => [g.white.playerId, g.black!.playerId].sort().join());
      expect(new Set(pairs).size).toBe(6);
      expect(await detail(id)).toMatchObject({ status: "COMPLETED" });
    });
  });

  describe("knockout", () => {
    it("byes go to the top seeds, winners advance, one champion", async () => {
      const id = await setup({ format: "KNOCKOUT", knockoutConfig: { gamesPerMatch: 1, tiebreak: "SUDDEN_DEATH" } }, 5);
      await t.call(admin, "POST", API_ROUTES.tournaments.start(id));
      let bracket = (await t.call(admin, "GET", API_ROUTES.tournaments.bracket(id))).body as TournamentBracketResponse;
      expect(bracket.rounds).toBe(3);
      expect(bracket.matches.filter((m) => m.bracketRound === 1 && m.decidedBy === "BYE")).toHaveLength(3);
      // Keep playing whatever is in progress (White wins; a draw goes to sudden death) until done.
      for (let guard = 0; guard < 20; guard += 1) {
        const live = (await t.call(admin, "GET", API_ROUTES.tournaments.live(id))).body as TournamentLiveDto;
        if (live.tournament.status === "COMPLETED") break;
        for (const [i, g] of live.ongoingGames.entries()) await finishGame(id, g.id, guard === 0 && i === 0 ? "DRAW" : "WHITE");
      }
      expect(await detail(id)).toMatchObject({ status: "COMPLETED" });
      bracket = (await t.call(admin, "GET", API_ROUTES.tournaments.bracket(id))).body as TournamentBracketResponse;
      const final = bracket.matches.find((m) => m.bracketRound === 3)!;
      expect(final.status).toBe("DECIDED");
      const standings = (await t.call(admin, "GET", API_ROUTES.tournaments.standings(id))).body as TournamentStandingsResponse;
      expect(standings.standings[0]).toMatchObject({ playerId: final.winnerPlayerId, rank: 1 });
      expect(standings.standings.filter((s) => s.rank === 1)).toHaveLength(1);
    });
  });

  describe("arena", () => {
    it("pairs the pool on every tick, scores streaks and berserk, and ends when time is up", async () => {
      const id = await setup({ arenaConfig: { berserk: true, streaks: true }, arenaDurationMin: 30, format: "ARENA" }, 4);
      await t.call(admin, "POST", API_ROUTES.tournaments.start(id));
      let live = (await t.call(students[0], "GET", API_ROUTES.tournaments.live(id))).body as TournamentLiveDto;
      expect(live.ongoingGames).toHaveLength(2);
      expect(live.me).toMatchObject({ arenaPaused: false });
      // Berserk before the first move halves the clock.
      const first = live.ongoingGames[0];
      const whiteUser = userOf(first.white.userId);
      const berserk = await t.call(whiteUser, "POST", API_ROUTES.tournaments.gameAction(id, first.id), { action: "BERSERK" });
      expect((berserk.body as TournamentGameResponse).game.clock.whiteMs).toBe(90_000);
      for (const g of live.ongoingGames) await finishGame(id, g.id, "WHITE");
      await tick();
      live = (await t.call(admin, "GET", API_ROUTES.tournaments.live(id))).body as TournamentLiveDto;
      expect(live.ongoingGames).toHaveLength(2);
      // A player who leaves the pool isn't paired again.
      const leaver = userOf(live.ongoingGames[0].black!.userId);
      expect((await t.call(leaver, "POST", API_ROUTES.tournaments.arenaLeave(id))).body).toEqual({ paused: true });
      for (const g of live.ongoingGames) await finishGame(id, g.id, "WHITE");
      await tick();
      live = (await t.call(admin, "GET", API_ROUTES.tournaments.live(id))).body as TournamentLiveDto;
      expect(live.ongoingGames.some((g) => g.white.userId === leaver.id || g.black?.userId === leaver.id)).toBe(false);
      const standings = (await t.call(admin, "GET", API_ROUTES.tournaments.standings(id))).body as TournamentStandingsResponse;
      expect(standings.pointsUnit).toBe("arena-points");
      // End: the host stops it; games in play still count; it completes when they finish.
      await t.call(coach, "POST", API_ROUTES.tournaments.finish(id));
      for (const g of live.ongoingGames) await finishGame(id, g.id, "BLACK");
      expect(await detail(id)).toMatchObject({ status: "COMPLETED" });
    });
  });

  describe("the clock", () => {
    it("a player who never moves loses by no-show; a flag loses on time", async () => {
      const id = await setup({ format: "SWISS", rounds: 2 }, 4);
      await t.call(admin, "POST", API_ROUTES.tournaments.start(id));
      const [g1, g2] = (await rounds(id)).rounds[0].games;
      // g2: both make a first move, then White runs out of time.
      const w2 = userOf(g2.white.userId);
      const b2 = userOf(g2.black!.userId);
      await t.call(w2, "POST", API_ROUTES.tournaments.gameMove(id, g2.id), { ply: 0, uci: "e2e4" });
      await t.call(b2, "POST", API_ROUTES.tournaments.gameMove(id, g2.id), { ply: 1, uci: "e7e5" });
      // Nobody moves for 4 minutes (3 + 2 clock; the first-move limit is 60 s).
      await tick(new Date(Date.now() + 4 * 60_000));
      expect(await game(id, g1.id)).toMatchObject({ endReason: "NO_SHOW", result: "BLACK_WON" });
      expect(await game(id, g2.id)).toMatchObject({ endReason: "TIMEOUT", result: "BLACK_WON" });
      expect((await rounds(id)).rounds[0].status).toBe("COMPLETED");
    });
  });
});
