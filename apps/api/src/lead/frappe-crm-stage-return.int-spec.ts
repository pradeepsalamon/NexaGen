import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { LeadStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { runInTenant } from "../tenancy/tenant-context";
import { FrappeCrmPushService, type FrappeCrmConfig } from "./frappe-crm-push.service";
import { FrappeCrmStageReturnService, STAGE_RETURN_BATCH } from "./frappe-crm-stage-return.service";
import { LeadStageService } from "./lead-stage.service";

const CONFIG: FrappeCrmConfig = {
  apiKey: "key",
  apiSecret: "secret",
  countryCode: "91",
  leadSource: "Direct WhatsApp",
  leadStatus: "New Inquiry",
  stageSync: true,
  url: "https://crm.example.test",
  websiteLeadSource: "Website Form"
};
const OTHER = "tenant_int_stage_return";

/** The Frappe → NexaGen stage return path against real Postgres (docs/LEAD_STAGES.md). Frappe is faked. */
describe("Frappe stage return (real Postgres)", () => {
  let t: TestApp;
  let frappe: Map<string, string>;
  let puts: { path: string; body: unknown }[];
  const db = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "test:stage-return", fn);

  beforeAll(async () => {
    t = await createTestApp();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    frappe = new Map();
    puts = [];
    const push = t.app.get(FrappeCrmPushService);
    jest.spyOn(push, "config").mockReturnValue(CONFIG);
    // Never a real Frappe: reads come from `frappe`, writes are recorded.
    jest.spyOn(push, "request").mockImplementation(async (_config, method, path, body) => {
      const decoded = decodeURIComponent(path);
      if (method === "PUT") {
        puts.push({ body, path: decoded });
        const name = decoded.split("/").pop()!;
        frappe.set(name, (body as { status: string }).status);
        return { data: {} };
      }
      if (decoded.includes("filters=")) {
        const filters = JSON.parse(decoded.split("filters=")[1].split("&")[0]) as [string, string, string[]][];
        return { data: filters[0][2].filter((name) => frappe.has(name)).map((name) => ({ name, status: frappe.get(name) })) };
      }
      const name = decoded.split("/").pop()!;
      return { data: { status: frappe.get(name) } };
    });
    // One service for the whole file: reset its knobs and where it carries on.
    Object.assign(t.app.get(FrappeCrmStageReturnService), { batchSize: STAGE_RETURN_BATCH, maxPerRun: 2000, pauseMs: 0, resumeAfter: undefined });
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await t?.close();
  });

  /** A lead copied to Frappe as `name`, whose stage NexaGen copied there last. */
  const copied = async (name: string, status: LeadStatus, pushStatus: "FAILED" | "PENDING" | "SENT" = "SENT") => {
    const lead = await db(() =>
      t.prisma.lead.create({
        data: { experienceLevel: "beginner", parentName: "Parent", phone: `90000${name.slice(-5)}`, status, studentAge: 9, studentName: "Kid" }
      })
    );
    await db(() => t.prisma.crmLeadPush.create({ data: { externalId: name, leadId: lead.id, sentStatus: status, status: pushStatus } }));
    return lead;
  };
  const run = () => db(() => t.app.get(FrappeCrmStageReturnService).run(CONFIG));
  const leadOf = (id: string) => db(() => t.prisma.lead.findUniqueOrThrow({ include: { activities: true, crmPush: true }, where: { id } }));

  it("takes a salesperson's stage once, and never copies it back", async () => {
    const lead = await copied("CRM-LEAD-00001", "DEMO_ATTENDED");
    frappe.set("CRM-LEAD-00001", "Follow Up");

    await expect(run()).resolves.toEqual({ checked: 1, moved: 1 });
    const after = await leadOf(lead.id);
    expect(after.status).toBe("FOLLOW_UP");
    expect(after.crmPush?.sentStatus).toBe("FOLLOW_UP");
    expect(after.crmPush?.status).toBe("SENT");
    expect(after.activities.map((a) => a.title)).toEqual(["Changed in Frappe: Demo attended → Follow up"]);

    // A second run finds nothing new, and the push has nothing to send.
    await expect(run()).resolves.toEqual({ checked: 1, moved: 0 });
    await db(() => t.app.get(FrappeCrmPushService).sweep());
    expect(puts).toEqual([]);
  });

  it("then lets NexaGen's next automatic move reach Frappe as usual", async () => {
    const lead = await copied("CRM-LEAD-00002", "DEMO_SCHEDULED");
    frappe.set("CRM-LEAD-00002", "Interested");
    await run();
    expect((await leadOf(lead.id)).status).toBe("INTERESTED");

    await db(() => t.app.get(LeadStageService).apply(lead.id, "DEMO_BOOKED"));
    // apply() sends the change right after commit, in the background.
    for (let i = 0; i < 50 && (await leadOf(lead.id)).crmPush?.status !== "SENT"; i += 1) await new Promise((r) => setTimeout(r, 100));
    expect(frappe.get("CRM-LEAD-00002")).toBe("Demo Booked");
    expect((await leadOf(lead.id)).crmPush?.sentStatus).toBe("DEMO_SCHEDULED");
    await expect(run()).resolves.toMatchObject({ moved: 0 });
  });

  it("brings Frappe's further stage back when the push refused to move it backwards", async () => {
    const lead = await copied("CRM-LEAD-00011", "FOLLOW_UP");
    frappe.set("CRM-LEAD-00011", "Follow Up");
    // A person moves NexaGen back to Demo booked; the push may not move Frappe backwards.
    await db(() => t.prisma.lead.update({ data: { status: "DEMO_SCHEDULED" }, where: { id: lead.id } }));
    await db(() => t.app.get(FrappeCrmPushService).markStageChanged(t.prisma, lead.id));
    await db(() => t.app.get(FrappeCrmPushService).sweep());
    expect(puts).toEqual([]);
    expect(frappe.get("CRM-LEAD-00011")).toBe("Follow Up");

    await expect(run()).resolves.toEqual({ checked: 1, moved: 1 });
    expect((await leadOf(lead.id)).status).toBe("FOLLOW_UP");
  });

  it("carries on where the last run stopped, so every lead is read in turn", async () => {
    Object.assign(t.app.get(FrappeCrmStageReturnService), { batchSize: 1, maxPerRun: 2 });
    await copied("CRM-LEAD-00021", "NEW");
    await copied("CRM-LEAD-00022", "NEW");
    const third = await copied("CRM-LEAD-00023", "NEW");
    for (const name of ["CRM-LEAD-00021", "CRM-LEAD-00022", "CRM-LEAD-00023"]) frappe.set(name, "Demo Requested");
    frappe.set("CRM-LEAD-00023", "Contacted");
    const ids = (await db(() => t.prisma.crmLeadPush.findMany({ orderBy: { id: "asc" }, select: { lead: { select: { id: true } } } }))).map((row) => row.lead.id);
    const lastRead = ids.indexOf(third.id) === 2;

    const first = await run();
    const second = await run();
    expect(first.checked).toBe(2);
    expect(second.checked).toBe(2);
    // Two runs of two cover all three leads, whichever order the ids fall in.
    expect(first.moved + second.moved).toBe(1);
    if (lastRead) expect(second.moved).toBe(1);
    expect((await leadOf(third.id)).status).toBe("CONTACTED");
  });

  it("ignores Frappe's older stage names", async () => {
    const lead = await copied("CRM-LEAD-00003", "NEW");
    frappe.set("CRM-LEAD-00003", "New Inquiry");
    await expect(run()).resolves.toEqual({ checked: 1, moved: 0 });
    expect((await leadOf(lead.id)).status).toBe("NEW");
  });

  it("leaves a lead whose NexaGen change is still on its way (PENDING), and never reads won leads", async () => {
    const pending = await copied("CRM-LEAD-00004", "DEMO_SCHEDULED", "PENDING");
    const won = await copied("CRM-LEAD-00005", "CONVERTED");
    frappe.set("CRM-LEAD-00004", "Lost");
    frappe.set("CRM-LEAD-00005", "Lost");
    await expect(run()).resolves.toEqual({ checked: 0, moved: 0 });
    expect((await leadOf(pending.id)).status).toBe("DEMO_SCHEDULED");
    expect((await leadOf(won.id)).status).toBe("CONVERTED");
  });

  it("loses the race to a NexaGen change made after Frappe was read", async () => {
    const lead = await copied("CRM-LEAD-00006", "DEMO_SCHEDULED");
    const row = await db(() =>
      t.prisma.crmLeadPush.findUniqueOrThrow({
        select: { externalId: true, id: true, lead: { select: { convertedAt: true, id: true, status: true } }, sentStatus: true },
        where: { leadId: lead.id }
      })
    );
    // The demo is attended between the read and the write.
    await db(() => t.prisma.lead.update({ data: { status: "DEMO_ATTENDED" }, where: { id: lead.id } }));
    const svc = t.app.get(FrappeCrmStageReturnService);
    await expect(db(() => svc.take({ ...row, externalId: row.externalId! }, "Lost", "LOST"))).resolves.toBe(false);
    const after = await leadOf(lead.id);
    expect(after.status).toBe("DEMO_ATTENDED");
    expect(after.activities).toEqual([]);
  });

  it("undoes the lead move when a push started meanwhile", async () => {
    const lead = await copied("CRM-LEAD-00007", "DEMO_SCHEDULED");
    const row = await db(() =>
      t.prisma.crmLeadPush.findUniqueOrThrow({
        select: { externalId: true, id: true, lead: { select: { convertedAt: true, id: true, status: true } }, sentStatus: true },
        where: { leadId: lead.id }
      })
    );
    await db(() => t.prisma.crmLeadPush.update({ data: { status: "PENDING" }, where: { id: row.id } }));
    const svc = t.app.get(FrappeCrmStageReturnService);
    await expect(db(() => svc.take({ ...row, externalId: row.externalId! }, "Lost", "LOST"))).resolves.toBe(false);
    const after = await leadOf(lead.id);
    expect(after.status).toBe("DEMO_SCHEDULED");
    expect(after.crmPush?.sentStatus).toBe("DEMO_SCHEDULED");
    expect(after.activities).toEqual([]);
  });

  it("never reads another academy's leads", async () => {
    await t.prisma.tenant.create({ data: { id: OTHER, name: "Other Academy", slug: "int-stage-return" } });
    const theirs = await runInTenant(OTHER, "test:stage-return", async () => {
      const lead = await t.prisma.lead.create({
        data: { experienceLevel: "beginner", parentName: "P", phone: "9000077777", status: "NEW", studentAge: 9, studentName: "K" }
      });
      await t.prisma.crmLeadPush.create({ data: { externalId: "CRM-LEAD-00008", leadId: lead.id, sentStatus: "NEW", status: "SENT" } });
      return lead;
    });
    frappe.set("CRM-LEAD-00008", "Lost");
    await expect(run()).resolves.toEqual({ checked: 0, moved: 0 });
    const after = await runInTenant(OTHER, "test:stage-return", () => t.prisma.lead.findUniqueOrThrow({ where: { id: theirs.id } }));
    expect(after.status).toBe("NEW");
  });
});
