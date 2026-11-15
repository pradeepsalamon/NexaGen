import {
  API_ROUTES,
  type PublicTournamentLiveDto,
  type TournamentCommentaryListResponse,
  type TournamentCommentaryResponse,
  type TournamentResponse,
  type TournamentRoundsResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Phases 6–7 of docs/TOURNAMENTS.md: host commentary (types, delay release,
// own-game filtering, idempotency, pin, moderation, featured), the real-time
// token, and the anonymous public projection.
describe("tournament broadcasting and public spectating (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let host: User;
  let commentator: User;
  let students: User[];
  let id: string;
  let gameId: string;
  let playerOfGame: User;
  let bystander: User;

  const DAY = 24 * 60 * 60 * 1000;
  let seq = 0;
  const clientId = () => `client-${Date.now()}-${(seq += 1)}`;

  const active = async (role: UserRole, firstName?: string) => {
    const user = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE, ...(firstName ? { firstName, lastName: "Longsurname" } : {}) },
      where: { id: (await createUser(t.prisma, role)).id }
    });
    if (role === UserRole.STUDENT) await t.prisma.studentProfile.create({ data: { chessRating: 1200, parentName: "Parent", userId: user.id } });
    return user;
  };

  const feed = async (as: User | null) =>
    (await t.call(as, "GET", API_ROUTES.tournaments.commentary(id))).body as TournamentCommentaryListResponse;
  const post = (as: User, body: Record<string, unknown>) =>
    t.call(as, "POST", API_ROUTES.tournaments.commentary(id), { clientId: clientId(), ...body });

  const settings = (allowAnonymousSpectating: boolean) =>
    t.call(admin, "PUT", API_ROUTES.tournaments.adminSettings, {
      allowAnonymousSpectating,
      coachesMayCreate: true,
      coachesMayPublishPublic: true,
      defaultSpectatorDelaySec: 30,
      publicNameFormat: "FIRST_NAME_LAST_INITIAL"
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.ADMIN);
    host = await active(UserRole.COACH);
    commentator = await active(UserRole.COACH);
    students = [];
    for (let i = 0; i < 5; i += 1) students.push(await active(UserRole.STUDENT, `Kid${i}`));
    await settings(false);

    const created = await t.call(admin, "POST", API_ROUTES.tournaments.create, {
      format: "SWISS",
      name: "Broadcast Cup",
      rounds: 3,
      spectatorDelaySec: 30,
      startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
      timeControl: { incrementSeconds: 2, initialSeconds: 300 }
    });
    id = (created.body as TournamentResponse).tournament.id;
    await t.call(admin, "PUT", API_ROUTES.tournaments.hosts(id), {
      hosts: [
        { role: "HOST", userId: host.id },
        { role: "COMMENTATOR", userId: commentator.id }
      ]
    });
    await t.call(admin, "POST", API_ROUTES.tournaments.publish(id), {});
    await t.call(admin, "POST", API_ROUTES.tournaments.players(id), { userIds: students.slice(0, 4).map((s) => s.id) });
    await t.call(host, "POST", API_ROUTES.tournaments.start(id));
    const rounds = (await t.call(admin, "GET", API_ROUTES.tournaments.rounds(id))).body as TournamentRoundsResponse;
    const g = rounds.rounds[0].games[0];
    gameId = g.id;
    playerOfGame = students.find((s) => s.id === g.white.userId)!;
    bystander = students[4]; // not entered: a signed-in spectator
    // White plays 1. e4.
    await t.call(playerOfGame, "POST", API_ROUTES.tournaments.gameMove(id, gameId), { ply: 0, uci: "e2e4" });
  });

  afterAll(() => t?.close());

  describe("commentary", () => {
    it("hosts and commentators post; players and spectators can't", async () => {
      expect((await post(host, { body: "Welcome to the Broadcast Cup!", type: "ANNOUNCEMENT" })).status).toBe(201);
      expect((await post(commentator, { body: "Round 1 is under way.", type: "ROUND" })).status).toBe(201);
      expect((await post(students[0], { body: "hi", type: "GENERAL" })).status).toBe(403);
      expect((await post(bystander, { body: "hi", type: "GENERAL" })).status).toBe(403);
      const seen = await feed(bystander);
      expect(seen.items.map((i) => i.body)).toEqual(["Round 1 is under way.", "Welcome to the Broadcast Cup!"]);
      expect(seen.items[0].author).toMatchObject({ id: commentator.id });
    });

    it("a resend with the same clientId is the same message", async () => {
      const body = { body: "Once only", clientId: "same-client-id-123", type: "GENERAL" };
      const [a, b] = await Promise.all([
        t.call(host, "POST", API_ROUTES.tournaments.commentary(id), body),
        t.call(host, "POST", API_ROUTES.tournaments.commentary(id), body)
      ]);
      expect((a.body as TournamentCommentaryResponse).item.id).toBe((b.body as TournamentCommentaryResponse).item.id);
      expect(await t.prisma.tournamentCommentary.count({ where: { clientId: "same-client-id-123" } })).toBe(1);
    });

    it("commentary on the live position waits for the spectator delay; the players never see it during their game", async () => {
      const res = await post(host, { body: "1. e4 — the king's pawn.", gameId, ply: 1, type: "MOVE" });
      expect(res.status).toBe(201);
      const item = (res.body as TournamentCommentaryResponse).item;
      expect(item.released).toBe(false);
      expect(Date.parse(item.releaseAt)).toBeGreaterThan(Date.now() + 20_000);
      // Spectators: not yet. Hosts: yes, marked unreleased.
      expect((await feed(bystander)).items.some((i) => i.id === item.id)).toBe(false);
      expect((await feed(host)).items.find((i) => i.id === item.id)).toMatchObject({ released: false });
      // A player of that game: never while it is being played, even once released.
      await t.prisma.tournamentCommentary.update({ data: { releaseAt: new Date(Date.now() - 1000) }, where: { id: item.id } });
      expect((await feed(bystander)).items.some((i) => i.id === item.id)).toBe(true);
      expect((await feed(playerOfGame)).items.some((i) => i.id === item.id)).toBe(false);
      // Move commentary needs a played move.
      expect((await post(host, { body: "Later", gameId, ply: 40, type: "MOVE" })).status).toBe(400);
    });

    it("a position highlight is stored with its squares and arrows; bad squares are refused", async () => {
      const highlight = { arrows: [{ from: "e2", tone: "accent", to: "e4" }], squares: [{ square: "e4", tone: "primary" }] };
      const res = await post(host, { body: "Look at the centre", fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", highlight, type: "GENERAL" });
      expect((res.body as TournamentCommentaryResponse).item.highlight).toEqual(highlight);
      expect((await post(host, { body: "x", highlight: { arrows: [], squares: [{ square: "z9", tone: "primary" }] }, type: "GENERAL" })).status).toBe(400);
    });

    it("emergency messages are pinned; pins can be lifted", async () => {
      const res = await post(commentator, { body: "Short break: connection issues.", type: "EMERGENCY" });
      const item = (res.body as TournamentCommentaryResponse).item;
      expect(item.pinned).toBe(true);
      expect((await feed(bystander)).pinned.map((p) => p.id)).toContain(item.id);
      await t.call(host, "POST", API_ROUTES.tournaments.commentaryPin(id, item.id), { pinned: false });
      expect((await feed(bystander)).pinned.map((p) => p.id)).not.toContain(item.id);
    });

    it("only the HOST (or an admin) moderates; a hidden message is gone for everyone else", async () => {
      const res = await post(commentator, { body: "Oops, wrong tournament", type: "GENERAL" });
      const item = (res.body as TournamentCommentaryResponse).item;
      expect((await t.call(commentator, "POST", API_ROUTES.tournaments.commentaryHide(id, item.id), { reason: "Mistake" })).status).toBe(403);
      expect((await t.call(host, "POST", API_ROUTES.tournaments.commentaryHide(id, item.id), { reason: "Posted by mistake" })).status).toBe(200);
      expect((await feed(bystander)).items.some((i) => i.id === item.id)).toBe(false);
      expect((await feed(host)).items.find((i) => i.id === item.id)).toMatchObject({ hidden: true });
      expect(await t.prisma.tournamentAuditLog.count({ where: { action: "COMMENTARY_HIDDEN", targetId: item.id } })).toBe(1);
    });

    it("featuring a game records it in the feed", async () => {
      const res = await t.call(commentator, "PUT", API_ROUTES.tournaments.featured(id), { gameId });
      expect(res.status).toBe(200);
      const after = await feed(bystander);
      expect(after.featured).toEqual({ gameId, playerId: null });
      expect(after.items[0]).toMatchObject({ game: { id: gameId }, type: "FEATURED" });
      expect((await t.call(students[0], "PUT", API_ROUTES.tournaments.featured(id), { gameId })).status).toBe(403);
    });

    it("pages newest first with a cursor", async () => {
      for (let i = 0; i < 32; i += 1) await post(host, { body: `Note ${i}`, type: "GENERAL" });
      const first = await feed(bystander);
      expect(first.items).toHaveLength(30);
      expect(first.nextCursor).not.toBeNull();
      const next = (await t.call(bystander, "GET", `${API_ROUTES.tournaments.commentary(id)}?cursor=${first.nextCursor}`)).body as TournamentCommentaryListResponse;
      expect(next.items.length).toBeGreaterThan(0);
      expect(next.items.some((i) => first.items.some((f) => f.id === i.id))).toBe(false);
      expect((await t.call(bystander, "GET", `${API_ROUTES.tournaments.commentary(id)}?cursor=junk`)).status).toBe(400);
    });
  });

  describe("real time", () => {
    it("gives a viewer a hidden, receive-only token for the academy's room", async () => {
      const res = await t.call(bystander, "POST", API_ROUTES.tournaments.realtimeToken(id));
      expect(res.status).toBe(200);
      const body = res.body as { enabled: boolean; room: string; token: string };
      expect(body.enabled).toBe(true);
      expect(body.room).toBe(`tournament-tenant_nexa-${id}`);
      const claims = JSON.parse(Buffer.from(body.token.split(".")[1], "base64url").toString("utf8")) as {
        sub: string;
        video: { canPublish: boolean; canPublishData: boolean; hidden: boolean; room: string };
      };
      expect(claims.sub).toBe(`tu_${bystander.id}`);
      expect(claims.video).toMatchObject({ canPublish: false, canPublishData: false, hidden: true, room: body.room });
    });
  });

  describe("anonymous public projection", () => {
    it("is a 404 until the academy allows anonymous spectating", async () => {
      expect((await t.call(null, "GET", API_ROUTES.publicTournaments.get(id))).status).toBe(404);
      expect((await t.call(null, "GET", API_ROUTES.publicTournaments.list)).status).toBe(404);
    });

    it("then shows a PUBLIC tournament with no user ids, avatars or full names", async () => {
      await settings(true);
      const live = await t.call(null, "GET", API_ROUTES.publicTournaments.live(id));
      expect(live.status).toBe(200);
      const text = JSON.stringify(live.body);
      for (const s of students) expect(text).not.toContain(s.id);
      expect(text).not.toContain("userId");
      expect(text).not.toContain("avatarUrl");
      expect(text).not.toContain("Longsurname");
      expect(text).toContain("Kid0 L.");
      const body = live.body as PublicTournamentLiveDto;
      expect(body.tournament.hosts.length).toBeGreaterThan(0);
      const standings = JSON.stringify((await t.call(null, "GET", API_ROUTES.publicTournaments.standings(id))).body);
      expect(standings).not.toContain("userId");
      expect(standings).not.toContain(students[0].id);
    });

    it("always shows games delayed, and only released commentary", async () => {
      const game = (await t.call(null, "GET", API_ROUTES.publicTournaments.game(id, gameId))).body as { game: { delayed: boolean; moves: unknown[] } };
      expect(game.game).toMatchObject({ delayed: true, moves: [] });
      const commentary = JSON.stringify((await t.call(null, "GET", API_ROUTES.publicTournaments.commentary(id))).body);
      expect(commentary).not.toContain("Oops, wrong tournament");
      expect(commentary).not.toContain(host.id);
      const token = (await t.call(null, "POST", API_ROUTES.publicTournaments.realtimeToken(id))).body as { enabled: boolean; token: string };
      expect(token.enabled).toBe(true);
      expect(JSON.parse(Buffer.from(token.token.split(".")[1], "base64url").toString("utf8")).sub).toMatch(/^anon_/);
    });

    it("never shows a private tournament or a draft", async () => {
      const privateOne = await t.call(admin, "POST", API_ROUTES.tournaments.create, {
        format: "SWISS",
        name: "Private event",
        rounds: 3,
        startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
        timeControl: { incrementSeconds: 0, initialSeconds: 300 },
        visibility: "PRIVATE"
      });
      const privateId = (privateOne.body as TournamentResponse).tournament.id;
      expect((await t.call(null, "GET", API_ROUTES.publicTournaments.get(privateId))).status).toBe(404);
      await t.call(admin, "POST", API_ROUTES.tournaments.publish(privateId), {});
      expect((await t.call(null, "GET", API_ROUTES.publicTournaments.get(privateId))).status).toBe(404);
      const list = (await t.call(null, "GET", API_ROUTES.publicTournaments.list)).body as { items: { id: string }[] };
      expect(list.items.map((i) => i.id)).toEqual([id]);
    });
  });
});
