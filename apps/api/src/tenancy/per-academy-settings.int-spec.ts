import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { EmailVerificationService } from "../email-admin/email-verification.service";
import { InvoiceSettingsService } from "../payments/invoice-settings.service";
import { ReferralSettingsService } from "../referral/referral-settings.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "./tenant-context";

// Slice 5 (docs/SAAS_MULTI_TENANCY.md § "Phase 3 plan"): settings tables hold
// one row per academy. Nexa's row keeps id "default"; another academy's row is
// keyed by its academy id, and neither sees the other's.
describe("per-academy settings rows (real Postgres)", () => {
  const ACME = "tenant_int_settings";
  let t: TestApp;
  let adminId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    adminId = (await createUser(t.prisma, UserRole.ADMIN)).id;
    await t.prisma.tenant.upsert({
      create: { id: ACME, name: "Settings Academy", slug: "int-settings" },
      update: {},
      where: { id: ACME }
    });
  });

  afterAll(() => t.close());

  const nexa = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "spec:nexa", fn);
  const acme = <T>(fn: () => Promise<T>) => runInTenant(ACME, "spec:acme", fn);

  it("keeps each academy's email-verification policy apart", async () => {
    const email = t.app.get(EmailVerificationService);
    await nexa(() => email.setPolicy("REQUIRED", adminId));
    expect(await acme(() => email.policy())).toBe("OFF");
    await acme(() => email.setPolicy("OFF", adminId));
    expect(await nexa(() => email.policy())).toBe("REQUIRED");

    const rows = await asPlatform("spec: list every academy's row", () => t.prisma.emailSettings.findMany());
    expect(rows.map((row) => [row.id, row.tenantId])).toEqual(
      expect.arrayContaining([
        ["default", DEFAULT_TENANT_ID],
        [ACME, ACME]
      ])
    );
  });

  it("seeds another academy's invoice details from its own name, never Nexa's env", async () => {
    const invoices = t.app.get(InvoiceSettingsService);
    await nexa(() => invoices.update(adminId, { legalName: "Nexa Legal" }));
    const acmeSettings = await acme(() => invoices.getResponse());
    expect(acmeSettings.settings.legalName).toBe("Settings Academy");
    expect(acmeSettings.settings.gstin).toBeNull();
    expect(acmeSettings.configured).toBe(false);
    await acme(() => invoices.update(adminId, { legalName: "Acme Legal" }));
    expect((await nexa(() => invoices.get())).legalName).toBe("Nexa Legal");
    expect((await acme(() => invoices.get())).legalName).toBe("Acme Legal");
  });

  it("creates the referral switches once per academy", async () => {
    const referrals = t.app.get(ReferralSettingsService);
    const [first, second] = [await nexa(() => referrals.get()), await acme(() => referrals.get())];
    expect(first.id).toBe("default");
    expect(second.id).toBe(ACME);
    expect((await acme(() => referrals.get())).id).toBe(ACME);
  });
});
