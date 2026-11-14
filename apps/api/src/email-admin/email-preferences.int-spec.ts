import { API_ROUTES, DEFAULT_TENANT_ID } from "@nexa-chess/types";
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
    expect(off).toEqual({ body: { notificationEmails: false }, status: 200 });
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
    expect(on).toEqual({ body: { notificationEmails: true }, status: 200 });
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
      body: { notificationEmails: true },
      status: 200
    });
    const res = await t.call(student, "PUT", API_ROUTES.emailPreferences.mine, { notificationEmails: false });
    expect(res).toEqual({ body: { notificationEmails: false }, status: 200 });
    expect((await optOutOf(other.id)).notificationEmailOptOutAt).toBeNull();
  });
});
