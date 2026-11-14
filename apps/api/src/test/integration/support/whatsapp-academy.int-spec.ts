import {
  ALLOWED_NUMBER,
  OTHER_ALLOWED_NUMBER,
  TEST_APP_SECRET,
  TEST_GRAPH_BASE,
  TEST_PHONE_NUMBER_ID,
  TEST_VERIFY_TOKEN,
  restoreWhatsAppEnv
} from "./whatsapp-env";
import { createHmac } from "node:crypto";
import {
  API_ROUTES,
  DEFAULT_SUPPORT_MENU,
  DEFAULT_TENANT_ID,
  type SupportSettingsResponse,
  type UpdateSupportSettingsRequest,
  type WhatsAppSettingsResponse
} from "@nexa-chess/types";
import { UserRole, type User } from "@prisma/client";
import { EntitlementService } from "../../../platform/entitlement.service";
import { asPlatform, runInTenant } from "../../../tenancy/tenant-context";
import { TenantResolverService } from "../../../tenancy/tenant-resolver.service";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

// Another academy's own WhatsApp number (docs/WHATSAPP_SUPPORT_MODES_PLAN.md
// Phase B): its own webhook URL, app secret and verify token; its own bot
// settings; nothing crosses to or from Nexa's number.

const ROOK = "tenant_int_wa_rook";
const ROOK_ORIGIN = "https://academy-rook.int.test";
const ROOK_NUMBER_ID = "200000000000002";
const ROOK_SECRET = "rook-app-secret";
const ROOK_TOKEN = "rook-access-token";
const BISHOP = "tenant_int_wa_bishop";
const BISHOP_ORIGIN = "https://academy-bishop.int.test";

const BOT_ON: UpdateSupportSettingsRequest = {
  agentReplyTemplate: "",
  agentReplyTemplateLanguage: "en",
  botEnabled: true,
  hours: null,
  leadNudgeHours: 20,
  menu: DEFAULT_SUPPORT_MENU,
  outOfHoursMessage: "",
  staffReminderMinutes: 15,
  testNumbers: []
};

type Sent = { from: string; to: string; token: string };

