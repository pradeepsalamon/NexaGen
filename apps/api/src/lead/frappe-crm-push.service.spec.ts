import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import {
  CRM_PUSH_MAX_ATTEMPTS,
  FrappeCrmPushService,
  frappeLeadDocument,
  frappeLeadNote,
  frappePhone,
  frappeStageMayMove,
  phoneTail,
  type FrappeCrmConfig
} from "./frappe-crm-push.service";

const CONFIG: FrappeCrmConfig = {
  apiKey: "key",
  apiSecret: "secret",
  countryCode: "91",
  leadSource: "Direct WhatsApp",
  leadStatus: "New Inquiry",
  stageSync: false,
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
  status: "NEW" as const,
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

  it("gives a website-form lead the website source and its email, and puts the attribution on the note", () => {
    const document = frappeLeadDocument(WEBSITE_LEAD, CONFIG);
    expect(document).toMatchObject({ email: "asha@example.test", mobile_no: "+919876543210", source: "Website Form", status: "New Inquiry" });
    expect(frappeLeadDocument(LEAD, CONFIG)).not.toHaveProperty("email");
    expect(frappeLeadDocument({ ...WEBSITE_LEAD, parentName: "" }, CONFIG).first_name).toBe("Website lead");

    const note = frappeLeadNote(WEBSITE_LEAD);
    expect(note.title).toBe("From NexaGen (website form)");
    expect(note.content).toContain("Email: asha@example.test");
    expect(note.content).toContain("Booked a demo through the website form.");
    expect(note.content).toContain("Came from: instagram (campaign diwali)");
    expect(frappeLeadNote(LEAD).content).not.toContain("Came from");
  });

  it("never sends a captured WhatsApp lead's placeholder child details as real", () => {
    const captured = { ...LEAD, experienceLevel: "not_given", parentName: "Priya", source: "WhatsApp ad", campaign: "Chess for kids", studentAge: 0, studentName: "" };
    const document = frappeLeadDocument(captured, CONFIG);
    expect(document).not.toHaveProperty("student_name");
    expect(document).toMatchObject({ first_name: "Priya", source: "Direct WhatsApp" });
    const note = frappeLeadNote(captured);
    expect(note.title).toBe("From NexaGen (WhatsApp)");
    expect(note.content).toContain("Student: not given yet");
    expect(note.content).not.toContain("age 0");
    expect(note.content).toContain("Wrote to the academy on WhatsApp; no demo booked yet.");
    expect(note.content).toContain("Came from: a Click-to-WhatsApp ad (Chess for kids)");
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

type Row = {
  attempts: number;
  createdAt: Date;
  externalId?: string | null;
  id: string;
  lead: typeof LEAD | (Omit<typeof LEAD, "status"> & { status: string });
  leadId: string;
  sentStatus?: string | null;
};

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
    lead: { findUnique: async () => ({ status: row.lead.status }) },
    leadActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        activities.push(data);
        return data;
      }
    }
  };
  return { activities, prisma, updates };
}

/** Every field the push row was given, in order. */
const written = (updates: Record<string, unknown>[]) => Object.assign({}, ...updates) as Record<string, unknown>;

