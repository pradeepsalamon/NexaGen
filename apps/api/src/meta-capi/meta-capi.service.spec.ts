import { createHash } from "node:crypto";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import {
  META_EVENT_NAMES,
  buildMetaCapiEvent,
  metaFbc,
  metaMilestoneForStatus,
  normalizeMetaEmail,
  normalizeMetaPhone
} from "./meta-capi.payload";
import { META_CAPI_MAX_ATTEMPTS, MetaCapiService, type MetaCapiConfig } from "./meta-capi.service";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const AT = new Date("2026-11-22T10:00:00.000Z");

describe("Meta event names", () => {
  it("uses the business-messaging events for WhatsApp and the website ones otherwise", () => {
    expect(META_EVENT_NAMES.CREATED).toEqual({ website: "Lead", whatsapp: "LeadSubmitted" });
    expect(META_EVENT_NAMES.DEMO_BOOKED).toEqual({ website: "Schedule", whatsapp: "QualifiedLead" });
    expect(META_EVENT_NAMES.CONVERTED).toEqual({ website: "Purchase", whatsapp: "Purchase" });
  });

  it("tells Meta only about a booked demo and a conversion", () => {
    expect(metaMilestoneForStatus("DEMO_SCHEDULED")).toBe("DEMO_BOOKED");
    expect(metaMilestoneForStatus("CONVERTED")).toBe("CONVERTED");
    expect(metaMilestoneForStatus("ACTIVE_STUDENT")).toBe("CONVERTED");
    for (const other of ["NEW", "CONTACTED", "INTERESTED", "DEMO_CONFIRMED", "DEMO_ATTENDED", "NO_SHOW", "FOLLOW_UP", "PAYMENT_PENDING", "LOST"] as const) {
      expect(metaMilestoneForStatus(other)).toBeNull();
    }
  });
});

describe("normalising and hashing", () => {
  it("puts phone numbers in Meta's form: digits with the country code", () => {
    expect(normalizeMetaPhone("98765 43210", "91")).toBe("919876543210");
    expect(normalizeMetaPhone("+91-98765-43210", "91")).toBe("919876543210");
    expect(normalizeMetaPhone("09876543210", "91")).toBe("919876543210");
    expect(normalizeMetaPhone("447700900123", "91")).toBe("447700900123");
    expect(normalizeMetaPhone("123", "91")).toBeNull();
  });

  it("lower-cases emails and refuses non-addresses", () => {
    expect(normalizeMetaEmail("  Asha@Example.COM ")).toBe("asha@example.com");
    expect(normalizeMetaEmail("not an email")).toBeNull();
    expect(normalizeMetaEmail(null)).toBeNull();
  });

  it("builds fbc from the click id and when it was seen", () => {
    expect(metaFbc("IwAR123", AT)).toBe(`fb.1.${AT.getTime()}.IwAR123`);
    expect(metaFbc(null, AT)).toBeNull();
  });
});

