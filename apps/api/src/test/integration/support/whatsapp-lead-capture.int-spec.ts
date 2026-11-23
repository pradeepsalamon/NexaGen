import { CAPTURE_APP_SECRET, CAPTURE_GRAPH_BASE, CAPTURE_PHONE_NUMBER_ID, restoreCaptureEnv } from "./whatsapp-capture-env";
import { createHmac } from "node:crypto";
import { API_ROUTES, DEFAULT_TENANT_ID, LEAD_DETAILS_NOT_GIVEN } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { FrappeCrmPushService, type FrappeCrmConfig } from "../../../lead/frappe-crm-push.service";
import { LeadService } from "../../../lead/lead.service";
import { SupportLeadCaptureService } from "../../../support/support-lead-capture.service";
import { asPlatform, runInTenant } from "../../../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

// WhatsApp lead capture end to end (docs/LEAD_STAGES.md "WhatsApp lead capture"): signed
// webhooks into the real app and database with the bot off. Nothing may be sent to Meta,
// and Frappe is faked.

const FRAPPE: FrappeCrmConfig = {
  apiKey: "key",
  apiSecret: "secret",
  countryCode: "91",
  leadSource: "Direct WhatsApp",
  leadStatus: "New Inquiry",
  stageSync: true,
  url: "https://crm.capture.int.test",
  websiteLeadSource: "Website Form"
};
const OTHER = "tenant_int_capture";

