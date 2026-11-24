import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { LeadStageService } from "../lead/lead-stage.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { runInTenant } from "../tenancy/tenant-context";
import { MetaCapiService, type MetaCapiConfig } from "./meta-capi.service";

const CONFIG: MetaCapiConfig = {
  accessToken: "token",
  apiVersion: "v21.0",
  countryCode: "91",
  datasetId: "123456789",
  testEventCode: "TEST123",
  wabaId: "1337"
};
const OTHER = "tenant_int_meta";

/** The Conversions API outbox against real Postgres (docs/AD_MEASUREMENT.md). Meta is faked. */
describe("Meta Conversions API outbox (real Postgres)", () => {
  let t: TestApp;
  let sent: Record<string, unknown>[];
  const db = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "test:meta-capi", fn);

  beforeAll(async () => {
    t = await createTestApp();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    sent = [];
    const meta = t.app.get(MetaCapiService);
    jest.spyOn(meta, "config").mockReturnValue(CONFIG);
    jest.spyOn(meta, "post").mockImplementation(async (_url, init) => {
      sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return { json: async () => ({ events_received: 1 }), ok: true, status: 200 } as Response;
    });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await t?.close();
  });

  const adLead = (phone: string, tenant = DEFAULT_TENANT_ID) =>
    runInTenant(tenant, "test:meta-capi", async () => {
      const lead = await t.prisma.lead.create({
        data: { experienceLevel: "not_given", parentName: "Priya", phone, source: "WhatsApp ad", studentAge: 0, studentName: "" }
      });
      await t.prisma.leadAdClick.create({
        data: { firstCtwaClid: "CLID-1", firstSeenAt: new Date(), latestCtwaClid: "CLID-1", latestMessageId: `wamid.${phone}`, latestSeenAt: new Date(), leadId: lead.id }
      });
      return lead;
    });
  const websiteLead = (phone: string, adConsent: boolean | null) =>
    db(async () => {
      const visit = await t.prisma.visitorSession.create({
        data: { adConsent, ipAddress: "203.0.113.9", landingPage: "https://nexachess.in/academy", sessionId: `s-${phone}`, userAgent: "Mozilla/5.0", visitorId: `v-${phone}` }
      });
      return t.prisma.lead.create({
        data: { email: "asha@example.com", experienceLevel: "beginner", parentName: "Asha", phone, studentAge: 8, studentName: "Ravi", visitorSessionId: visit.id }
      });
    });
  const events = (leadId: string) => db(() => t.prisma.metaCapiEvent.findMany({ orderBy: { createdAt: "asc" }, where: { leadId } }));

  it("queues QualifiedLead with the stage change, once, and sends it as a test event", async () => {
    const lead = await adLead("919800000101");
    const stages = t.app.get(LeadStageService);
    await db(() => stages.apply(lead.id, "DEMO_BOOKED"));
    await db(() => t.prisma.lead.update({ data: { status: "NO_SHOW" }, where: { id: lead.id } }));
    // Booked again after a missed demo: still one QualifiedLead.
    await db(() => stages.apply(lead.id, "DEMO_BOOKED"));

    const rows = await events(lead.id);
    expect(rows.map((row) => [row.eventName, row.channel, row.status])).toEqual([["QualifiedLead", "whatsapp", "PENDING"]]);

    await db(() => t.app.get(MetaCapiService).sweep());
    expect((await events(lead.id))[0].status).toBe("SENT");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      data: [{ action_source: "business_messaging", event_name: "QualifiedLead", user_data: { ctwa_clid: "CLID-1", whatsapp_business_account_id: "1337" } }],
      test_event_code: "TEST123"
    });
  });

  it("queues a website Schedule only with the visitor's consent", async () => {
    const yes = await websiteLead("9800000102", true);
    const no = await websiteLead("9800000103", false);
    const unanswered = await websiteLead("9800000104", null);
    const stages = t.app.get(LeadStageService);
    for (const lead of [yes, no, unanswered]) await db(() => stages.apply(lead.id, "DEMO_BOOKED"));

    expect((await events(yes.id)).map((row) => row.eventName)).toEqual(["Schedule"]);
    expect(await events(no.id)).toEqual([]);
    expect(await events(unanswered.id)).toEqual([]);
  });

  it("skips a queued website event when consent is withdrawn before it is sent", async () => {
    const lead = await websiteLead("9800000105", true);
    await db(() => t.app.get(LeadStageService).apply(lead.id, "DEMO_BOOKED"));
    await db(() => t.prisma.visitorSession.updateMany({ data: { adConsent: false }, where: { sessionId: "s-9800000105" } }));
    await db(() => t.app.get(MetaCapiService).sweep());
    expect((await events(lead.id))[0]).toMatchObject({ status: "SKIPPED" });
    expect(sent).toEqual([]);
  });

  it("writes nothing when the stage change is undone", async () => {
    const lead = await adLead("919800000106");
    await expect(
      db(() =>
        t.prisma.$transaction(async (tx) => {
          await tx.lead.update({ data: { status: "DEMO_SCHEDULED" }, where: { id: lead.id } });
          await t.app.get(MetaCapiService).onLeadStatus(tx, lead.id, "DEMO_SCHEDULED", new Date());
          throw new Error("rolled back");
        })
      )
    ).rejects.toThrow("rolled back");
    expect(await events(lead.id)).toEqual([]);
  });

  it("never queues for another academy's lead", async () => {
    await t.prisma.tenant.create({ data: { id: OTHER, name: "Meta Academy", slug: "int-meta" } });
    const theirs = await adLead("919800000107", OTHER);
    await runInTenant(OTHER, "test:meta-capi", () => t.app.get(LeadStageService).apply(theirs.id, "DEMO_BOOKED"));
    const rows = await runInTenant(OTHER, "test:meta-capi", () => t.prisma.metaCapiEvent.findMany({ where: { leadId: theirs.id } }));
    expect(rows).toEqual([]);
  });
});
