import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import {
  CRM_PUSH_MAX_ATTEMPTS,
  FrappeCrmPushService,
  frappeLeadDocument,
  frappeLeadNote,
  frappePhone,
  phoneTail,
  type FrappeCrmConfig
} from "./frappe-crm-push.service";

const CONFIG: FrappeCrmConfig = {
  apiKey: "key",
  apiSecret: "secret",
  countryCode: "91",
  leadSource: "Direct WhatsApp",
  leadStatus: "New Inquiry",
  url: "https://crm.example.test",
  websiteLeadSource: "Website Form"
};

const LEAD = {
  campaign: null as string | null,
  createdAt: new Date("2026-11-14T10:00:00.000Z"),
  email: null as string | null,
  experienceLevel: "beginner",
  id: "lead_1",
  parentName: "Asha <b>K</b>",
  phone: "9876543210",
  source: "WhatsApp" as string | null,
  studentAge: 8,
  studentName: "Ravi"
};
const WEBSITE_LEAD = { ...LEAD, campaign: "diwali", email: "asha@example.test", id: "lead_2", source: "instagram" };

describe("Frappe CRM documents", () => {
  it("adds the country code to a 10-digit number only", () => {
    expect(frappePhone("9876543210", "91")).toBe("+919876543210");
    expect(frappePhone("447700900123", "91")).toBe("+447700900123");
    expect(frappePhone("9876543210", "")).toBe("+9876543210");
  });

  it("maps a lead to the CRM Lead fields with the configured source and status", () => {
    expect(frappeLeadDocument(LEAD, CONFIG)).toEqual({
      first_name: "Asha <b>K</b>",
      mobile_no: "+919876543210",
      source: "Direct WhatsApp",
      status: "New Inquiry",
      student_name: "Ravi"
    });
    expect(frappeLeadDocument({ ...LEAD, parentName: "  " }, CONFIG).first_name).toBe("WhatsApp lead");
  });

  it("gives a website-form lead the website source, and keeps its email and attribution to the note", () => {
    const document = frappeLeadDocument(WEBSITE_LEAD, CONFIG);
    expect(document).toMatchObject({ mobile_no: "+919876543210", source: "Website Form", status: "New Inquiry" });
    expect(document).not.toHaveProperty("email");
    expect(frappeLeadDocument({ ...WEBSITE_LEAD, parentName: "" }, CONFIG).first_name).toBe("Website lead");

    const note = frappeLeadNote(WEBSITE_LEAD);
    expect(note.title).toBe("From NexaGen (website form)");
    expect(note.content).toContain("Email: asha@example.test");
    expect(note.content).toContain("Booked a demo through the website form.");
    expect(note.content).toContain("Came from: instagram (campaign diwali)");
    expect(frappeLeadNote(LEAD).content).not.toContain("Came from");
  });

  it("compares numbers by their last ten digits", () => {
    expect(phoneTail("+91 98765-43210")).toBe("9876543210");
    expect(phoneTail("9876543210")).toBe("9876543210");
  });

  it("escapes the note's HTML", () => {
    const note = frappeLeadNote(LEAD);
    expect(note.content).toContain("Asha &#60;b&#62;K&#60;/b&#62;");
    expect(note.content).not.toContain("<b>");
    expect(note.content).toContain("NexaGen lead: lead_1");
  });
});

type Row = { attempts: number; createdAt: Date; id: string; lead: typeof LEAD; leadId: string };

type Call = { body: unknown; method: string; url: string };

/** A Frappe that answers each call from `answer`, and remembers the calls. */
function fakeFrappe(answer: (call: Call) => unknown) {
  const calls: (Call & { headers: Record<string, string> })[] = [];
  global.fetch = jest.fn(async (url: string, init: RequestInit) => {
    const call = { body: init.body ? JSON.parse(String(init.body)) : null, method: String(init.method), url: decodeURIComponent(url) };
    calls.push({ ...call, headers: init.headers as Record<string, string> });
    return reply(200, { data: answer(call) });
  }) as unknown as typeof fetch;
  return calls;
}

const isLeadSearch = (call: Call) => call.method === "GET" && call.url.includes("/api/resource/CRM Lead?");
const isNoteSearch = (call: Call) => call.method === "GET" && call.url.includes("/api/resource/FCRM Note?");
const step = (call: Call) => `${call.method} ${call.url.split("?")[0].replace("https://crm.example.test/api/resource/", "")}`;

function fakePrisma(row: Row) {
  const updates: Record<string, unknown>[] = [];
  const activities: Record<string, unknown>[] = [];
  const prisma = {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    crmLeadPush: {
      create: jest.fn(),
      findUnique: async () => row,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return data;
      },
      updateMany: async () => {
        row.attempts += 1;
        return { count: 1 };
      }
    },
    leadActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activities.push(data);
        return data;
      }
    }
  };
  return { activities, prisma, updates };
}

function service(prisma: unknown) {
  const push = new FrappeCrmPushService({} as never, prisma as never);
  jest.spyOn(push, "config").mockReturnValue(CONFIG);
  return push;
}