describe("WhatsApp on an academy's own number (real app, real Postgres)", () => {
  let t: TestApp;
  let sent: Sent[];
  let nexaAdmin: User;
  let rookOwner: User & { tenantId: string };
  let bishopOwner: User & { tenantId: string };
  let wamid = 0;
  const realFetch = global.fetch;

  beforeAll(async () => {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(TEST_GRAPH_BASE)) return realFetch(input, init);
      const from = /\/v21\.0\/(\d+)\/messages$/.exec(url)?.[1] ?? "?";
      const payload = JSON.parse(String(init?.body)) as { to: string };
      const token = String((init?.headers as Record<string, string>)?.Authorization ?? "").replace(/^Bearer /, "");
      sent.push({ from, to: payload.to, token });
      wamid += 1;
      return new Response(JSON.stringify({ messages: [{ id: `wamid.academy.out.${wamid}` }], messaging_product: "whatsapp" }), {
        headers: { "Content-Type": "application/json" },
        status: 200
      });
    }) as typeof fetch;
    t = await createTestApp();
  });

  afterAll(async () => {
    global.fetch = realFetch;
    await t?.close();
    restoreWhatsAppEnv();
  });

  async function academy(id: string, origin: string): Promise<User & { tenantId: string }> {
    await t.prisma.tenant.create({ data: { id, name: id, slug: id.replace(/_/g, "-") } });
    await t.prisma.tenantDomain.create({ data: { hostname: new URL(origin).hostname, kind: "CUSTOM", status: "ACTIVE", tenantId: id } });
    await t.prisma.tenantSubscription.create({ data: { planId: "plan_enterprise", status: "ACTIVE", tenantId: id } });
    const owner = await runInTenant(id, "test: academy owner", async () => {
      const user = await createUser(t.prisma, UserRole.SUPER_ADMIN);
      return t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } });
    });
    return { ...owner, tenantId: id };
  }

  beforeEach(async () => {
    sent = [];
    await resetDatabase(t.prisma);
    nexaAdmin = await runInTenant(DEFAULT_TENANT_ID, "test: nexa admin", async () => {
      const user = await createUser(t.prisma, UserRole.ADMIN);
      return t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } });
    });
    rookOwner = await academy(ROOK, ROOK_ORIGIN);
    bishopOwner = await academy(BISHOP, BISHOP_ORIGIN);
    t.app.get(EntitlementService).invalidate();
    t.app.get(TenantResolverService).invalidate();
  });

  const asRook = (method: string, path: string, body?: unknown) => t.call(rookOwner, method, path, body, { origin: ROOK_ORIGIN });

  async function connectRook(): Promise<WhatsAppSettingsResponse> {
    const res = await asRook("PUT", API_ROUTES.branding.whatsapp, {
      accessToken: ROOK_TOKEN,
      appSecret: ROOK_SECRET,
      enabled: true,
      phoneNumberId: ROOK_NUMBER_ID,
      wabaId: "300000000000003"
    });
    expect(res.status).toBe(200);
    return res.body as WhatsAppSettingsResponse;
  }

  let inbound = 0;
  function textTo(phoneNumberId: string, from: string, body: string) {
    return JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: [{ profile: { name: "Arun" }, wa_id: from }],
                messages: [{ from, id: `wamid.academy.in.${++inbound}`, text: { body }, timestamp: String(Math.floor(Date.now() / 1000)), type: "text" }],
                messaging_product: "whatsapp",
                metadata: { display_phone_number: "919888888888", phone_number_id: phoneNumberId }
              }
            }
          ],
          id: "WABA"
        }
      ],
      object: "whatsapp_business_account"
    });
  }

  const sign = (raw: string, secret: string) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const url = (path: string) => `${t.baseUrl.replace("[::1]", "127.0.0.1")}${path}`;

  async function post(path: string, raw: string, secret: string) {
    const res = await fetch(url(path), {
      body: raw,
      headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(raw, secret) },
      method: "POST"
    });
    return { body: (await res.json()) as unknown, status: res.status };
  }

  async function settle() {
    for (let i = 0; i < 100; i += 1) {
      const pending = await asPlatform("test", () =>
        t.prisma.whatsAppWebhookEvent.count({ where: { ignoredAt: null, processedAt: null } })
      );
      const outbox = await asPlatform("test", () => t.prisma.supportMessage.count({ where: { status: "PENDING" } }));
      if (pending === 0 && outbox === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("WhatsApp events were not processed in time.");
  }

  it("gives the academy its own webhook URL and verify token, and one academy per number", async () => {
    const settings = await connectRook();
    expect(settings).toMatchObject({ hasAppSecret: true, receiving: true, wabaId: "300000000000003" });
    expect(settings.webhookPath).toMatch(/^\/webhooks\/whatsapp\/[A-Za-z0-9_-]{24}$/);
    expect(settings.verifyToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    // Saving again keeps the URL and token the academy pasted into Meta.
    const again = await connectRook();
    expect([again.webhookPath, again.verifyToken]).toEqual([settings.webhookPath, settings.verifyToken]);

    const handshake = (token: string) =>
      fetch(url(`${settings.webhookPath}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=42`));
    const ok = await handshake(settings.verifyToken!);
    expect([ok.status, await ok.text()]).toEqual([200, "42"]);
    expect((await handshake(TEST_VERIFY_TOKEN)).status).toBe(403);
    expect((await fetch(url(`${API_ROUTES.whatsappWebhookAcademy("unknown-key-0123456789abcd")}?hub.mode=subscribe&hub.verify_token=x&hub.challenge=1`))).status).toBe(403);

    const claim = (phoneNumberId: string) =>
      t.call(bishopOwner, "PUT", API_ROUTES.branding.whatsapp, { accessToken: "b", enabled: true, phoneNumberId }, { origin: BISHOP_ORIGIN });
    expect((await claim(ROOK_NUMBER_ID)).status).toBe(409);
    expect((await claim(TEST_PHONE_NUMBER_ID)).status).toBe(409); // Nexa's own number
    expect((await claim("200000000000009")).status).toBe(200);
  });

  it("answers the academy's customers from its own number, and nothing crosses academies", async () => {
    const { webhookPath } = await connectRook();
    expect((await asRook("PUT", API_ROUTES.adminSupport.settings, BOT_ON)).status).toBe(200);

    const forRook = textTo(ROOK_NUMBER_ID, ALLOWED_NUMBER, "hi");
    // Wrong secret, Nexa's URL, an unknown key: refused before anything is stored.
    expect((await post(webhookPath!, forRook, TEST_APP_SECRET)).status).toBe(401);
    expect((await post(API_ROUTES.whatsappWebhook, forRook, ROOK_SECRET)).status).toBe(401);
    expect((await post(API_ROUTES.whatsappWebhookAcademy("unknown-key-0123456789abcd"), forRook, ROOK_SECRET)).status).toBe(401);
    // Correctly signed by the academy but for another number (Nexa's): dropped.
    expect(await post(webhookPath!, textTo(TEST_PHONE_NUMBER_ID, ALLOWED_NUMBER, "hi"), ROOK_SECRET)).toEqual({
      body: { received: 0 },
      status: 200
    });
    expect(await asPlatform("test", () => t.prisma.whatsAppWebhookEvent.count())).toBe(0);

    expect(await post(webhookPath!, forRook, ROOK_SECRET)).toEqual({ body: { received: 1 }, status: 200 });
    await settle();
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((message) => message.from === ROOK_NUMBER_ID && message.token === ROOK_TOKEN && message.to === ALLOWED_NUMBER)).toBe(true);

    const contacts = await asPlatform("test", () => t.prisma.whatsAppContact.findMany({ select: { tenantId: true, waId: true } }));
    expect(contacts).toEqual([{ tenantId: ROOK, waId: ALLOWED_NUMBER }]);
    const event = await asPlatform("test", () => t.prisma.whatsAppWebhookEvent.findFirstOrThrow());
    expect([event.tenantId, event.phoneNumberId]).toEqual([ROOK, ROOK_NUMBER_ID]);
    const row = await asPlatform("test", () => t.prisma.whatsAppSettings.findUniqueOrThrow({ where: { tenantId: ROOK } }));
    expect(row.lastWebhookAt).not.toBeNull();
  });

  it("keeps the bot off until the academy switches it on, and off without the plan feature", async () => {
    const { webhookPath } = await connectRook();
    expect((await post(webhookPath!, textTo(ROOK_NUMBER_ID, ALLOWED_NUMBER, "hi"), ROOK_SECRET)).status).toBe(200);
    await settle();
    expect(sent).toEqual([]); // no settings saved: off (Nexa's server switch is not lent out)

    const before = (await asRook("GET", API_ROUTES.adminSupport.settings)).body as SupportSettingsResponse;
    expect(before).toMatchObject({ botEnabled: false, connection: { receiving: true, usesPlatformNumber: false }, source: "ACADEMY" });

    expect((await asRook("PUT", API_ROUTES.adminSupport.settings, BOT_ON)).status).toBe(200);
    expect((await post(webhookPath!, textTo(ROOK_NUMBER_ID, ALLOWED_NUMBER, "hi again"), ROOK_SECRET)).status).toBe(200);
    await settle();
    expect(sent.length).toBeGreaterThan(0);

    // A plan without WhatsApp support: the bot goes quiet, the inbox stays readable, settings can't change.
    await t.prisma.tenantSubscription.updateMany({ data: { planId: "plan_starter" }, where: { tenantId: ROOK } });
    t.app.get(EntitlementService).invalidate();
    sent = [];
    expect((await post(webhookPath!, textTo(ROOK_NUMBER_ID, ALLOWED_NUMBER, "menu"), ROOK_SECRET)).status).toBe(200);
    await settle();
    expect(sent).toEqual([]);
    expect((await asRook("GET", API_ROUTES.adminSupport.tickets)).status).toBe(200);
    expect((await asRook("PUT", API_ROUTES.adminSupport.settings, BOT_ON)).status).toBe(402);
  });

  it("keeps Nexa on the server's values until its admins save the page", async () => {
    const before = await t.call(nexaAdmin, "GET", API_ROUTES.adminSupport.settings);
    expect(before.body).toMatchObject({
      botEnabled: true,
      connection: { receiving: true, usesPlatformNumber: true },
      source: "SERVER",
      testNumbers: [ALLOWED_NUMBER, OTHER_ALLOWED_NUMBER]
    });

    const saved = await t.call(nexaAdmin, "PUT", API_ROUTES.adminSupport.settings, { ...BOT_ON, testNumbers: ["+91 90000 00001", ALLOWED_NUMBER] });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ source: "ACADEMY", testNumbers: [ALLOWED_NUMBER] });

    expect((await t.call(nexaAdmin, "PUT", API_ROUTES.adminSupport.settings, { ...BOT_ON, testNumbers: ["call me"] })).status).toBe(400);
    expect((await t.call(nexaAdmin, "PUT", API_ROUTES.adminSupport.settings, { ...BOT_ON, leadNudgeHours: 24 })).status).toBe(400);
    const student = await runInTenant(DEFAULT_TENANT_ID, "test: student", async () => {
      const user = await createUser(t.prisma, UserRole.STUDENT);
      return t.prisma.user.update({ data: { status: "ACTIVE" }, where: { id: user.id } });
    });
    expect((await t.call(student, "GET", API_ROUTES.adminSupport.settings)).status).toBe(403);

    // The saved list now decides: the second server test number is no longer answered.
    expect((await post(API_ROUTES.whatsappWebhook, textTo(TEST_PHONE_NUMBER_ID, OTHER_ALLOWED_NUMBER, "hi"), TEST_APP_SECRET)).status).toBe(200);
    await settle();
    expect(sent).toEqual([]);
    expect((await post(API_ROUTES.whatsappWebhook, textTo(TEST_PHONE_NUMBER_ID, ALLOWED_NUMBER, "hi"), TEST_APP_SECRET)).status).toBe(200);
    await settle();
    expect(sent.map((message) => message.from)).toContain(TEST_PHONE_NUMBER_ID);
  });
});