describe("WhatsApp lead capture (real app, real Postgres)", () => {
  let t: TestApp;
  let graphCalls: string[];
  let frappeCalls: { body: unknown; method: string; path: string }[];
  const realFetch = global.fetch;
  const db = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "test:capture", fn);

  beforeAll(async () => {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(CAPTURE_GRAPH_BASE)) {
        graphCalls.push(url);
        return new Response("{}", { status: 500 });
      }
      return realFetch(input, init);
    }) as typeof fetch;
    t = await createTestApp();
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await t?.close();
    restoreCaptureEnv();
  });

  beforeEach(async () => {
    graphCalls = [];
    frappeCalls = [];
    await resetDatabase(t.prisma);
    const push = t.app.get(FrappeCrmPushService);
    jest.spyOn(push, "config").mockReturnValue(FRAPPE);
    jest.spyOn(push, "request").mockImplementation(async (_config, method, path, body) => {
      frappeCalls.push({ body, method, path: decodeURIComponent(path) });
      if (method === "POST" && path.includes("CRM%20Lead")) return { data: { name: "CRM-LEAD-CAPTURE-1" } };
      return { data: [] };
    });
  });

  afterEach(() => jest.restoreAllMocks());

  let inbound = 0;
  function messageBody(from: string, extra: Record<string, unknown> = {}, id = `wamid.cap.${++inbound}`, name = "Priya") {
    return JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ profile: { name }, wa_id: from }],
                messages: [{ from, id, text: { body: "Hello! Can I get more info on this?" }, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", ...extra }],
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "919999999999", phone_number_id: CAPTURE_PHONE_NUMBER_ID }
              }
            }
          ],
          id: "WABA"
        }
      ],
      object: "whatsapp_business_account"
    });
  }
  const ad = (sourceId: string, headline: string, ctwaClid: string) => ({
    referral: { ctwa_clid: ctwaClid, headline, source_id: sourceId, source_type: "ad", source_url: "https://fb.me/x" }
  });

  async function post(raw: string) {
    const signature = `sha256=${createHmac("sha256", CAPTURE_APP_SECRET).update(raw).digest("hex")}`;
    const res = await fetch(`${t.baseUrl.replace("[::1]", "127.0.0.1")}${API_ROUTES.whatsappWebhook}`, {
      body: raw,
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
      method: "POST"
    });
    expect(res.status).toBe(200);
    for (let i = 0; i < 100; i += 1) {
      const pending = await asPlatform("test", () => t.prisma.whatsAppWebhookEvent.count({ where: { ignoredAt: null, processedAt: null } }));
      if (pending === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("WhatsApp events were not processed in time.");
  }

  const leads = () => db(() => t.prisma.lead.findMany({ include: { activities: true, adClick: true, crmPush: true }, orderBy: { createdAt: "asc" } }));

  it("makes a lead of a new number's first message, sends nothing, and copies it to Frappe without child details", async () => {
    await post(messageBody("919800000001"));
    const [lead, ...rest] = await leads();
    expect(rest).toEqual([]);
    expect(lead).toMatchObject({
      ...LEAD_DETAILS_NOT_GIVEN,
      campaign: null,
      parentName: "Priya",
      phone: "919800000001",
      source: "WhatsApp",
      status: "NEW"
    });
    expect(lead.adClick).toBeNull();
    expect(lead.activities.map((a) => a.title)).toContain("Started a WhatsApp chat");
    expect(graphCalls).toEqual([]);
    // No transcript either: the bot is off and the inbox untouched.
    expect(await db(() => t.prisma.supportMessage.count())).toBe(0);

    for (let i = 0; i < 50 && (await leads())[0].crmPush?.status !== "SENT"; i += 1) await new Promise((r) => setTimeout(r, 50));
    const created = frappeCalls.find((call) => call.method === "POST" && call.path.endsWith("CRM Lead"));
    expect(created?.body).toMatchObject({ first_name: "Priya", mobile_no: "+919800000001", source: "Direct WhatsApp", status: "Demo Requested" });
    expect(created?.body).not.toHaveProperty("student_name");
  });

  it("tags an ad chat, keeps the first and the latest click, and never makes a second lead", async () => {
    await post(messageBody("919800000002", ad("120200000000000001", "Chess for kids", "CLID-1")));
    await post(messageBody("919800000002"));
    await post(messageBody("919800000002", ad("120200000000000002", "Weekend batch", "CLID-2")));

    const [lead, ...rest] = await leads();
    expect(rest).toEqual([]);
    expect(lead).toMatchObject({ campaign: "Chess for kids", source: "WhatsApp ad" });
    expect(lead.adClick).toMatchObject({
      clicks: 2,
      firstAdId: "120200000000000001",
      firstCtwaClid: "CLID-1",
      firstHeadline: "Chess for kids",
      latestAdId: "120200000000000002",
      latestCtwaClid: "CLID-2",
      latestHeadline: "Weekend batch"
    });
    expect(lead.activities.filter((a) => a.activityType === "WHATSAPP_AD_CLICK")).toHaveLength(2);
  });

  it("records STOP and START with the bot off, so proactive WhatsApp stops, and sends nothing", async () => {
    const contact = () => db(() => t.prisma.whatsAppContact.findFirst({ where: { waId: "919800000099" } }));
    await post(messageBody("919800000099", { text: { body: "STOP" } }));
    expect((await contact())?.optedOutAt).toBeInstanceOf(Date);
    await post(messageBody("919800000099", { text: { body: "start" } }));
    expect((await contact())?.optedOutAt).toBeNull();
    expect(graphCalls).toEqual([]);
    expect(await db(() => t.prisma.supportMessage.count())).toBe(0);
  });

  it("does nothing twice for the same message", async () => {
    const raw = messageBody("919800000003", ad("120200000000000003", "Trial", "CLID-3"), "wamid.cap.same");
    await post(raw);
    await post(raw);
    const capture = t.app.get(SupportLeadCaptureService);
    const event = await db(() => t.prisma.whatsAppWebhookEvent.findUniqueOrThrow({ where: { dedupeKey: "msg:wamid.cap.same" } }));
    await expect(db(() => capture.capture(event))).resolves.toMatchObject({ kind: "SEEN" });

    const [lead, ...rest] = await leads();
    expect(rest).toEqual([]);
    expect(lead.adClick?.clicks).toBe(1);
  });

  // Review Part 1 #2: an older ad message processed again, after a newer click, isn't counted twice.
  it("counts an older ad message once when it is processed again after a newer click", async () => {
    await post(messageBody("919800000004", ad("120200000000000004", "First", "CLID-4"), "wamid.cap.older"));
    await post(messageBody("919800000004", ad("120200000000000005", "Second", "CLID-5"), "wamid.cap.newer"));
    const capture = t.app.get(SupportLeadCaptureService);
    const older = await db(() => t.prisma.whatsAppWebhookEvent.findUniqueOrThrow({ where: { dedupeKey: "msg:wamid.cap.older" } }));
    await db(() => capture.capture(older));

    const [lead] = await leads();
    expect(lead.adClick).toMatchObject({ clicks: 2, latestAdId: "120200000000000005" });
    expect(lead.activities.filter((a) => a.activityType === "WHATSAPP_AD_CLICK")).toHaveLength(2);
  });

  it("makes one lead when two messages from a new number are handled at once", async () => {
    const capture = t.app.get(SupportLeadCaptureService);
    const at = new Date();
    const event = (id: string) => ({ adReferral: null, occurredAt: at, profileName: "Ravi", providerMessageId: id, waId: "919800000004" });
    const outcomes = await Promise.all([db(() => capture.capture(event("wamid.a"))), db(() => capture.capture(event("wamid.b")))]);
    expect(outcomes.map((o) => o.kind).sort()).toEqual(["CREATED", "SEEN"]);
    expect(await leads()).toHaveLength(1);
  });

  it("makes no lead for a number on an account, the student's or the parent's", async () => {
    const student = await createUser(t.prisma, UserRole.STUDENT);
    await db(() => t.prisma.user.update({ data: { phoneNumber: "+91 98000 00005".replace(/\s/g, "") }, where: { id: student.id } }));
    const child = await createUser(t.prisma, UserRole.STUDENT);
    await db(() => t.prisma.studentProfile.create({ data: { parentName: "Mum", parentPhone: "9800000006", userId: child.id } }));

    await post(messageBody("919800000005"));
    await post(messageBody("919800000006"));
    expect(await leads()).toEqual([]);
  });

  it("makes a new lead for a number whose only lead is Lost", async () => {
    await db(() =>
      t.prisma.lead.create({
        data: { experienceLevel: "beginner", parentName: "Old", phone: "9800000007", status: "LOST", studentAge: 9, studentName: "Kid" }
      })
    );
    await post(messageBody("919800000007"));
    const all = await leads();
    expect(all.map((lead) => lead.status)).toEqual(["LOST", "NEW"]);
  });

  it("attaches an ad click to an open website lead instead of making a second lead", async () => {
    const site = await db(() =>
      t.prisma.lead.create({
        data: { experienceLevel: "beginner", parentName: "Asha", phone: "9800000008", source: "instagram", studentAge: 8, studentName: "Ravi" }
      })
    );
    await post(messageBody("919800000008", ad("120200000000000009", "Chess for kids", "CLID-9")));
    const all = await leads();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: site.id, source: "instagram", studentName: "Ravi" });
    expect(all[0].adClick?.latestCtwaClid).toBe("CLID-9");
  });

  it("records but ignores messages once an admin saves capture off", async () => {
    await db(() => t.prisma.supportSettings.create({ data: { captureLeads: false } }));
    await post(messageBody("919800000010"));
    expect(await leads()).toEqual([]);
    const event = await db(() => t.prisma.whatsAppWebhookEvent.findFirstOrThrow({ where: { waId: "919800000010" } }));
    expect(event.ignoredAt).not.toBeNull();
  });

  it("never captures for another academy, whatever its settings say", async () => {
    await t.prisma.tenant.create({ data: { id: OTHER, name: "Capture Academy", slug: "int-capture" } });
    const capture = t.app.get(SupportLeadCaptureService);
    await runInTenant(OTHER, "test:capture", async () => {
      expect(capture.enabled({ captureLeads: true })).toBe(false);
    });
    await db(async () => expect(capture.enabled({ captureLeads: true })).toBe(true));
  });

  it("lets the bot's later booking fill in a captured lead's child details", async () => {
    await post(messageBody("919800000011"));
    const [captured] = await leads();
    await db(() =>
      t.prisma.$transaction((tx) =>
        t.app.get(LeadService).upsertFromWhatsApp(tx, {
          level: "beginner",
          now: new Date(),
          parentName: "Priya S",
          phone: "919800000011",
          studentAge: 7,
          studentName: "Anu"
        } as Parameters<LeadService["upsertFromWhatsApp"]>[1])
      )
    );
    const [after, ...rest] = await leads();
    expect(rest).toEqual([]);
    expect(after).toMatchObject({ experienceLevel: "beginner", id: captured.id, parentName: "Priya", studentAge: 7, studentName: "Anu" });
  });
});