function service(prisma: unknown, config: FrappeCrmConfig = CONFIG) {
  const push = new FrappeCrmPushService({} as never, prisma as never);
  jest.spyOn(push, "config").mockReturnValue(config);
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
    expect(written(updates)).toMatchObject({ externalId: "CRM-LEAD-2026-00042", status: "SENT" });
    expect(activities[0]).toMatchObject({ activityType: "CRM_PUSHED", leadId: "lead_1", title: "Sent to Frappe CRM" });
  });

  it("adds a note to the lead Frappe already has for that number, and makes no twin", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: WEBSITE_LEAD, leadId: "lead_2" });
    const calls = fakeFrappe((call) => (isLeadSearch(call) ? [{ name: "CRM-LEAD-2026-00007" }] : isNoteSearch(call) ? [] : { name: "note1" }));

    await service(prisma).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead", "GET FCRM Note", "POST FCRM Note"]);
    expect(calls[1].url).toContain("%NexaGen lead: lead_2%");
    expect(calls[2].body).toMatchObject({ reference_docname: "CRM-LEAD-2026-00007", title: "From NexaGen (website form)" });
    expect(written(updates)).toMatchObject({ externalId: "CRM-LEAD-2026-00007", status: "SENT" });
    expect(activities[0]).toMatchObject({ activityType: "CRM_PUSHED", title: "Added to a Frappe CRM lead" });
  });

  it("on a retry, reuses the lead and the note an earlier attempt already made", async () => {
    const { prisma, updates } = fakePrisma({ attempts: 1, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    const calls = fakeFrappe((call) => (isLeadSearch(call) ? [{ name: "CRM-LEAD-2026-00041" }] : [{ name: "note1" }]));

    await service(prisma).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead", "GET FCRM Note"]);
    expect(written(updates)).toMatchObject({ externalId: "CRM-LEAD-2026-00041", status: "SENT" });
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

  it("creates the lead without its email when Frappe refuses the address", async () => {
    const { prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: WEBSITE_LEAD, leadId: "lead_2" });
    const leadPosts: Record<string, unknown>[] = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      if (init.method === "GET") return reply(200, { data: [] });
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      if (!url.endsWith("/api/resource/CRM%20Lead")) return reply(200, { data: { name: "note1" } });
      leadPosts.push(body);
      return body.email ? reply(417, { exception: "InvalidEmailAddressError" }) : reply(200, { data: { name: "CRM-LEAD-2026-00044" } });
    }) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(leadPosts.map((body) => "email" in body)).toEqual([true, false]);
    expect(written(updates)).toMatchObject({ externalId: "CRM-LEAD-2026-00044", status: "SENT" });
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

describe("Frappe stage sync", () => {
  const realFetch = global.fetch;
  const SYNC: FrappeCrmConfig = { ...CONFIG, stageSync: true };
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("moves Frappe forward only, and never out of a stage a salesperson closed", () => {
    expect(frappeStageMayMove("Demo Requested", "Demo Booked")).toBe(true);
    expect(frappeStageMayMove("New Inquiry", "Demo Booked")).toBe(true);
    expect(frappeStageMayMove("Demo Attended", "Demo Booked")).toBe(false);
    expect(frappeStageMayMove("Demo Booked", "Demo Booked")).toBe(false);
    // Booked again after a missed demo.
    expect(frappeStageMayMove("Missed Demo", "Demo Booked")).toBe(true);
    // Closed or picked by a person: theirs.
    expect(frappeStageMayMove("Lost", "Demo Attended")).toBe(false);
    expect(frappeStageMayMove("Enrolled", "Demo Booked")).toBe(false);
    expect(frappeStageMayMove("Junk", "Demo Booked")).toBe(false);
    // Enrolled and Lost always pass from an open stage.
    expect(frappeStageMayMove("Demo Attended", "Lost")).toBe(true);
    expect(frappeStageMayMove("Payment Pending", "Enrolled")).toBe(true);
  });

  it("creates a new Frappe lead in the lead's own stage", async () => {
    const { prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    const calls = fakeFrappe((call) => (isLeadSearch(call) ? [] : { name: call.url.includes("CRM Lead") ? "CRM-LEAD-2026-00042" : "note1" }));

    await service(prisma, SYNC).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead", "POST CRM Lead", "POST FCRM Note"]);
    expect(calls[1].body).toMatchObject({ status: "Demo Requested" });
    expect(written(updates)).toMatchObject({ externalId: "CRM-LEAD-2026-00042", sentStatus: "NEW", status: "SENT" });
  });

  it("copies a later stage to the lead it already sent", async () => {
    const lead = { ...LEAD, status: "DEMO_SCHEDULED" };
    const { activities, prisma, updates } = fakePrisma({
      attempts: 0,
      createdAt: LEAD.createdAt,
      externalId: "CRM-LEAD-2026-00042",
      id: "p1",
      lead,
      leadId: "lead_1",
      sentStatus: "NEW"
    });
    const calls = fakeFrappe((call) => (call.method === "GET" ? { status: "Demo Requested" } : { name: "CRM-LEAD-2026-00042" }));

    await service(prisma, SYNC).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead/CRM-LEAD-2026-00042", "PUT CRM Lead/CRM-LEAD-2026-00042"]);
    expect(calls[1].body).toEqual({ status: "Demo Booked" });
    expect(written(updates)).toMatchObject({ sentStatus: "DEMO_SCHEDULED", status: "SENT" });
    expect(activities).toEqual([]);
  });

  it("leaves a Frappe lead a salesperson marked Lost", async () => {
    const lead = { ...LEAD, status: "DEMO_ATTENDED" };
    const { prisma, updates } = fakePrisma({
      attempts: 0,
      createdAt: LEAD.createdAt,
      externalId: "CRM-LEAD-2026-00042",
      id: "p1",
      lead,
      leadId: "lead_1",
      sentStatus: "DEMO_SCHEDULED"
    });
    const calls = fakeFrappe(() => ({ status: "Lost" }));

    await service(prisma, SYNC).send("p1");

    expect(calls.map(step)).toEqual(["GET CRM Lead/CRM-LEAD-2026-00042"]);
    expect(written(updates)).toMatchObject({ sentStatus: "DEMO_ATTENDED", status: "SENT" });
  });

  it("with stage sync off, sends the first copy only, in the configured stage", async () => {
    const lead = { ...LEAD, status: "DEMO_SCHEDULED" };
    const { prisma } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, externalId: "CRM-LEAD-2026-00042", id: "p1", lead, leadId: "lead_1" });
    const calls = fakeFrappe(() => ({}));

    await service(prisma).send("p1");

    expect(calls).toEqual([]);
    expect(frappeLeadDocument(lead as typeof LEAD, CONFIG).status).toBe("New Inquiry");
  });
});
