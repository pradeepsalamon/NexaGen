import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import {
  CRM_PUSH_MAX_ATTEMPTS,
  FrappeCrmPushService,
  frappeLeadDocument,
  frappeLeadNote,
  frappePhone,
  type FrappeCrmConfig
} from "./frappe-crm-push.service";

const CONFIG: FrappeCrmConfig = {
  apiKey: "key",
  apiSecret: "secret",
  countryCode: "91",
  leadSource: "Direct WhatsApp",
  leadStatus: "New Inquiry",
  url: "https://crm.example.test"
};

const LEAD = {
  createdAt: new Date("2026-11-14T10:00:00.000Z"),
  experienceLevel: "beginner",
  id: "lead_1",
  parentName: "Asha <b>K</b>",
  phone: "9876543210",
  studentAge: 8,
  studentName: "Ravi"
};

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
      status: "New Inquiry"
    });
    expect(frappeLeadDocument({ ...LEAD, parentName: "  " }, CONFIG).first_name).toBe("WhatsApp lead");
  });

  it("escapes the note's HTML", () => {
    const note = frappeLeadNote(LEAD);
    expect(note.content).toContain("Asha &#60;b&#62;K&#60;/b&#62;");
    expect(note.content).not.toContain("<b>");
    expect(note.content).toContain("NexaGen lead: lead_1");
  });
});

type Row = { attempts: number; createdAt: Date; id: string; lead: typeof LEAD; leadId: string };

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

  it("creates the lead and its note, then records the Frappe name", async () => {
    const { activities, prisma, updates } = fakePrisma({ attempts: 0, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    const calls: { body: unknown; headers: Record<string, string>; url: string }[] = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ body: init.body ? JSON.parse(String(init.body)) : null, headers: init.headers as Record<string, string>, url });
      return reply(200, { data: { name: url.includes("CRM%20Lead") ? "CRM-LEAD-2026-00042" : "note1" } });
    }) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(calls.map((call) => call.url)).toEqual(["https://crm.example.test/api/resource/CRM%20Lead", "https://crm.example.test/api/resource/FCRM%20Note"]);
    expect(calls[0].headers.Authorization).toBe("token key:secret");
    expect(calls[1].body).toMatchObject({ reference_docname: "CRM-LEAD-2026-00042", reference_doctype: "CRM Lead" });
    expect(updates[0]).toMatchObject({ externalId: "CRM-LEAD-2026-00042", status: "SENT" });
    expect(activities[0]).toMatchObject({ activityType: "CRM_PUSHED", leadId: "lead_1" });
  });

  it("on a retry, reuses a lead an earlier attempt already made", async () => {
    const { prisma, updates } = fakePrisma({ attempts: 1, createdAt: LEAD.createdAt, id: "p1", lead: LEAD, leadId: "lead_1" });
    const methods: string[] = [];
    global.fetch = jest.fn(async (url: string, init: RequestInit) => {
      methods.push(`${init.method} ${url.split("?")[0]}`);
      expect(decodeURIComponent(url)).toContain('["mobile_no","=","+919876543210"]');
      return reply(200, { data: [{ name: "CRM-LEAD-2026-00041" }] });
    }) as unknown as typeof fetch;

    await service(prisma).send("p1");

    expect(methods).toEqual(["GET https://crm.example.test/api/resource/CRM%20Lead"]);
    expect(updates[0]).toMatchObject({ externalId: "CRM-LEAD-2026-00041", status: "SENT" });
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
