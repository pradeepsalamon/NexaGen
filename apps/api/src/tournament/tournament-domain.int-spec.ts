import { API_ROUTES, DEFAULT_TENANT_ID, type TournamentSettingsResponse } from "@nexa-chess/types";
import { Prisma, TournamentFormat, TournamentPlayerStatus, UserRole, UserStatus, type User } from "@prisma/client";
import { EntitlementService } from "../platform/entitlement.service";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { TrashRepository } from "../trash/trash.repository";
import { TournamentSettingsService } from "./tournament-settings.service";

// Phase 1 of docs/TOURNAMENTS.md against real Postgres: the settings routes and
// their audit trail, academy separation, the plan gate, soft delete of a
// tournament with its players, the schema's CHECK constraints and the privacy
// export.
describe("tournament domain (real app, real Postgres)", () => {
  const ACME = "tenant_int_tournaments";
  let t: TestApp;
  let admin: User;
  let coach: User;
  let student: User;

  const nexa = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "spec:nexa", fn);
  const acme = <T>(fn: () => Promise<T>) => runInTenant(ACME, "spec:acme", fn);

  const active = async (role: UserRole) =>
    t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });

  const VALID = {
    allowAnonymousSpectating: true,
    coachesMayCreate: true,
    coachesMayPublishPublic: false,
    defaultSpectatorDelaySec: 30,
    publicNameFormat: "FIRST_NAME_ONLY"
  } as const;

  const tournamentData = (over: Partial<Prisma.TournamentUncheckedCreateInput> = {}) => ({
    clockInitialMs: 300_000,
    format: TournamentFormat.SWISS,
    name: "Autumn Swiss",
    rounds: 5,
    slug: `autumn-${Math.random().toString(36).slice(2, 8)}`,
    startsAt: new Date("2026-12-01T10:00:00.000Z"),
    ...over
  });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
    student = await active(UserRole.STUDENT);
    await t.prisma.tenant.create({ data: { id: ACME, name: "Tournament Academy", slug: "int-tournaments" } });
  });

  afterAll(() => t?.close());

  describe("settings routes", () => {
    const path = API_ROUTES.tournaments.adminSettings;

    it("an admin reads the defaults, then saves; the change is audited in the academy", async () => {
      const first = await t.call(admin, "GET", path);
      expect(first.status).toBe(200);
      expect((first.body as TournamentSettingsResponse).settings).toMatchObject({
        allowAnonymousSpectating: false,
        coachesMayCreate: false,
        defaultSpectatorDelaySec: 15,
        updatedBy: null
      });

      const saved = await t.call(admin, "PUT", path, VALID);
      expect(saved.status).toBe(200);
      expect((saved.body as TournamentSettingsResponse).settings).toMatchObject({
        ...VALID,
        updatedBy: { id: admin.id }
      });

      const audit = await nexa(() => t.prisma.tournamentAuditLog.findMany());
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: "SETTINGS_UPDATED",
        actorId: admin.id,
        afterJson: { allowAnonymousSpectating: true, coachesMayCreate: true, defaultSpectatorDelaySec: 30, publicNameFormat: "FIRST_NAME_ONLY" },
        tenantId: DEFAULT_TENANT_ID,
        tournamentId: null
      });
    });

    it("two saves at once both land, and the audit trail stays consistent", async () => {
      const [a, b] = await Promise.all([
        t.call(admin, "PUT", path, { ...VALID, defaultSpectatorDelaySec: 60 }),
        t.call(admin, "PUT", path, { ...VALID, defaultSpectatorDelaySec: 90 })
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const rows = await nexa(() =>
        t.prisma.tournamentAuditLog.findMany({ orderBy: { createdAt: "asc" }, where: { action: "SETTINGS_UPDATED" } })
      );
      // Each audited change starts from the value the previous one left.
      const delays = rows.slice(1).map((r) => [
        (r.beforeJson as { defaultSpectatorDelaySec?: number }).defaultSpectatorDelaySec,
        (r.afterJson as { defaultSpectatorDelaySec?: number }).defaultSpectatorDelaySec
      ]);
      expect(delays).toHaveLength(2);
      expect(delays[0][0]).toBe(30);
      expect(delays[1][0]).toBe(delays[0][1]);
    });

    it.each([
      ["a delay over the limit", { ...VALID, defaultSpectatorDelaySec: 100_000 }],
      ["a missing field", { coachesMayCreate: true }],
      ["an unknown field", { ...VALID, tenantId: ACME }],
      ["an unknown name format", { ...VALID, publicNameFormat: "FULL_NAME" }]
    ])("rejects %s with a 400", async (_label, body) => {
      expect((await t.call(admin, "PUT", path, body)).status).toBe(400);
    });

    it("coaches and students get a 403, anonymous callers a 401", async () => {
      for (const user of [coach, student]) {
        expect((await t.call(user, "GET", path)).status).toBe(403);
        expect((await t.call(user, "PUT", path, VALID)).status).toBe(403);
      }
      expect((await t.call(null, "GET", path)).status).toBe(401);
    });

    it("a plan without tournaments gets a 402", async () => {
      const entitlements = t.app.get(EntitlementService);
      await t.prisma.tenantSubscription.update({ data: { planId: "plan_business" }, where: { tenantId: DEFAULT_TENANT_ID } });
      entitlements.invalidate();
      try {
        const res = await t.call(admin, "GET", path);
        expect(res).toMatchObject({ body: { code: "PLAN_FEATURE_REQUIRED", feature: "tournaments" }, status: 402 });
      } finally {
        await t.prisma.tenantSubscription.update({ data: { planId: "plan_enterprise" }, where: { tenantId: DEFAULT_TENANT_ID } });
        entitlements.invalidate();
      }
    });

    it("each academy has its own settings row", async () => {
      const service = t.app.get(TournamentSettingsService);
      expect((await nexa(() => service.policySettings())).coachesMayCreate).toBe(true);
      expect(await acme(() => service.policySettings())).toMatchObject({
        allowAnonymousSpectating: false,
        coachesMayCreate: false
      });
    });
  });

  describe("schema", () => {
    it("stamps each row with its academy and keeps academies apart", async () => {
      const acmeStudent = await acme(() =>
        t.prisma.user.create({ data: { email: "acme-student@int.test", firstName: "Acme", password: "x", role: UserRole.STUDENT } })
      );
      const tournament = await acme(() => t.prisma.tournament.create({ data: tournamentData() }));
      await acme(() =>
        t.prisma.tournamentPlayer.create({
          data: { status: TournamentPlayerStatus.APPROVED, tournamentId: tournament.id, userId: acmeStudent.id }
        })
      );
      expect(tournament.tenantId).toBe(ACME);
      expect(await nexa(() => t.prisma.tournament.findUnique({ where: { id: tournament.id } }))).toBeNull();
      expect(await nexa(() => t.prisma.tournamentPlayer.count({ where: { tournamentId: tournament.id } }))).toBe(0);
      expect(await acme(() => t.prisma.tournamentPlayer.count({ where: { tournamentId: tournament.id } }))).toBe(1);
    });

    it("refuses a second registration of the same player", async () => {
      const tournament = await nexa(() => t.prisma.tournament.create({ data: tournamentData() }));
      const entry = { status: TournamentPlayerStatus.PENDING, tournamentId: tournament.id, userId: student.id };
      await nexa(() => t.prisma.tournamentPlayer.create({ data: entry }));
      await expect(nexa(() => t.prisma.tournamentPlayer.create({ data: entry }))).rejects.toMatchObject({ code: "P2002" });
    });

    it.each([
      ["no clock", { clockInitialMs: 0 }],
      ["a negative increment", { clockIncrementMs: -1 }],
      ["one player", { minPlayers: 1 }],
      ["a cap below the minimum", { maxPlayers: 3, minPlayers: 4 }],
      ["registration closing before it opens", {
        registrationClosesAt: new Date("2026-11-01T00:00:00.000Z"),
        registrationOpensAt: new Date("2026-11-02T00:00:00.000Z")
      }],
      ["a negative spectator delay", { spectatorDelaySec: -5 }],
      ["zero rounds", { rounds: 0 }]
    ])("the database refuses %s", async (_label, over) => {
      await expect(nexa(() => t.prisma.tournament.create({ data: tournamentData(over) }))).rejects.toThrow(/check constraint/i);
    });
  });

  describe("soft delete", () => {
    it("a trashed tournament hides its players and hosts until it is restored", async () => {
      const tournament = await nexa(() => t.prisma.tournament.create({ data: tournamentData() }));
      await nexa(async () => {
        await t.prisma.tournamentPlayer.create({
          data: { status: TournamentPlayerStatus.APPROVED, tournamentId: tournament.id, userId: student.id }
        });
        await t.prisma.tournamentHost.create({ data: { role: "HOST", tournamentId: tournament.id, userId: coach.id } });
      });
      const trash = t.app.get(TrashRepository);

      await nexa(() => t.prisma.$transaction((tx) => trash.softDelete(tx, "Tournament", tournament.id, admin.id)));
      await nexa(async () => {
        expect(await t.prisma.tournament.findUnique({ where: { id: tournament.id } })).toBeNull();
        expect(await t.prisma.tournamentPlayer.count({ where: { tournamentId: tournament.id } })).toBe(0);
        expect(await t.prisma.tournamentHost.count({ where: { tournamentId: tournament.id } })).toBe(0);
        expect(await t.prisma.tournamentPlayer.count({ where: { tournament: { id: tournament.id }, userId: student.id } })).toBe(0);
        expect(await t.prisma.withDeleted.tournamentPlayer.count({ where: { tournamentId: tournament.id } })).toBe(1);
      });

      await nexa(() => trash.restore("Tournament", tournament.id, admin.id));
      await nexa(async () => {
        expect(await t.prisma.tournament.findUnique({ where: { id: tournament.id } })).not.toBeNull();
        expect(await t.prisma.tournamentPlayer.count({ where: { tournamentId: tournament.id } })).toBe(1);
        expect(await t.prisma.tournamentHost.count({ where: { tournamentId: tournament.id } })).toBe(1);
      });
    });

    it("lists trashed tournaments in the admin Trash", async () => {
      const tournament = await nexa(() => t.prisma.tournament.create({ data: tournamentData({ name: "Trash me" }) }));
      const trash = t.app.get(TrashRepository);
      await nexa(() => t.prisma.$transaction((tx) => trash.softDelete(tx, "Tournament", tournament.id, admin.id)));
      const superAdmin = await active(UserRole.SUPER_ADMIN);
      const res = await t.call(superAdmin, "GET", `${API_ROUTES.trash.list}?entity=Tournament`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain("Trash me");
    });
  });

  it("the privacy export holds the user's tournament entries and host roles, trashed ones included", async () => {
    const tournament = await nexa(() => t.prisma.tournament.create({ data: tournamentData({ name: "Exported" }) }));
    await nexa(() =>
      t.prisma.tournamentPlayer.create({
        data: {
          decidedById: admin.id,
          registeredById: admin.id,
          status: TournamentPlayerStatus.APPROVED,
          tournamentId: tournament.id,
          userId: student.id
        }
      })
    );
    await nexa(() => t.prisma.$transaction((tx) => t.app.get(TrashRepository).softDelete(tx, "Tournament", tournament.id, admin.id)));

    const res = await t.call(student, "GET", API_ROUTES.privacy.dataExport);
    expect(res.status).toBe(200);
    const sections = (res.body as { sections: Record<string, Record<string, unknown>[]> }).sections;
    const entry = sections.tournamentEntries.find((row) => row.tournamentId === tournament.id);
    expect(entry).toMatchObject({ status: "APPROVED", userId: student.id });
    expect(entry).not.toHaveProperty("registeredById");
    expect(entry).not.toHaveProperty("decidedById");
    expect(sections.tournamentHostRoles).toEqual([]);

    const coachExport = await t.call(coach, "GET", API_ROUTES.privacy.dataExport);
    const hostRoles = (coachExport.body as { sections: Record<string, Record<string, unknown>[]> }).sections.tournamentHostRoles;
    expect(hostRoles.length).toBeGreaterThan(0);
    expect(hostRoles[0]).not.toHaveProperty("grantedById");

    const adminExport = await t.call(admin, "GET", API_ROUTES.privacy.dataExport);
    const actions = (adminExport.body as { sections: Record<string, Record<string, unknown>[]> }).sections.tournamentAuditActions;
    expect(actions.some((row) => row.action === "SETTINGS_UPDATED")).toBe(true);
    expect(actions[0]).not.toHaveProperty("afterJson");
  });

  it("the nightly integrity check finds no cross-academy tournament links", async () => {
    const rows = await asPlatform("spec: compare player and tournament academies", () =>
      t.prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n FROM tournament_players p JOIN tournaments t ON t.id = p."tournamentId"
        WHERE p."tenantId" <> t."tenantId"`
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