function reply(status: number, body: unknown) {
  return { json: async () => body, ok: status >= 200 && status < 300, status } as Response;
}

describe("FrappeCrmPushService.send", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("creates the lead and its note when Frappe has nobody with that number", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    const calls = fakeFrappe((call) => (isLeadSearch(call) ? [] : { name: call.url.includes("CRM Lead") ? "CRM-LEAD-2026-00042" : "note1" }));

    await service(prisma).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead", "POST CRM Lead", "POST FCRM Note"]);
    expect(calls[0].url).toContain('["mobile_no","like","%9876543210"]');
    expect(calls[0].headers.Authorization).toBe("token key:secret");
    expect(calls[2].body).toMatchObject({ reference_docname: "CRM-LEAD-2026-00042", reference_doctype: "CRM Lead" });
    expect(updates[0]).toMatchObject({ externalId: "CRM-LEAD-2026-00042", status: "SENT" });
    expect(activities[0]).toMatchObject({ activityType: "CRM_PUSHED", leadId: "lead_1", title: "Sent to Frappe CRM" });
  });

  it("adds a note to the lead Frappe already has for that number, and makes no twin", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: WEBSITE_LEAD, leadId: "lead_2" });
    const calls = fakeFrappe((call) => (isLeadSearch(call) ? [{ name: "CRM-LEAD-2026-00007" }] : isNoteSearch(call) ? [] : { name: "note1" }));

    await service(prisma).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead", "GET FCRM Note", "POST FCRM Note"]);
    expect(calls[1].url).toContain("%NexaGen lead: lead_2%");
    expect(calls[2].body).toMatchObject({ reference_docname: "CRM-LEAD-2026-00007", title: "From NexaGen (website form)" });
    expect(updates[0]).toMatchObject({ externalId: "CRM-LEAD-2026-00007", status: "SENT" });
    expect(activities[0]).toMatchObject({ activityType: "CRM_PUSHED", title: "Added to a Frappe CRM lead" });
  });

  it("on a retry, reuses the lead and the note an earlier attempt already made", async () => {
    const { prisma, updates } = fakePrisma({ attempts: 1, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    const calls = fakeFrappe((call) => (isLeadSearch(call) ? [{ name: "CRM-LEAD-2026-00041" }] : [{ name: "note1" }]));

    await service(prisma).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead", "GET FCRM Note"]);
    expect(updates[0]).toMatchObject({ externalId: "CRM-LEAD-2026-00041", status: "SENT" });
  });

  it("tries again when the note for an existing Frappe lead doesn't arrive", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      if (init.method === "POST") return reply(503, { message: "down" });
      return reply(200, { data: url.includes("/api/resource/CRM%20Lead") ? [{ name: "CRM-LEAD-2026-00007" }] : [] });
    }) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(updates[0]).toMatchObject({ error: "Frappe answered 503: down" });
    expect(updates[0].status).toBeUndefined();
    expect(activities).toEqual([]);
  });

  it("doesn't look a too-short number up, it just creates the lead", async () => {
    const short = { ...LEAD, phone: "12345" };
    const { prisma } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: short, leadId: "lead_1" });
    const calls = fakeFrappe(() => ({ name: "CRM-LEAD-2026-00043" }));

    await service(prisma).send("p1");

    expect(calls.map(step)).toEqual(["POST CRM Lead", "POST FCRM Note"]);
  });

  it("waits and retries after a server error", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    global.fetch = jest.fn(async () => reply(503, { message: "down" })) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(updates[0]).toMatchObject({ error: "Frappe answered 503: down" });
    expect(updates[0].status).toBeUndefined();
    expect((updates[0].nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(activities).toEqual([]);
  });

  it("gives up at once when Frappe refuses the document, and says so on the lead", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    global.fetch = jest.fn(async () => reply(417, { exception: "LinkValidationError: Could not find Source" })) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(updates[0]).toMatchObject({ status: "FAILED" });
    expect(activities[0]).toMatchObject({ activityType: "CRM_PUSH_FAILED", title: "Not sent to Frappe CRM" });
  });

  it("gives up after the last attempt", async () => {
    const { prisma, updates } = fakePrisma({ attempts: CRM_PUSH_MAX_ATTEMPTS - 1, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    global.fetch = jest.fn(async () => reply(500, {})) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(updates[0]).toMatchObject({ status: "FAILED" });
  });
});

describe("FrappeCrmPushService.enqueue", () => {
  it("queues only Nexa's leads, and only when it's on", async () => {
    const tx = { crmLeadPush: { create: jest.fn() } };
    const push = service({});
    expect(await runInTenant("tenant_other", "test", () => push.enqueue(tx as never, "lead_1"))).toBe(false);
    expect(await runInTenant(DEFAULT_TENANT_ID, "test", () => push.enqueue(tx as never, "lead_1"))).toBe(true);
    expect(tx.crmLeadPush.create).toHaveBeenCalledTimes(1);

    (push.config as jest.Mock).mockReturnValue(null);
    expect(await runInTenant(DEFAULT_TENANT_ID, "test", () => push.enqueue(tx as never, "lead_2"))).toBe(false);
  });
});