describe("buildMetaCapiEvent", () => {
  it("makes a WhatsApp event with only the account id and the click id", () => {
    expect(
      buildMetaCapiEvent({
        channel: "whatsapp",
        eventId: "nexa.LeadSubmitted.lead_1",
        eventName: "LeadSubmitted",
        eventTime: AT,
        value: null,
        whatsapp: { ctwaClid: "CLID", wabaId: "1337" }
      })
    ).toEqual({
      action_source: "business_messaging",
      event_id: "nexa.LeadSubmitted.lead_1",
      event_name: "LeadSubmitted",
      event_time: Math.floor(AT.getTime() / 1000),
      messaging_channel: "whatsapp",
      user_data: { ctwa_clid: "CLID", whatsapp_business_account_id: "1337" }
    });
  });

  it("makes a website event with hashed parent contact details and the visit's signals", () => {
    const event = buildMetaCapiEvent({
      channel: "website",
      eventId: "pixel-event-0001",
      eventName: "Lead",
      eventTime: AT,
      value: null,
      website: {
        clientIp: "203.0.113.9",
        countryCode: "91",
        email: "Asha@Example.com",
        fbclid: "IwAR123",
        fbclidSeenAt: AT,
        fbp: "fb.1.1700000000000.123456",
        pageUrl: "https://nexachess.in/academy",
        phone: "9876543210",
        userAgent: "Mozilla/5.0"
      }
    });
    expect(event).toEqual({
      action_source: "website",
      event_id: "pixel-event-0001",
      event_name: "Lead",
      event_source_url: "https://nexachess.in/academy",
      event_time: Math.floor(AT.getTime() / 1000),
      user_data: {
        client_ip_address: "203.0.113.9",
        client_user_agent: "Mozilla/5.0",
        em: [hash("asha@example.com")],
        fbc: `fb.1.${AT.getTime()}.IwAR123`,
        fbp: "fb.1.1700000000000.123456",
        ph: [hash("919876543210")]
      }
    });
    // Nothing readable about the family leaves.
    expect(JSON.stringify(event)).not.toContain("9876543210");
    expect(JSON.stringify(event).toLowerCase()).not.toContain("asha");
  });

  it("adds the paid amount to a Purchase in major units", () => {
    const event = buildMetaCapiEvent({
      channel: "whatsapp",
      eventId: "nexa.Purchase.lead_1",
      eventName: "Purchase",
      eventTime: AT,
      value: { currency: "inr", minor: 249950 },
      whatsapp: { ctwaClid: "CLID", wabaId: "1337" }
    });
    expect(event.custom_data).toEqual({ currency: "INR", value: 2499.5 });
  });
});

const CONFIG: MetaCapiConfig = {
  accessToken: "token",
  apiVersion: "v21.0",
  countryCode: "91",
  datasetId: "123456789",
  testEventCode: null,
  wabaId: "1337"
};

type Row = {
  attempts: number;
  channel: string;
  currency: string | null;
  eventId: string;
  eventName: string;
  eventTime: Date;
  id: string;
  lead: {
    adClick: { firstCtwaClid: string | null; latestCtwaClid: string | null } | null;
    email: string | null;
    phone: string;
    visitorSession: Record<string, unknown> | null;
  };
  valueMinor: number | null;
};

function fakePrisma(row: Row) {
  const updates: Record<string, unknown>[] = [];
  const prisma = {
    metaCapiEvent: {
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      },
      updateMany: async () => {
        row.attempts += 1;
        return { count: 1 };
      }
    }
  };
  return { prisma, updates };
}

function service(prisma: unknown, answer: (url: string, body: Record<string, unknown>) => { body: unknown; status: number }, config: MetaCapiConfig = CONFIG) {
  const svc = new MetaCapiService({} as never, prisma as never);
  jest.spyOn(svc, "config").mockReturnValue(config);
  const calls: { body: Record<string, unknown>; headers: Record<string, string>; url: string }[] = [];
  jest.spyOn(svc, "post").mockImplementation(async (url, init) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ body, headers: init.headers as Record<string, string>, url });
    const reply = answer(url, body);
    return { json: async () => reply.body, ok: reply.status >= 200 && reply.status < 300, status: reply.status } as Response;
  });
  return { calls, svc };
}

const whatsappRow = (): Row => ({
  attempts: 0,
  channel: "whatsapp",
  currency: null,
  eventId: "nexa.LeadSubmitted.lead_1",
  eventName: "LeadSubmitted",
  eventTime: new Date(),
  id: "m1",
  lead: { adClick: { firstCtwaClid: "OLD", latestCtwaClid: "CLID" }, email: null, phone: "919800000001", visitorSession: null },
  valueMinor: null
});

const websiteRow = (consent: boolean | null): Row => ({
  ...whatsappRow(),
  channel: "website",
  eventId: "pixel-event-0001",
  eventName: "Lead",
  lead: {
    adClick: null,
    email: "asha@example.com",
    phone: "9876543210",
    visitorSession: {
      adConsent: consent,
      fbclid: null,
      fbp: null,
      firstVisit: AT,
      ipAddress: "203.0.113.9",
      landingPage: "https://nexachess.in/academy?fbclid=IwAR123&name=Asha",
      userAgent: "Mozilla/5.0"
    }
  }
});

