import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  type AdminTournamentOverviewDto,
  type CertificateTemplateDto,
  type CertificateVerificationDto,
  type TournamentCertificatesResponse,
  type TournamentHistoryResponse,
  type TournamentResponse,
  type TournamentRoundsResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { TournamentScheduler } from "./tournament.scheduler";

// Phase 8 of docs/TOURNAMENTS.md: notifications (claim-first, never twice),
// certificates (templates, rules, issuing, PDF, revoke, public verification),
// player history and the academy admin dashboard.
describe("tournament notifications, certificates and history (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let coach: User;
  let otherCoach: User;
  let students: User[];
  let id: string;

  const nexa = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "spec", fn);
  const tick = (now = new Date()) => nexa(() => t.app.get(TournamentScheduler).tickTenant(now));
  const userOf = (userId: string) => students.find((s) => s.id === userId)!;
  const notifications = (userId: string, titlePart: string) =>
    nexa(() => t.prisma.notification.count({ where: { title: { contains: titlePart }, userId } }));

  const active = async (role: UserRole, extra: { firstName?: string; dateOfBirth?: Date } = {}) => {
    const user = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE, ...(extra.firstName ? { firstName: extra.firstName, lastName: "Surname" } : {}) },
      where: { id: (await createUser(t.prisma, role)).id }
    });
    if (role === UserRole.STUDENT) {
      await t.prisma.studentProfile.create({ data: { chessRating: 1000, dateOfBirth: extra.dateOfBirth ?? null, parentName: "Parent", userId: user.id } });
    }
    return user;
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
    otherCoach = await active(UserRole.COACH);
    students = [];
    for (let i = 0; i < 4; i += 1) students.push(await active(UserRole.STUDENT, { dateOfBirth: new Date(Date.UTC(i < 2 ? 2016 : 2012, 0, 1)), firstName: `Pupil${i}` }));
    // The coach teaches students 0 and 1 only.
    const batch = await t.prisma.batch.create({ data: { name: "Batch" } });
    await t.prisma.batchCoach.create({ data: { batchId: batch.id, coachId: coach.id } });
    for (const s of students.slice(0, 2)) await t.prisma.batchStudent.create({ data: { batchId: batch.id, studentId: s.id } });
  });

  afterAll(() => t?.close());

  it("an entry and each pairing are notified once, however many ticks run", async () => {
    const created = await t.call(admin, "POST", API_ROUTES.tournaments.create, {
      format: "SWISS",
      name: "Records Open",
      rounds: 2,
      roundBreakSec: 0,
      startsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      timeControl: { incrementSeconds: 0, initialSeconds: 300 }
    });
    id = (created.body as TournamentResponse).tournament.id;
    await t.call(admin, "PUT", API_ROUTES.tournaments.hosts(id), { hosts: [{ role: "HOST", userId: coach.id }] });
    await t.call(admin, "POST", API_ROUTES.tournaments.publish(id), {});
    await t.call(admin, "POST", API_ROUTES.tournaments.players(id), { userIds: students.map((s) => s.id) });
    // Entry confirmation (sent in the background after commit).
    for (let i = 0; i < 40 && (await notifications(students[0].id, "Your tournament entry")) === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(await notifications(students[0].id, "Your tournament entry")).toBe(1);

    // Starting soon: twice ticked, once sent.
    await tick();
    await tick();
    expect(await notifications(students[0].id, "starts in")).toBe(1);
    // The "open for registration" rule queued one in-app message per student, however many ticks ran.
    const queued = (event: "TOURNAMENT_REGISTRATION_OPEN" | "TOURNAMENT_STARTED", userId: string) =>
      t.prisma.messageDelivery.count({ where: { channel: "IN_APP", event, recipientId: userId } });
    for (let i = 0; i < 40 && (await queued("TOURNAMENT_REGISTRATION_OPEN", students[0].id)) === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    for (const s of students) expect(await queued("TOURNAMENT_REGISTRATION_OPEN", s.id)).toBe(1);
    expect(await queued("TOURNAMENT_STARTED", students[0].id)).toBe(0);

    await t.call(coach, "POST", API_ROUTES.tournaments.start(id));
    await tick();
    await Promise.all([tick(), tick()]);
    // … and "tournament started" reached every entered player once.
    for (let i = 0; i < 40 && (await queued("TOURNAMENT_STARTED", students[0].id)) === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    for (const s of students) expect(await queued("TOURNAMENT_STARTED", s.id)).toBe(1);
    for (const s of students) expect(await notifications(s.id, ": you play")).toBe(1);
  });

  it("an announcement reaches every player", async () => {
    await t.call(coach, "POST", API_ROUTES.tournaments.commentary(id), { body: "Round 2 starts soon.", clientId: "announce-0001", type: "ANNOUNCEMENT" });
    for (let i = 0; i < 40 && (await notifications(students[3].id, "a message from the host")) === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    for (const s of students) expect(await notifications(s.id, "a message from the host")).toBe(1);
  });

  it("finishes the event and sends the round and completion news once", async () => {
    for (let round = 1; round <= 2; round += 1) {
      const games = ((await t.call(admin, "GET", API_ROUTES.tournaments.rounds(id))).body as TournamentRoundsResponse).rounds[round - 1].games;
      for (const g of games) await t.call(userOf(g.black!.userId), "POST", API_ROUTES.tournaments.gameAction(id, g.id), { action: "RESIGN" });
      await tick();
      await tick();
    }
    expect(((await t.call(admin, "GET", API_ROUTES.tournaments.get(id))).body as TournamentResponse).tournament.status).toBe("COMPLETED");
    expect(await notifications(students[0].id, "Round 1 of Records Open is over")).toBe(1);
    // The last round's news is the completion message.
    expect(await notifications(students[0].id, "Round 2 of Records Open is over")).toBe(0);
    expect(await notifications(students[0].id, "has finished")).toBe(1);
  });

  describe("certificates", () => {
    let template: CertificateTemplateDto;

    it("only admins design templates; colours and placeholders are checked", async () => {
      const body = {
        accentColor: "#1F4FA8",
        body: "{{player.name}} placed {{placement}} in {{tournament.name}}.",
        borderStyle: "CLASSIC",
        name: "Winners",
        orientation: "LANDSCAPE",
        signatoryName: "Head Coach",
        signatoryTitle: "Academy",
        title: "Certificate of Achievement"
      };
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.adminTemplates, body)).status).toBe(403);
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.adminTemplates, { ...body, accentColor: "#FFFFFE" })).status).toBe(400);
      expect((await t.call(admin, "POST", API_ROUTES.tournaments.adminTemplates, { ...body, body: "Hello {{player.email}}, welcome." })).status).toBe(400);
      const res = await t.call(admin, "POST", API_ROUTES.tournaments.adminTemplates, body);
      expect(res.status).toBe(201);
      template = (res.body as { template: CertificateTemplateDto }).template;
    });

    it("issues by the rules when results are published, once", async () => {
      expect(
        (await t.call(coach, "PUT", API_ROUTES.tournaments.certificateRules(id), {
          rules: [
            { kind: "PLACEMENT", templateId: template.id, topN: 1 },
            { kind: "AGE_GROUP_PLACEMENT", templateId: template.id, topN: 1 },
            { kind: "PARTICIPATION", minGames: 1, templateId: template.id }
          ]
        })).status
      ).toBe(200);
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.publishResults(id))).status).toBe(200);
      const all = (await t.call(coach, "GET", API_ROUTES.tournaments.certificates(id))).body as TournamentCertificatesResponse;
      // Everyone who played; the winner(s); the best of each age group (two groups; a shared place shares the certificate).
      const byKind = (kind: string) => all.certificates.filter((c) => c.kind === kind);
      expect(byKind("PARTICIPATION")).toHaveLength(4);
      expect(byKind("PLACEMENT").length).toBeGreaterThanOrEqual(1);
      expect(byKind("PLACEMENT").every((c) => c.placement === "1st")).toBe(true);
      const groups = new Set(byKind("AGE_GROUP_PLACEMENT").map((c) => c.placement));
      expect([...groups].every((p) => /^1st in U\d+$/.test(p))).toBe(true);
      expect(groups.size).toBe(2);
      // Issuing again changes nothing.
      expect(((await t.call(coach, "POST", API_ROUTES.tournaments.issueCertificates(id))).body as TournamentCertificatesResponse).certificates).toHaveLength(all.certificates.length);
      // A player sees only their own.
      const own = (await t.call(students[0], "GET", API_ROUTES.tournaments.certificates(id))).body as TournamentCertificatesResponse;
      expect(own.certificates.every((c) => c.user.id === students[0].id)).toBe(true);
      // A rule with certificates can't change any more.
      expect((await t.call(coach, "PUT", API_ROUTES.tournaments.certificateRules(id), { rules: [] })).status).toBe(409);
      // The results notification went out once.
      for (let i = 0; i < 40 && (await notifications(students[0].id, "Final results")) === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
      expect(await notifications(students[0].id, "Final results")).toBe(1);
    });

    it("the owner downloads the PDF; another student can't; anyone can verify it", async () => {
      const own = ((await t.call(students[0], "GET", API_ROUTES.tournaments.certificates(id))).body as TournamentCertificatesResponse).certificates[0];
      expect((await t.call(null, "GET", API_ROUTES.tournaments.certificatePdf(own.id))).status).toBe(401);
      const pdf = await t.call(students[0], "GET", API_ROUTES.tournaments.certificatePdf(own.id));
      expect(pdf.status).toBe(200);
      expect(String(pdf.body).startsWith("%PDF")).toBe(true);
      expect((await t.call(students[1], "GET", API_ROUTES.tournaments.certificatePdf(own.id))).status).toBe(404);
      const verified = (await t.call(null, "GET", API_ROUTES.publicTournaments.verifyCertificate(own.verificationCode))).body as CertificateVerificationDto;
      expect(verified).toMatchObject({ name: "Pupil0 S.", revoked: false, tournamentName: "Records Open", valid: true });
      expect(JSON.stringify(verified)).not.toContain("Surname");
      expect((await t.call(null, "GET", API_ROUTES.publicTournaments.verifyCertificate("0000000000000000"))).body).toEqual({ valid: false });
    });

    it("a revoked certificate is shown as revoked and can't be downloaded", async () => {
      const own = ((await t.call(students[1], "GET", API_ROUTES.tournaments.certificates(id))).body as TournamentCertificatesResponse).certificates[0];
      expect((await t.call(otherCoach, "POST", API_ROUTES.tournaments.revokeCertificate(id, own.id), { reason: "Wrong" })).status).toBe(403);
      expect((await t.call(coach, "POST", API_ROUTES.tournaments.revokeCertificate(id, own.id), { reason: "Result corrected" })).status).toBe(200);
      expect((await t.call(students[1], "GET", API_ROUTES.tournaments.certificatePdf(own.id))).status).toBe(409);
      const verified = (await t.call(null, "GET", API_ROUTES.publicTournaments.verifyCertificate(own.verificationCode))).body as CertificateVerificationDto;
      expect(verified).toMatchObject({ revoked: true, valid: true });
    });
  });

  describe("history and the dashboard", () => {
    it("a student sees their own history; a coach only their own students'; admins everyone's", async () => {
      const mine = (await t.call(students[0], "GET", API_ROUTES.tournaments.myHistory)).body as TournamentHistoryResponse;
      expect(mine.entries).toHaveLength(1);
      expect(mine.entries[0]).toMatchObject({ played: 2, pointsUnit: "half-points", tournament: { id } });
      expect(mine.entries[0].certificates.length).toBeGreaterThan(0);
      expect((await t.call(coach, "GET", API_ROUTES.tournaments.studentHistory(students[1].id))).status).toBe(200);
      expect((await t.call(coach, "GET", API_ROUTES.tournaments.studentHistory(students[3].id))).status).toBe(403);
      expect((await t.call(students[0], "GET", API_ROUTES.tournaments.studentHistory(students[1].id))).status).toBe(403);
      expect((await t.call(admin, "GET", API_ROUTES.tournaments.studentHistory(students[3].id))).status).toBe(200);
    });

    it("the admin dashboard counts tournaments, hosts and players", async () => {
      expect((await t.call(coach, "GET", API_ROUTES.tournaments.adminOverview)).status).toBe(403);
      const res = await t.call(admin, "GET", API_ROUTES.tournaments.adminOverview);
      const overview = res.body as AdminTournamentOverviewDto;
      expect(overview.counts.COMPLETED).toBe(1);
      expect(overview.playersThisYear).toBe(4);
      expect(overview.completionRate).toBe(1);
      expect(overview.hosts[0]).toMatchObject({ tournaments: 1, user: { id: coach.id } });
      expect(overview.recent[0]).toMatchObject({ champion: expect.objectContaining({ id: expect.any(String) }), id });
      expect((await t.call(admin, "GET", API_ROUTES.tournaments.adminRegistrations)).status).toBe(200);
    });
  });
});
