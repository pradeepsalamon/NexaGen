import type { LeadStatus } from "@prisma/client";
import { FRAPPE_LEAD_STAGES, FrappeCrmPushService, type FrappeCrmConfig } from "./frappe-crm-push.service";
import {
  FrappeCrmStageReturnService,
  LEAD_STATUS_FROM_FRAPPE,
  STAGE_RETURN_BATCH,
  stageFromFrappe
} from "./frappe-crm-stage-return.service";

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

describe("stage names from Frappe", () => {
  it("maps every NexaGen stage name back, Enrolled as Converted", () => {
    expect(LEAD_STATUS_FROM_FRAPPE["Enrolled"]).toBe("CONVERTED");
    expect(LEAD_STATUS_FROM_FRAPPE["Demo Booked"]).toBe("DEMO_SCHEDULED");
    expect(LEAD_STATUS_FROM_FRAPPE["Missed Demo"]).toBe("NO_SHOW");
    expect(LEAD_STATUS_FROM_FRAPPE["Demo Requested"]).toBe("NEW");
    for (const [status, name] of Object.entries(FRAPPE_LEAD_STAGES)) {
      const back = LEAD_STATUS_FROM_FRAPPE[name];
      expect(back === status || (status === "ACTIVE_STUDENT" && back === "CONVERTED")).toBe(true);
    }
  });

  it("doesn't know Frappe's older names", () => {
    for (const old of ["New", "New Inquiry", "Offer Sent", "Junk", "Demo Scheduled", "Nurture", "constructor", "toString"]) {
      expect(stageFromFrappe({ frappeStage: old, leadStatus: "NEW", sentStatus: "NEW" })).toBeNull();
    }
  });
});

describe("stageFromFrappe", () => {
  const at = (frappeStage: string | null, leadStatus: LeadStatus, sentStatus: LeadStatus | null = leadStatus) =>
    stageFromFrappe({ frappeStage, leadStatus, sentStatus });

  it("takes a stage a person set in Frappe", () => {
    expect(at("Follow Up", "DEMO_ATTENDED")).toBe("FOLLOW_UP");
    expect(at("Lost", "NO_SHOW")).toBe("LOST");
    expect(at("Enrolled", "PAYMENT_PENDING")).toBe("CONVERTED");
    // Backwards too: the latest change wins, wherever it was made.
    expect(at("Interested", "DEMO_SCHEDULED")).toBe("INTERESTED");
    // Reopening a lead someone closed as Lost.
    expect(at("Follow Up", "LOST")).toBe("FOLLOW_UP");
  });

  it("ignores the stage NexaGen copied there itself (no loop)", () => {
    expect(at("Demo Booked", "DEMO_SCHEDULED")).toBeNull();
    // NexaGen moved on and the push hasn't caught up: Frappe shows what was copied.
    expect(at("Demo Booked", "DEMO_CONFIRMED", "DEMO_SCHEDULED")).toBeNull();
  });

  it("does nothing when Frappe already shows the lead's stage", () => {
    expect(at("Demo Confirmed", "DEMO_CONFIRMED", "DEMO_SCHEDULED")).toBeNull();
  });

  it("uses the lead's own stage when nothing was copied with stage sync", () => {
    expect(at("Demo Requested", "NEW", null)).toBeNull();
    expect(at("Interested", "NEW", null)).toBe("INTERESTED");
  });

  it("never moves a won lead, not even to Lost", () => {
    expect(at("Lost", "CONVERTED")).toBeNull();
    expect(at("Lost", "ACTIVE_STUDENT")).toBeNull();
    expect(at("Follow Up", "CONVERTED")).toBeNull();
    // Enrolled is how both won stages look in Frappe.
    expect(at("Enrolled", "ACTIVE_STUDENT")).toBeNull();
  });

  it("ignores an empty stage", () => {
    expect(at(null, "NEW")).toBeNull();
    expect(at("", "NEW")).toBeNull();
  });
});

type Row = { externalId: string; id: string; lead: { convertedAt: Date | null; id: string; status: LeadStatus }; sentStatus: LeadStatus | null };

function rowsOf(count: number, status: LeadStatus = "DEMO_SCHEDULED"): Row[] {
  return Array.from({ length: count }, (_, index) => {
    const n = String(index).padStart(4, "0");
    return { externalId: `CRM-LEAD-${n}`, id: `push_${n}`, lead: { convertedAt: null, id: `lead_${n}`, status }, sentStatus: status };
  });
}

/** A Prisma that pages `rows` by id and records every write. */
function fakePrisma(rows: Row[]) {
  const writes: { data: Record<string, unknown>; model: string; where: Record<string, unknown> }[] = [];
  const updateMany = (model: string) => async ({ data, where }: { data: Record<string, unknown>; where: Record<string, unknown> }) => {
    writes.push({ data, model, where });
    return { count: 1 };
  };
  const tx = {
    crmLeadPush: { updateMany: updateMany("crmLeadPush") },
    lead: { updateMany: updateMany("lead") },
    leadActivity: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        writes.push({ data, model: "leadActivity", where: {} });
        return data;
      }
    }
  };
  const prisma = {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    crmLeadPush: {
      findMany: jest.fn(async (args: { cursor?: { id: string }; take: number }) => {
        const start = args.cursor ? rows.findIndex((row) => row.id === args.cursor!.id) + 1 : 0;
        return rows.slice(start, start + args.take);
      })
    }
  };
  return { prisma, writes };
}