describe("MetaCapiService.send", () => {
  it("sends a WhatsApp event with the latest click id to the dataset, and marks it sent", async () => {
    const row = whatsappRow();
    const { prisma, updates } = fakePrisma(row);
    const { calls, svc } = service(prisma, () => ({ body: { events_received: 1 }, status: 200 }));
    await svc.send("m1");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://graph.facebook.com/v21.0/123456789/events");
    expect(calls[0].headers.Authorization).toBe("Bearer token");
    expect(calls[0].body).not.toHaveProperty("test_event_code");
    expect((calls[0].body.data as Record<string, unknown>[])[0]).toMatchObject({ user_data: { ctwa_clid: "CLID" } });
    expect(Object.assign({}, ...updates)).toMatchObject({ error: null, status: "SENT" });
  });

  it("marks every event a test event while a test event code is set", async () => {
    const { prisma } = fakePrisma(whatsappRow());
    const { calls, svc } = service(prisma, () => ({ body: { events_received: 1 }, status: 200 }), { ...CONFIG, testEventCode: "TEST123" });
    await svc.send("m1");
    expect(calls[0].body.test_event_code).toBe("TEST123");
  });

  it("sends a website event only with consent, and drops the page's query", async () => {
    const { prisma } = fakePrisma(websiteRow(true));
    const { calls, svc } = service(prisma, () => ({ body: { events_received: 1 }, status: 200 }));
    await svc.send("m1");
    const event = (calls[0].body.data as Record<string, unknown>[])[0];
    expect(event).toMatchObject({ action_source: "website", event_id: "pixel-event-0001", event_source_url: "https://nexachess.in/academy" });
  });

  it.each([false, null])("skips a website event when consent is %s, without calling Meta", async (consent) => {
    const { prisma, updates } = fakePrisma(websiteRow(consent));
    const { calls, svc } = service(prisma, () => ({ body: {}, status: 200 }));
    await svc.send("m1");
    expect(calls).toEqual([]);
    expect(Object.assign({}, ...updates)).toMatchObject({ status: "SKIPPED" });
  });

  it("skips a WhatsApp event when the account id isn't configured", async () => {
    const { prisma, updates } = fakePrisma(whatsappRow());
    const { calls, svc } = service(prisma, () => ({ body: {}, status: 200 }), { ...CONFIG, wabaId: null });
    await svc.send("m1");
    expect(calls).toEqual([]);
    expect(Object.assign({}, ...updates)).toMatchObject({ error: "WHATSAPP_BUSINESS_ACCOUNT_ID is not set.", status: "SKIPPED" });
  });

  it("skips an event older than Meta's 7-day limit", async () => {
    const row = { ...whatsappRow(), eventTime: new Date(Date.now() - 8 * 24 * 60 * 60_000) };
    const { prisma, updates } = fakePrisma(row);
    const { calls, svc } = service(prisma, () => ({ body: {}, status: 200 }));
    await svc.send("m1");
    expect(calls).toEqual([]);
    expect(Object.assign({}, ...updates)).toMatchObject({ status: "SKIPPED" });
  });

  it("waits and retries after a server error or rate limit", async () => {
    const { prisma, updates } = fakePrisma(whatsappRow());
    const { svc } = service(prisma, () => ({ body: { error: { message: "busy" } }, status: 429 }));
    await svc.send("m1");
    const written = Object.assign({}, ...updates) as Record<string, unknown>;
    expect(written.status).toBeUndefined();
    expect(written.error).toBe("Meta answered 429: busy");
    expect((written.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it("gives up at once when Meta refuses the event", async () => {
    const { prisma, updates } = fakePrisma(whatsappRow());
    const { svc } = service(prisma, () => ({ body: { error: { message: "Invalid parameter" } }, status: 400 }));
    await svc.send("m1");
    expect(Object.assign({}, ...updates)).toMatchObject({ error: "Meta answered 400: Invalid parameter", status: "FAILED" });
  });

  it("gives up after the last attempt", async () => {
    const row = { ...whatsappRow(), attempts: META_CAPI_MAX_ATTEMPTS - 1 };
    const { prisma, updates } = fakePrisma(row);
    const { svc } = service(prisma, () => ({ body: {}, status: 500 }));
    await svc.send("m1");
    expect(Object.assign({}, ...updates)).toMatchObject({ status: "FAILED" });
  });

  it("does nothing when it is off", async () => {
    const { prisma, updates } = fakePrisma(whatsappRow());
    const svc = new MetaCapiService({} as never, prisma as never);
    // META_DATASET_ID / META_CAPI_ACCESS_TOKEN are unset in tests.
    expect(svc.config()).toBeNull();
    const post = jest.spyOn(svc, "post");
    await svc.send("m1");
    expect(post).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });
});

describe("MetaCapiService.onLeadCreated / onLeadStatus", () => {
  function tx(lead: Record<string, unknown> | null, order: { amount: number; currency: string } | null = null) {
    const created: Record<string, unknown>[] = [];
    return {
      created,
      tx: {
        lead: { findUnique: jest.fn(async () => lead) },
        metaCapiEvent: {
          createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => {
            created.push(...data);
            return { count: data.length };
          })
        },
        order: { findFirst: jest.fn(async () => order) }
      }
    };
  }
  const on = () => {
    const svc = new MetaCapiService({} as never, {} as never);
    jest.spyOn(svc, "config").mockReturnValue(CONFIG);
    return svc;
  };

  it("queues LeadSubmitted for a WhatsApp ad lead", async () => {
    const { created, tx: client } = tx({ adClick: { firstCtwaClid: "C", latestCtwaClid: "C" }, userId: null, visitorSession: null });
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadCreated(client as never, "lead_1", AT));
    expect(created).toEqual([
      expect.objectContaining({ channel: "whatsapp", eventId: "nexa.LeadSubmitted.lead_1", eventName: "LeadSubmitted", eventTime: AT, leadId: "lead_1" })
    ]);
  });

  it("reuses the pixel's event id for a consented website lead, and ignores a malformed one", async () => {
    const lead = { adClick: null, userId: null, visitorSession: { adConsent: true } };
    const first = tx(lead);
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadCreated(first.tx as never, "lead_2", AT, "pixel-event-0001"));
    expect(first.created[0]).toMatchObject({ channel: "website", eventId: "pixel-event-0001", eventName: "Lead" });
    const second = tx(lead);
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadCreated(second.tx as never, "lead_2", AT, "bad id!"));
    expect(second.created[0]).toMatchObject({ eventId: "nexa.Lead.lead_2" });
  });

  it("queues nothing for a website lead without consent, or a lead from neither channel", async () => {
    for (const visitorSession of [{ adConsent: false }, { adConsent: null }, null]) {
      const { created, tx: client } = tx({ adClick: null, userId: null, visitorSession });
      await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadCreated(client as never, "lead_3", AT));
      expect(created).toEqual([]);
    }
  });

  it("queues a booked demo and a conversion with the paid amount; nothing for other stages", async () => {
    const lead = { adClick: { firstCtwaClid: "C", latestCtwaClid: "C" }, userId: "user_1", visitorSession: null };
    const booked = tx(lead);
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadStatus(booked.tx as never, "lead_4", "DEMO_SCHEDULED", AT));
    expect(booked.created[0]).toMatchObject({ eventName: "QualifiedLead", valueMinor: null });

    const paid = tx(lead, { amount: 249900, currency: "INR" });
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadStatus(paid.tx as never, "lead_4", "CONVERTED", AT));
    expect(paid.created[0]).toMatchObject({ currency: "INR", eventName: "Purchase", valueMinor: 249900 });

    const unpaid = tx(lead, null);
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadStatus(unpaid.tx as never, "lead_4", "CONVERTED", AT));
    expect(unpaid.created[0]).toMatchObject({ currency: null, eventName: "Purchase", valueMinor: null });

    const other = tx(lead);
    await runInTenant(DEFAULT_TENANT_ID, "test", () => on().onLeadStatus(other.tx as never, "lead_4", "FOLLOW_UP", AT));
    expect(other.created).toEqual([]);
    expect(other.tx.lead.findUnique).not.toHaveBeenCalled();
  });

  it("never queues for another academy", async () => {
    const { created, tx: client } = tx({ adClick: { firstCtwaClid: "C", latestCtwaClid: "C" }, userId: null, visitorSession: null });
    await runInTenant("tenant_rook", "test", () => on().onLeadCreated(client as never, "lead_5", AT));
    expect(created).toEqual([]);
    expect(client.lead.findUnique).not.toHaveBeenCalled();
  });
});
