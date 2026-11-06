import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { EmailVerificationService } from "../email-admin/email-verification.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { InvoiceSettingsService } from "../payments/invoice-settings.service";
import { ReferralPipelineService } from "../referral/referral-pipeline.service";
import { ReferralSettingsService } from "../referral/referral-settings.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "./tenant-context";
import { requireTenantId } from "./tenant-sql";

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

  it("keeps each academy's system message wording apart (same key, after §D5)", async () => {
    // §D5 re-keys the table to (tenantId, key); done here the same way and put back after.
    await t.prisma.$executeRawUnsafe(`ALTER TABLE "system_message_templates" DROP CONSTRAINT "system_message_templates_pkey",
      ADD CONSTRAINT "system_message_templates_pkey" PRIMARY KEY ("tenantId", "key")`);
    try {
      const save = (body: string) =>
        t.prisma.systemMessageTemplate.upsert({
          create: { body, key: "PASSWORD_RESET" },
          update: { body },
          where: { tenantId_key: { key: "PASSWORD_RESET", tenantId: requireTenantId("spec") } }
        });
      await nexa(() => save("Nexa wording"));
      await acme(() => save("Acme wording"));
      await acme(() => save("Acme wording, edited"));
      const renderer = t.app.get(SystemMessageRenderer);
      expect((await nexa(() => renderer.render("PASSWORD_RESET", {}))).body).toBe("Nexa wording");
      expect((await acme(() => renderer.render("PASSWORD_RESET", {}))).body).toBe("Acme wording, edited");
    } finally {
      await asPlatform("spec: restore the pre-D5 key", () => t.prisma.systemMessageTemplate.deleteMany({}));
      await t.prisma.$executeRawUnsafe(`ALTER TABLE "system_message_templates" DROP CONSTRAINT "system_message_templates_pkey",
        ADD CONSTRAINT "system_message_templates_pkey" PRIMARY KEY ("key")`);
    }
  });

  it("gives another academy its own default referral stages (ids never Nexa's)", async () => {
    const pipeline = t.app.get(ReferralPipelineService);
    const nexaStages = await nexa(() => pipeline.listStages());
    // A second academy needs §D5, which drops this global index (contract
    // d5_saas_drop_global_uniques); dropped here the same way and put back after.
    await t.prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "referral_stages_trigger_automatic_key"');
    try {
      const acmeStages = await acme(() => pipeline.listStages());
      expect(nexaStages.map((stage) => stage.id)).toContain("refstage_visited");
      expect(acmeStages).toHaveLength(nexaStages.length);
      expect(acmeStages.every((stage) => stage.tenantId === ACME && stage.id.endsWith(`_${ACME}`))).toBe(true);
      expect(pipeline.entryStage(acmeStages).trigger).toBe("LINK_VISITED");
      // A second read reuses them.
      expect((await acme(() => pipeline.listStages())).map((stage) => stage.id)).toEqual(acmeStages.map((stage) => stage.id));
    } finally {
      await asPlatform("spec: restore the pre-D5 index", () => t.prisma.referralStage.deleteMany({ where: { tenantId: ACME } }));
      await t.prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "referral_stages_trigger_automatic_key" ON "referral_stages"("trigger") WHERE "trigger" <> 'MANUAL'`
      );
    }
  });
});