function service(prisma: unknown, frappeStages: (names: string[]) => Record<string, string>) {
  const push = new FrappeCrmPushService({} as never, {} as never);
  const requests: string[] = [];
  jest.spyOn(push, "request").mockImplementation(async (_config, _method, path) => {
    requests.push(decodeURIComponent(path));
    const filters = JSON.parse(decodeURIComponent(path).split("filters=")[1].split("&")[0]) as [string, string, string[]][];
    const names = filters[0][2];
    const stages = frappeStages(names);
    return { data: names.filter((name) => stages[name]).map((name) => ({ name, status: stages[name] })) };
  });
  const referrals = { onLeadStatus: jest.fn(async () => undefined) };
  const svc = new FrappeCrmStageReturnService({} as never, prisma as never, push, referrals as never);
  svc.pauseMs = 0;
  return { referrals, requests, svc };
}

describe("FrappeCrmStageReturnService.run", () => {
  it("reads Frappe in batches and takes only the leads a person changed there", async () => {
    const rows = rowsOf(STAGE_RETURN_BATCH + 3);
    const { prisma, writes } = fakePrisma(rows);
    const changed = new Set(["CRM-LEAD-0001", `CRM-LEAD-${String(STAGE_RETURN_BATCH + 1).padStart(4, "0")}`]);
    const { referrals, requests, svc } = service(prisma, (names) =>
      Object.fromEntries(names.map((name) => [name, changed.has(name) ? "Lost" : "Demo Booked"]))
    );

    await expect(svc.run(CONFIG)).resolves.toEqual({ checked: STAGE_RETURN_BATCH + 3, moved: 2 });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('"name","in"');

    const leadWrites = writes.filter((w) => w.model === "lead");
    expect(leadWrites.map((w) => w.where)).toEqual([
      { id: "lead_0001", status: "DEMO_SCHEDULED" },
      { id: `lead_${String(STAGE_RETURN_BATCH + 1).padStart(4, "0")}`, status: "DEMO_SCHEDULED" }
    ]);
    expect(leadWrites[0].data).toMatchObject({ status: "LOST" });
    // Recorded as copied, so the push never sends it back.
    expect(writes.find((w) => w.model === "crmLeadPush")).toMatchObject({
      data: { sentStatus: "LOST" },
      where: { id: "push_0001", sentStatus: "DEMO_SCHEDULED", status: { in: ["SENT", "FAILED"] } }
    });
    expect(writes.find((w) => w.model === "leadActivity")?.data).toMatchObject({
      activityType: "STATUS_CHANGED",
      title: "Changed in Frappe: Demo booked → Lost"
    });
    expect(referrals.onLeadStatus).toHaveBeenCalledWith("lead_0001", "LOST", null);
  });

  it("asks only for SENT or FAILED rows with a Frappe lead, and never won leads", async () => {
    const { prisma } = fakePrisma([]);
    const { svc } = service(prisma, () => ({}));
    await svc.run(CONFIG);
    const where = (prisma.crmLeadPush.findMany.mock.calls[0][0] as unknown as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({
      externalId: { not: null },
      lead: { status: { notIn: ["CONVERTED", "ACTIVE_STUDENT"] } },
      status: { in: ["SENT", "FAILED"] }
    });
  });

  it("sets the converted date when Frappe says Enrolled", async () => {
    const { prisma, writes } = fakePrisma(rowsOf(1, "PAYMENT_PENDING"));
    const { svc } = service(prisma, () => ({ "CRM-LEAD-0000": "Enrolled" }));
    await expect(svc.run(CONFIG)).resolves.toEqual({ checked: 1, moved: 1 });
    expect(writes[0].data).toMatchObject({ status: "CONVERTED" });
    expect(writes[0].data.convertedAt).toBeInstanceOf(Date);
  });

  it("skips a lead Frappe no longer has", async () => {
    const { prisma, writes } = fakePrisma(rowsOf(2));
    const { svc } = service(prisma, () => ({ "CRM-LEAD-0001": "Demo Booked" }));
    await expect(svc.run(CONFIG)).resolves.toEqual({ checked: 2, moved: 0 });
    expect(writes).toEqual([]);
  });

  it("is off unless the return switch, the push and stage sync are all on", () => {
    const push = new FrappeCrmPushService({} as never, {} as never);
    const svc = new FrappeCrmStageReturnService({} as never, {} as never, push, {} as never);
    // FRAPPE_CRM_STAGE_RETURN is unset in tests.
    jest.spyOn(push, "config").mockReturnValue(CONFIG);
    expect(svc.config()).toBeNull();
  });
});
