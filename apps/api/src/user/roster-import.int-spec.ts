import { UserRole, UserStatus, type User } from "@prisma/client";
import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  NO_EMAIL_DOMAIN,
  readRosterCsv,
  type EntitlementOverrides,
  type RosterImportResponse
} from "@nexa-chess/types";
import { SystemNotifier } from "../mail/system-notifier.service";
import { EntitlementService } from "../platform/entitlement.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Roster import end to end (docs/ROSTER_IMPORT.md): preview creates nothing,
// import creates students and coaches with profiles, batch places and invites,
// re-running the file is a no-op, seat limits stop only the rows that don't fit,
// and only academy admins may use it.
describe("roster import (real app, real Postgres)", () => {
  let t: TestApp;
  let entitlements: EntitlementService;
  let superAdmin: User;
  let admin: User;
  let batchId: string;
  let sends: Array<{ key: string; email: string | null | undefined }>;

  const active = async (role: UserRole) =>
    t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: (await createUser(t.prisma, role)).id } });

  const setOverrides = async (overrides: Partial<EntitlementOverrides>) => {
    await t.prisma.tenantSubscription.update({ data: { overrides, planId: "plan_starter" }, where: { tenantId: DEFAULT_TENANT_ID } });
    entitlements.invalidate();
  };

  const csv = `First name,Last name,Email,Role,Phone,Parent name,Parent phone,Batch,Notes
Asha,Kumar,Asha@Example.com,Student,,Ravi Kumar,+919800000000,beginners a,likes endgames
Vikram,Rao,vikram@example.com,Coach,+919811111111,,,Beginners A,
Meera,,,student,,,,,
Bad,Row,not-an-email,Student,,,,,
Odd,Role,odd@example.com,Parent,,,,,
Lost,Batch,lost@example.com,Student,,,,Nowhere,
`;

  beforeAll(async () => {
    t = await createTestApp();
    entitlements = t.app.get(EntitlementService);
    const notifier = t.app.get(SystemNotifier);
    jest.spyOn(notifier, "send").mockImplementation(async (key, recipients) => {
      const list = Array.isArray(recipients) ? recipients : [recipients];
      for (const recipient of list) sends.push({ email: recipient.email, key });
      return { errors: {}, outcomes: { EMAIL: "SENT", IN_APP: "SKIPPED", WHATSAPP: "SKIPPED" } };
    });
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    entitlements.invalidate();
    sends = [];
    superAdmin = await active(UserRole.SUPER_ADMIN);
    admin = await active(UserRole.ADMIN);
    batchId = (await t.prisma.batch.create({ data: { name: "Beginners A" } })).id;
  });

  afterAll(async () => {
    await t?.close();
  });

  const rows = () => readRosterCsv(csv).rows;

  it("the CSV reader maps the header and ignores unknown columns", () => {
    const read = readRosterCsv(csv);
    expect(read.fileErrors).toEqual([]);
    expect(read.ignoredColumns).toEqual(["Notes"]);
    expect(read.rows[0]).toMatchObject({ batch: "beginners a", email: "Asha@Example.com", firstName: "Asha", role: "Student" });
  });

  it("preview checks every row and creates nothing", async () => {
    const before = await t.prisma.user.count();
    const res = await t.call(admin, "POST", API_ROUTES.users.importPreview, { rows: rows() });
    expect(res.status).toBe(200);
    const body = res.body as RosterImportResponse;
    expect(body.dryRun).toBe(true);
    expect(body.rows.map((row) => row.outcome)).toEqual(["CREATE", "CREATE", "CREATE", "INVALID", "INVALID", "INVALID"]);
    expect(body.rows[3].messages.join(" ")).toMatch(/valid email/i);
    expect(body.rows[4].messages.join(" ")).toMatch(/isn't Student or Coach/);
    expect(body.rows[5].messages.join(" ")).toMatch(/No batch is named "Nowhere"/);
    expect(await t.prisma.user.count()).toBe(before);
    expect(sends).toEqual([]);
  });

  it("import creates accounts, profiles, batch places and invites; a re-run changes nothing", async () => {
    const res = await t.call(admin, "POST", API_ROUTES.users.import, { rows: rows() });
    expect(res.status).toBe(201);
    const body = res.body as RosterImportResponse;
    expect(body.counts).toEqual({ CREATE: 3, EXISTS: 0, INVALID: 3, NO_SEAT: 0 });

    const asha = await t.prisma.user.findFirstOrThrow({ include: { studentProfile: true }, where: { email: "asha@example.com" } });
    expect(asha).toMatchObject({ createdById: admin.id, isEmailVerified: true, role: UserRole.STUDENT, status: UserStatus.ACTIVE });
    expect(asha.studentProfile).toMatchObject({ parentName: "Ravi Kumar", parentPhone: "+919800000000" });
    expect(await t.prisma.batchStudent.count({ where: { batchId, studentId: asha.id } })).toBe(1);

    const vikram = await t.prisma.user.findFirstOrThrow({ include: { coachProfile: true }, where: { email: "vikram@example.com" } });
    expect(vikram.coachProfile?.approvalStatus).toBe(UserStatus.ACTIVE);
    expect(vikram.phoneNumber).toBe("+919811111111");
    expect(await t.prisma.batchCoach.count({ where: { batchId, coachId: vikram.id } })).toBe(1);

    // No email: a stand-in address, no invite, can't sign in.
    const meera = await t.prisma.user.findFirstOrThrow({ where: { firstName: "Meera" } });
    expect(meera.email.endsWith(`@${NO_EMAIL_DOMAIN}`)).toBe(true);
    expect(meera.isEmailVerified).toBe(false);

    expect(sends.map((send) => send.email).sort()).toEqual(["asha@example.com", "vikram@example.com"]);
    expect(sends.every((send) => send.key === "ACCOUNT_INVITE")).toBe(true);
    expect(await t.prisma.passwordResetToken.count({ where: { userId: asha.id, usedAt: null } })).toBe(1);

    // The whole file again: nobody is added twice, Meera (no email) included.
    const again = (await t.call(admin, "POST", API_ROUTES.users.import, { rows: rows() })).body as RosterImportResponse;
    expect(again.counts).toEqual({ CREATE: 0, EXISTS: 3, INVALID: 3, NO_SEAT: 0 });
    expect(await t.prisma.user.count({ where: { firstName: "Meera" } })).toBe(1);
  });

  it("sendInvites: false creates the accounts without sending", async () => {
    const res = await t.call(superAdmin, "POST", API_ROUTES.users.import, { rows: rows().slice(0, 1), sendInvites: false });
    expect((res.body as RosterImportResponse).rows[0]).toMatchObject({ invited: false, outcome: "CREATE" });
    expect(sends).toEqual([]);
  });

  it("a seat limit stops only the rows that don't fit", async () => {
    await setOverrides({ limits: { maxStudents: 1 } });
    const file = [
      { email: "one@example.com", firstName: "One" },
      { email: "two@example.com", firstName: "Two" },
      { email: "coach@example.com", firstName: "Coach", role: "coach" }
    ];
    const preview = (await t.call(admin, "POST", API_ROUTES.users.importPreview, { rows: file })).body as RosterImportResponse;
    expect(preview.rows.map((row) => row.outcome)).toEqual(["CREATE", "NO_SEAT", "CREATE"]);
    const done = (await t.call(admin, "POST", API_ROUTES.users.import, { rows: file })).body as RosterImportResponse;
    expect(done.rows.map((row) => row.outcome)).toEqual(["CREATE", "NO_SEAT", "CREATE"]);
    expect(await t.prisma.user.count({ where: { role: UserRole.STUDENT } })).toBe(1);
  });

  it("only admins and super admins may import", async () => {
    const coach = await active(UserRole.COACH);
    const student = await active(UserRole.STUDENT);
    for (const user of [coach, student]) {
      expect((await t.call(user, "POST", API_ROUTES.users.importPreview, { rows: rows() })).status).toBe(403);
      expect((await t.call(user, "POST", API_ROUTES.users.import, { rows: rows() })).status).toBe(403);
    }
    expect((await t.call(null, "POST", API_ROUTES.users.import, { rows: rows() })).status).toBe(401);
  });

  it("refuses an empty or oversized file with a 400", async () => {
    expect((await t.call(admin, "POST", API_ROUTES.users.import, { rows: [] })).status).toBe(400);
    const big = Array.from({ length: 1001 }, (_, index) => ({ firstName: `P${index}` }));
    expect((await t.call(admin, "POST", API_ROUTES.users.importPreview, { rows: big })).status).toBe(400);
  });

  describe("re-sending an invite", () => {
    it("sends a fresh link and drops the old one", async () => {
      await t.call(admin, "POST", API_ROUTES.users.import, { rows: rows().slice(0, 1) });
      const asha = await t.prisma.user.findFirstOrThrow({ where: { email: "asha@example.com" } });
      const first = await t.prisma.passwordResetToken.findFirstOrThrow({ where: { userId: asha.id } });
      const res = await t.call(admin, "POST", API_ROUTES.users.invite(asha.id));
      expect(res).toMatchObject({ body: { sent: true }, status: 200 });
      const tokens = await t.prisma.passwordResetToken.findMany({ where: { userId: asha.id } });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].id).not.toBe(first.id);
    });

    it("refuses an account without an email, one that signed in, and admin targets for an admin", async () => {
      await t.call(admin, "POST", API_ROUTES.users.import, { rows: [{ firstName: "Meera" }] });
      const meera = await t.prisma.user.findFirstOrThrow({ where: { firstName: "Meera" } });
      expect((await t.call(admin, "POST", API_ROUTES.users.invite(meera.id))).status).toBe(400);

      const signedIn = await active(UserRole.STUDENT);
      await t.prisma.user.update({ data: { lastLoginAt: new Date() }, where: { id: signedIn.id } });
      expect((await t.call(admin, "POST", API_ROUTES.users.invite(signedIn.id))).status).toBe(400);

      const otherAdmin = await active(UserRole.ADMIN);
      expect((await t.call(admin, "POST", API_ROUTES.users.invite(otherAdmin.id))).status).toBe(403);
      expect((await t.call(superAdmin, "POST", API_ROUTES.users.invite(otherAdmin.id))).status).toBe(200);
    });
  });
});
