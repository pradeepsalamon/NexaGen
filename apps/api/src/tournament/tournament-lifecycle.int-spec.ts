import {
  API_ROUTES,
  type AddTournamentPlayersResponse,
  type PublishTournamentResponse,
  type TournamentListResponse,
  type TournamentPlayersResponse,
  type TournamentResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Phase 2 of docs/TOURNAMENTS.md against the real app: create, edit, publish
// (directly and through a TOURNAMENT_PUBLISH approval), visibility,
// registration (self, host, invitation, approval), capacity under concurrency,
// withdrawal, cancellation and deletion.
describe("tournament lifecycle and registration (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let coach: User;
  let otherCoach: User;
  let students: User[];
  let outsider: User;

  const DAY = 24 * 60 * 60 * 1000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

  const active = async (role: UserRole, profile?: { dateOfBirth?: Date; chessRating?: number }) => {
    const user = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, role)).id }
    });
    if (role === UserRole.STUDENT) {
      await t.prisma.studentProfile.create({
        data: { chessRating: profile?.chessRating ?? null, dateOfBirth: profile?.dateOfBirth ?? null, parentName: "Parent", userId: user.id }
      });
    }
    return user;
  };

  const body = (over: Record<string, unknown> = {}) => ({
    format: "SWISS",
    name: "Winter Swiss",
    rounds: 5,
    startsAt: inDays(10),
    timeControl: { incrementSeconds: 3, initialSeconds: 300 },
    ...over
  });

  const create = async (user: User, over: Record<string, unknown> = {}) => {
    const res = await t.call(user, "POST", API_ROUTES.tournaments.create, body(over));
    expect(res.status).toBe(201);
    return (res.body as TournamentResponse).tournament;
  };

  const publish = async (user: User, id: string) => {
    const res = await t.call(user, "POST", API_ROUTES.tournaments.publish(id), {});
    expect(res.status).toBe(200);
    return res.body as PublishTournamentResponse;
  };

  const setSettings = (over: Record<string, unknown>) =>
    t.call(admin, "PUT", API_ROUTES.tournaments.adminSettings, {
      allowAnonymousSpectating: false,
      coachesMayCreate: true,
      coachesMayPublishPublic: false,
      defaultSpectatorDelaySec: 15,
      publicNameFormat: "FIRST_NAME_LAST_INITIAL",
      ...over
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
    otherCoach = await active(UserRole.COACH);
    students = [];
    for (let i = 0; i < 6; i += 1) students.push(await active(UserRole.STUDENT, { chessRating: 1000 + i * 100 }));
    outsider = await active(UserRole.STUDENT, { chessRating: 900 });
    // The coach teaches the first five students.
    const batch = await t.prisma.batch.create({ data: { name: "Coach batch" } });
    await t.prisma.batchCoach.create({ data: { batchId: batch.id, coachId: coach.id } });
    for (const s of students.slice(0, 5)) await t.prisma.batchStudent.create({ data: { batchId: batch.id, studentId: s.id } });
  });

  afterAll(() => t?.close());

  describe("creating", () => {
    it("coaches can't create until the academy allows it; then they host what they create", async () => {
      await setSettings({ coachesMayCreate: false });
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.create, body())).status).toBe(403);
      expect((await t.call(coach, "GET", API_ROUTES.tournaments.capabilities)).body).toEqual({ canCreate: false });
      await setSettings({ coachesMayCreate: true });
      const tournament = await create(coach);
      expect(tournament).toMatchObject({ status: "DRAFT", viewer: { canManage: true, canModerate: true, publishPath: "APPROVAL" } });
      expect(tournament.hosts).toEqual([expect.objectContaining({ id: coach.id, role: "HOST" })]);
    });

    it("students can never create", async () => {
      expect((await t.call(students[0], "POST", API_ROUTES.tournaments.create, body())).status).toBe(403);
    });

    it("refuses a past start, a bad position and an unknown batch", async () => {
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.create, body({ startsAt: inDays(-1) }))).status).toBe(400);
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.create, body({ startFen: "not a fen" }))).status).toBe(400);
      expect(
        (await t.call(admin, "POST", API_ROUTES.tournaments.create, body({ eligibility: { allowUnrated: true, batchIds: ["nope"] } }))).status
      ).toBe(400);
    });

    it("an edit needs the current version; a stale one is a 409", async () => {
      const tournament = await create(admin);
      const ok = await t.call(admin, "PATCH", API_ROUTES.tournaments.update(tournament.id), { name: "Renamed", version: tournament.version });
      expect(ok.status).toBe(200);
      expect((ok.body as TournamentResponse).tournament).toMatchObject({ name: "Renamed", visibility: "PUBLIC", rounds: 5 });
      const stale = await t.call(admin, "PATCH", API_ROUTES.tournaments.update(tournament.id), { name: "Again", version: tournament.version });
      expect(stale.status).toBe(409);
    });
  });

  describe("visibility", () => {
    it("a draft is a 404 for students and other coaches", async () => {
      const draft = await create(coach);
      expect((await t.call(students[0], "GET", API_ROUTES.tournaments.get(draft.id))).status).toBe(404);
      expect((await t.call(otherCoach, "GET", API_ROUTES.tournaments.get(draft.id))).status).toBe(404);
      expect((await t.call(otherCoach, "PATCH", API_ROUTES.tournaments.update(draft.id), { name: "Other name", version: 1 })).status).toBe(404);
    });

    it("a published PRIVATE tournament is only for its players", async () => {
      const tournament = await create(admin, { visibility: "PRIVATE" });
      await publish(admin, tournament.id);
      expect((await t.call(students[0], "GET", API_ROUTES.tournaments.get(tournament.id))).status).toBe(404);
      await t.call(admin, "POST", API_ROUTES.tournaments.players(tournament.id), { userIds: [students[0].id] });
      expect((await t.call(students[0], "GET", API_ROUTES.tournaments.get(tournament.id))).status).toBe(200);
      expect((await t.call(students[1], "GET", API_ROUTES.tournaments.get(tournament.id))).status).toBe(404);
    });
  });

  describe("publishing", () => {
    it("a coach's PUBLIC tournament goes through an approval; any edit voids it", async () => {
      await setSettings({ coachesMayPublishPublic: false });
      const tournament = await create(coach);
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.publish(tournament.id), {})).status).toBe(400); // needs a reason
      const asked = await t.call(coach, "POST", API_ROUTES.tournaments.publish(tournament.id), { reason: "Academy-wide event" });
      expect(asked.body).toMatchObject({ outcome: "APPROVAL_REQUESTED", tournament: { status: "DRAFT" } });
      const requestId = (asked.body as { approvalRequestId: string }).approvalRequestId;
      expect((await t.call(coach, "GET", API_ROUTES.tournaments.get(tournament.id))).body).toMatchObject({
        tournament: { pendingPublishRequestId: requestId }
      });
      // A second request for the same tournament is refused while one is pending.
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.publish(tournament.id), { reason: "Again" })).status).toBe(409);

      // Edit after asking: the admin can't approve something they didn't see.
      await t.call(coach, "PATCH", API_ROUTES.tournaments.update(tournament.id), { name: "Changed", version: tournament.version });
      expect((await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(requestId), {})).status).toBe(409);
      expect((await t.call(admin, "POST", API_ROUTES.adminApprovals.reject(requestId), { reason: "Edited after asking" })).status).toBe(201);

      const fresh = (await t.call(coach, "GET", API_ROUTES.tournaments.get(tournament.id))).body as TournamentResponse;
      const again = await t.call(coach, "POST", API_ROUTES.tournaments.publish(tournament.id), { reason: "Final version" });
      const second = (again.body as { approvalRequestId: string }).approvalRequestId;
      expect(fresh.tournament.status).toBe("DRAFT");
      const approved = await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(second), {});
      expect(approved.status).toBe(201);
      expect((await t.call(coach, "GET", API_ROUTES.tournaments.get(tournament.id))).body).toMatchObject({
        tournament: { pendingPublishRequestId: null, status: "PUBLISHED" }
      });
      const audit = await t.prisma.tournamentAuditLog.findMany({ where: { tournamentId: tournament.id } });
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["PUBLISH_REQUESTED", "PUBLISHED"]));
    });

    it("with the academy permission the coach publishes directly; private ones always directly", async () => {
      await setSettings({ coachesMayPublishPublic: true });
      expect((await publish(coach, (await create(coach)).id)).outcome).toBe("PUBLISHED");
      await setSettings({ coachesMayPublishPublic: false });
      expect((await publish(coach, (await create(coach, { visibility: "INVITATION_ONLY" })).id)).outcome).toBe("PUBLISHED");
    });

    it("a co-host can't publish; publishing twice is a 409", async () => {
      const tournament = await create(admin);
      await t.call(admin, "PUT", API_ROUTES.tournaments.hosts(tournament.id), { hosts: [{ role: "CO_HOST", userId: otherCoach.id }] });
      expect((await t.call(otherCoach, "POST", API_ROUTES.tournaments.publish(tournament.id), { reason: "please" })).status).toBe(403);
      await publish(admin, tournament.id);
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.publish(tournament.id), {})).status).toBe(409);
    });
  });

  describe("registration", () => {
    let open: string;

    beforeAll(async () => {
      const tournament = await create(admin, { maxPlayers: 3 });
      await publish(admin, tournament.id);
      open = tournament.id;
    });

    it("a student registers once, sees it, and can withdraw and re-enter", async () => {
      const first = await t.call(students[0], "POST", API_ROUTES.tournaments.registration(open));
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({ player: { seedRating: 1000, seedRatingSource: "PROFILE", status: "APPROVED" } });
      expect((await t.call(students[0], "POST", API_ROUTES.tournaments.registration(open))).status).toBe(409);
      const detail = (await t.call(students[0], "GET", API_ROUTES.tournaments.get(open))).body as TournamentResponse;
      expect(detail.tournament.viewer).toMatchObject({ canWithdraw: true, myStatus: "APPROVED", registrationIssue: "You're already entered." });
      expect((await t.call(students[0], "DELETE", API_ROUTES.tournaments.registration(open))).body).toMatchObject({ player: { status: "WITHDRAWN" } });
      expect((await t.call(students[0], "POST", API_ROUTES.tournaments.registration(open))).status).toBe(201);
    });

    it("never goes over the cap, even when the last places are raced", async () => {
      const racers = students.slice(1, 6);
      const results = await Promise.all(racers.map((s) => t.call(s, "POST", API_ROUTES.tournaments.registration(open))));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(2); // 3 places, one already taken
      expect(statuses.filter((s) => s === 409)).toHaveLength(3);
      expect(await t.prisma.tournamentPlayer.count({ where: { status: "APPROVED", tournamentId: open } })).toBe(3);
    });

    it("coaches and admins can't self-register; the list hides pending entries from players", async () => {
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.registration(open))).status).toBe(403);
      const asPlayer = (await t.call(students[0], "GET", API_ROUTES.tournaments.players(open))).body as TournamentPlayersResponse;
      expect(asPlayer.players.every((p) => p.status === "APPROVED")).toBe(true);
    });

    it("refuses an ineligible student with the reason", async () => {
      const tournament = await create(admin, { eligibility: { allowUnrated: true, maxRating: 1050 } });
      await publish(admin, tournament.id);
      const res = await t.call(students[3], "POST", API_ROUTES.tournaments.registration(tournament.id));
      expect(res).toMatchObject({ body: { message: expect.stringMatching(/up to 1050/) }, status: 403 });
      const detail = (await t.call(students[3], "GET", API_ROUTES.tournaments.get(tournament.id))).body as TournamentResponse;
      expect(detail.tournament.viewer.registrationIssue).toMatch(/up to 1050/);
    });

    it("an approval-required tournament takes entries as PENDING; the host approves or rejects", async () => {
      const tournament = await create(admin, { registrationRequiresApproval: true });
      await publish(admin, tournament.id);
      const entry = await t.call(students[0], "POST", API_ROUTES.tournaments.registration(tournament.id));
      expect(entry.body).toMatchObject({ player: { status: "PENDING" } });
      const playerId = (entry.body as { player: { id: string } }).player.id;
      expect((await t.call(students[1], "PATCH", API_ROUTES.tournaments.player(tournament.id, playerId), { status: "APPROVED" })).status).toBe(403);
      const decided = await t.call(admin, "PATCH", API_ROUTES.tournaments.player(tournament.id, playerId), { status: "APPROVED" });
      expect(decided.body).toMatchObject({ player: { status: "APPROVED" } });
      expect((await t.call(admin, "PATCH", API_ROUTES.tournaments.player(tournament.id, playerId), { status: "APPROVED" })).status).toBe(409);
    });

    it("a PRIVATE tournament refuses self-registration; the host enters players", async () => {
      const tournament = await create(admin, { visibility: "PRIVATE" });
      await publish(admin, tournament.id);
      await t.call(admin, "POST", API_ROUTES.tournaments.players(tournament.id), { userIds: [students[1].id] });
      expect((await t.call(students[1], "POST", API_ROUTES.tournaments.registration(tournament.id))).status).toBe(403);
    });

    it("an invitation is accepted or declined by the student", async () => {
      const tournament = await create(admin, { visibility: "INVITATION_ONLY" });
      await publish(admin, tournament.id);
      const added = await t.call(admin, "POST", API_ROUTES.tournaments.players(tournament.id), {
        as: "INVITED",
        userIds: [students[0].id, students[1].id]
      });
      expect((added.body as AddTournamentPlayersResponse).added.map((p) => p.status)).toEqual(["INVITED", "INVITED"]);
      expect((await t.call(students[0], "POST", API_ROUTES.tournaments.registration(tournament.id))).status).toBe(403);
      expect((await t.call(students[0], "POST", API_ROUTES.tournaments.invitationAccept(tournament.id))).body).toMatchObject({
        player: { status: "APPROVED" }
      });
      expect((await t.call(students[1], "POST", API_ROUTES.tournaments.invitationDecline(tournament.id))).body).toMatchObject({
        player: { status: "WITHDRAWN" }
      });
      expect((await t.call(students[2], "POST", API_ROUTES.tournaments.invitationAccept(tournament.id))).status).toBe(404);
    });

    it("a coach host only reaches students of their own batches", async () => {
      await setSettings({ coachesMayPublishPublic: true });
      const tournament = await create(coach);
      const res = await t.call(coach, "POST", API_ROUTES.tournaments.players(tournament.id), { userIds: [students[0].id, outsider.id] });
      const result = res.body as AddTournamentPlayersResponse;
      expect(result.added.map((p) => p.user.id)).toEqual([students[0].id]);
      expect(result.skipped).toEqual([{ reason: "Not a student of your batches.", userId: outsider.id }]);
      const candidates = await t.call(coach, "GET", `${API_ROUTES.tournaments.candidates(tournament.id)}?search=`);
      const ids = (candidates.body as { candidates: { id: string }[] }).candidates.map((c) => c.id);
      expect(ids).not.toContain(outsider.id);
      expect(ids).toContain(students[4].id);
      // An admin reaches everyone.
      const asAdmin = await t.call(admin, "GET", API_ROUTES.tournaments.candidates(tournament.id));
      expect((asAdmin.body as { candidates: { id: string }[] }).candidates.map((c) => c.id)).toContain(outsider.id);
    });
  });

  describe("hosts, cancel, delete", () => {
    it("hosts must be active staff; a coach host can't drop themselves", async () => {
      const tournament = await create(coach);
      expect(
        (await t.call(coach, "PUT", API_ROUTES.tournaments.hosts(tournament.id), { hosts: [{ role: "HOST", userId: students[0].id }, { role: "HOST", userId: coach.id }] })).status
      ).toBe(400);
      expect((await t.call(coach, "PUT", API_ROUTES.tournaments.hosts(tournament.id), { hosts: [{ role: "HOST", userId: otherCoach.id }] })).status).toBe(400);
      const ok = await t.call(coach, "PUT", API_ROUTES.tournaments.hosts(tournament.id), {
        hosts: [{ role: "HOST", userId: coach.id }, { role: "COMMENTATOR", userId: otherCoach.id }]
      });
      expect((ok.body as TournamentResponse).tournament.hosts.map((h) => h.role).sort()).toEqual(["COMMENTATOR", "HOST"]);
      // The commentator sees the draft but can't manage it.
      const asCommentator = await t.call(otherCoach, "GET", API_ROUTES.tournaments.get(tournament.id));
      expect((asCommentator.body as TournamentResponse).tournament.viewer).toMatchObject({ canBroadcast: true, canManage: false });
      expect((await t.call(otherCoach, "PATCH", API_ROUTES.tournaments.update(tournament.id), { name: "Other name", version: 1 })).status).toBe(403);
    });

    it("only drafts and cancelled tournaments go to the Trash", async () => {
      const tournament = await create(admin);
      await publish(admin, tournament.id);
      expect((await t.call(admin, "DELETE", API_ROUTES.tournaments.delete(tournament.id))).status).toBe(409);
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.cancel(tournament.id), { reason: "Weather" })).body).toMatchObject({
        tournament: { cancelReason: "Weather", phase: "CANCELLED" }
      });
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.cancel(tournament.id), { reason: "Again" })).status).toBe(409);
      expect((await t.call(admin, "DELETE", API_ROUTES.tournaments.delete(tournament.id))).status).toBe(200);
      expect((await t.call(admin, "GET", API_ROUTES.tournaments.get(tournament.id))).status).toBe(404);
    });

    it("after publishing the format is fixed", async () => {
      const tournament = await create(admin);
      const published = await publish(admin, tournament.id);
      const res = await t.call(admin, "PATCH", API_ROUTES.tournaments.update(tournament.id), {
        arenaDurationMin: 60,
        format: "ARENA",
        version: published.tournament.version
      });
      expect(res.status).toBe(409);
    });
  });

  describe("discovery", () => {
    it("lists by tab with the viewer's own status, paged", async () => {
      const upcoming = (await t.call(students[0], "GET", `${API_ROUTES.tournaments.list}?tab=upcoming&pageSize=50`)).body as TournamentListResponse;
      expect(upcoming.items.length).toBeGreaterThan(0);
      // Public ones, plus private / invitation-only ones the student is part of.
      expect(upcoming.items.every((i) => i.status === "PUBLISHED" && (i.visibility === "PUBLIC" || i.myStatus !== null))).toBe(true);
      const mine = (await t.call(students[0], "GET", `${API_ROUTES.tournaments.list}?tab=mine`)).body as TournamentListResponse;
      expect(mine.items.every((i) => i.myStatus !== null)).toBe(true);
      expect(mine.items.some((i) => i.visibility === "PRIVATE")).toBe(true);
      const drafts = (await t.call(students[0], "GET", `${API_ROUTES.tournaments.list}?tab=drafts`)).body as TournamentListResponse;
      expect(drafts.items).toEqual([]);
      const coachDrafts = (await t.call(coach, "GET", `${API_ROUTES.tournaments.list}?tab=drafts`)).body as TournamentListResponse;
      expect(coachDrafts.items.length).toBeGreaterThan(0);
      expect((await t.call(students[0], "GET", `${API_ROUTES.tournaments.list}?tab=nope`)).status).toBe(400);
      const paged = (await t.call(admin, "GET", `${API_ROUTES.tournaments.list}?tab=upcoming&pageSize=1`)).body as TournamentListResponse;
      expect(paged.items).toHaveLength(1);
      expect(paged.pagination.total).toBeGreaterThan(1);
    });
  });
});
