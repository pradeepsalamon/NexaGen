import { API_ROUTES, DEFAULT_TENANT_ID, type EmailOptOutListResponse } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { runInTenant } from "../tenancy/tenant-context";
import { EmailPreferencesService } from "./email-preferences.service";

describe("email preferences (real app, real Postgres)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const optOutOf = (id: string) =>
    runInTenant(DEFAULT_TENANT_ID, "test:read", () =>
      t.prisma.user.findUniqueOrThrow({ select: { notificationEmailOptOutAt: true }, where: { id } })
    );

  it("the link from an email unsubscribes its own account without a session, and resubscribes", async () => {
    const student = await createUser(t.prisma, UserRole.STUDENT);
    const other = await createUser(t.prisma, UserRole.STUDENT);
    const target = await runInTenant(DEFAULT_TENANT_ID, "test:target", () =>
      t.app.get(EmailPreferencesService).targetFor(student.id)
    );
    const token = new URL(target!.unsubscribeUrl).searchParams.get("token")!;

    const off = await t.call(null, "POST", API_ROUTES.emailPreferences.unsubscribe, { token });
    expect(off).toEqual({ body: { disabledCategories: [], notificationEmails: false }, status: 200 });
    expect((await optOutOf(student.id)).notificationEmailOptOutAt).not.toBeNull();
    expect((await optOutOf(other.id)).notificationEmailOptOutAt).toBeNull();

    // The worker reads the same row at send time.
    const after = await runInTenant(DEFAULT_TENANT_ID, "test:target", () =>
      t.app.get(EmailPreferencesService).targetFor(student.id)
    );
    expect(after).toMatchObject({ optedOut: true, unsubscribeUrl: target!.unsubscribeUrl });

    const on = await t.call(null, "POST", API_ROUTES.emailPreferences.unsubscribe, {
      notificationEmails: true,
      token
    });
    expect(on).toEqual({ body: { disabledCategories: [], notificationEmails: true }, status: 200 });
    expect((await optOutOf(student.id)).notificationEmailOptOutAt).toBeNull();
  });

  it("refuses an unknown token", async () => {
    const res = await t.call(null, "POST", API_ROUTES.emailPreferences.unsubscribe, { token: "x".repeat(64) });
    expect(res.status).toBe(400);
  });

  it("a signed-in person changes only their own setting", async () => {
    const student = await createUser(t.prisma, UserRole.STUDENT);
    const other = await createUser(t.prisma, UserRole.STUDENT);
    // Only an ACTIVE account can sign in.
    await t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: student.id } });

    expect(await t.call(student, "GET", API_ROUTES.emailPreferences.mine)).toEqual({
      body: { disabledCategories: [], notificationEmails: true },
      status: 200
    });
    const res = await t.call(student, "PUT", API_ROUTES.emailPreferences.mine, { notificationEmails: false });
    expect(res).toEqual({ body: { disabledCategories: [], notificationEmails: false }, status: 200 });
    const kinds = await t.call(student, "PUT", API_ROUTES.emailPreferences.mine, { disabledCategories: ["HOMEWORK"] });
    expect(kinds).toEqual({ body: { disabledCategories: ["HOMEWORK"], notificationEmails: false }, status: 200 });
    expect((await optOutOf(other.id)).notificationEmailOptOutAt).toBeNull();
  });

  it("a mail app's one-click POST (query string only) stops just that kind", async () => {
    const student = await createUser(t.prisma, UserRole.STUDENT);
    const target = await runInTenant(DEFAULT_TENANT_ID, "test:target", () =>
      t.app.get(EmailPreferencesService).targetFor(student.id, "CLASSES")
    );
    const oneClick = new URL(target!.oneClickUrl);
    // The link goes through the web's /api proxy; the API itself serves the path without it.
    expect(oneClick.pathname).toBe(`/api${API_ROUTES.emailPreferences.oneClick}`);

    // A mail provider posts with no Origin and no cookie.
    const res = await t.call(null, "POST", `${API_ROUTES.emailPreferences.oneClick}${oneClick.search}`, undefined, { origin: null });
    expect(res).toEqual({ body: { ok: true }, status: 200 });
    const row = await runInTenant(DEFAULT_TENANT_ID, "test:read", () =>
      t.prisma.user.findUniqueOrThrow({
        select: { emailOptOutCategories: true, notificationEmailOptOutAt: true },
        where: { id: student.id }
      })
    );
    expect(row).toEqual({ emailOptOutCategories: ["CLASSES"], notificationEmailOptOutAt: null });
    await expect(
      runInTenant(DEFAULT_TENANT_ID, "test:target", () => t.app.get(EmailPreferencesService).targetFor(student.id, "CLASSES"))
    ).resolves.toMatchObject({ optedOut: true });

    expect((await t.call(null, "POST", `${API_ROUTES.emailPreferences.oneClick}?token=${"x".repeat(40)}`)).status).toBe(400);
  });

  it("admins see who opted out", async () => {
    const admin = await createUser(t.prisma, UserRole.ADMIN);
    await t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: admin.id } });
    const quiet = await createUser(t.prisma, UserRole.STUDENT);
    await t.prisma.user.update({ data: { emailOptOutCategories: ["REFERRALS"] }, where: { id: quiet.id } });

    const res = await t.call(admin, "GET", `${API_ROUTES.adminEmail.optedOut}?search=${encodeURIComponent(quiet.email)}`);
    expect(res.status).toBe(200);
    expect((res.body as EmailOptOutListResponse).accounts).toEqual([
      expect.objectContaining({ disabledCategories: ["REFERRALS"], id: quiet.id, notificationEmails: true, optedOutAt: null })
    ]);
  });
});
