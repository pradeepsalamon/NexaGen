import { runInTenant } from "../tenancy/tenant-context";
import { ClassRecapJob, RECAP_DEFER_MS, RECAP_RETRY_MS } from "./class-recap.job";

const NOW = new Date("2026-11-25T18:00:00Z");
const FINAL = JSON.stringify({
  keyPoints: ["Develop pieces early"],
  practice: [],
  recap: "Today you learned about the opening."
});
const LOCAL = { apiKey: null, model: "qwen2.5:3b", name: "Our server", provider: "LOCAL" as const, timeoutMs: 1000, url: "http://ollama:11434/v1" };
const OUTSIDE = { ...LOCAL, apiKey: "k", model: "m", name: "Outside", provider: "OUTSIDE" as const, url: "https://x" };

const transcriptWords = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

function setup(options: {
  hasFeature?: boolean;
  settings?: { enabled: boolean; provider: "LOCAL" | "OUTSIDE" };
  live?: number;
  queued?: { id: string } | null;
  attempts?: number;
  transcript?: string[];
  complete?: jest.Mock;
  sessions?: { classId: string; startedAt: Date; endedAt: Date }[];
} = {}) {
  const prisma = {
    batchStudent: { findMany: jest.fn(async () => []) },
    classRecap: {
      createMany: jest.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })),
      findFirst: jest.fn().mockResolvedValueOnce(options.queued === undefined ? { id: "r1" } : options.queued).mockResolvedValue(null),
      findUniqueOrThrow: jest.fn(async () => ({ attempts: options.attempts ?? 1, classId: "class1" })),
      updateMany: jest.fn(async () => ({ count: 1 }))
    },
    coachClass: {
      findUnique: jest.fn(async () => ({
        attendances: [{ student: { firstName: "Asha", id: "s1", lastName: "Kumar", username: "asha" } }],
        batchId: "b1",
        coach: { firstName: "Meena", lastName: "Raj", username: "meena" },
        liveSession: { id: "ls1" }
      }))
    },
    liveClassTranscriptSegment: {
      findMany: jest.fn(async () => (options.transcript ?? [`Asha, look. ${transcriptWords(100)}`]).map((text) => ({ text })))
    },
    liveSession: {
      count: jest.fn(async () => options.live ?? 0),
      findMany: jest.fn(async () => options.sessions ?? [])
    },
    withDeleted: { batchStudent: { findMany: jest.fn(async () => []) } }
  };
  const recaps = { academySettings: jest.fn(async () => options.settings ?? { enabled: true, provider: "LOCAL" }) };
  const models = { complete: options.complete ?? jest.fn(async () => FINAL), local: LOCAL, outside: null as typeof OUTSIDE | null };
  const entitlements = { hasFeature: jest.fn(async () => options.hasFeature ?? true) };
  const job = new ClassRecapJob(prisma as never, {} as never, entitlements as never, recaps as never, models as never);
  const run = () => runInTenant("tenant_nexa", "spec", () => job.runForAcademy(new AbortController().signal, () => NOW));
  return { job, models, prisma, run };
}

describe("ClassRecapJob", () => {
  it("does nothing without the plan feature or with the academy switch off", async () => {
    const noPlan = setup({ hasFeature: false });
    await noPlan.run();
    expect(noPlan.prisma.liveSession.findMany).not.toHaveBeenCalled();

    const off = setup({ settings: { enabled: false, provider: "LOCAL" } });
    await off.run();
    expect(off.prisma.classRecap.findFirst).not.toHaveBeenCalled();
  });

  it("queues ended classes of 10+ minutes with a transcript", async () => {
    const { prisma, run } = setup({
      queued: null,
      sessions: [
        { classId: "long", endedAt: new Date("2026-11-25T17:00:00Z"), startedAt: new Date("2026-11-25T16:00:00Z") },
        { classId: "short", endedAt: new Date("2026-11-25T17:00:00Z"), startedAt: new Date("2026-11-25T16:55:00Z") }
      ]
    });
    const result = await run();
    expect(result.queued).toBe(1);
    expect(prisma.classRecap.createMany).toHaveBeenCalledWith({
      data: [
        { classId: "long", notBefore: NOW, tenantId: "tenant_nexa" },
        { classId: "short", failureCode: "SHORT_CLASS", notBefore: NOW, status: "SKIPPED", tenantId: "tenant_nexa" }
      ],
      skipDuplicates: true
    });
    const where = (prisma.liveSession.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ class: { classRecap: { is: null }, isDemo: false }, status: "ENDED", transcriptSegments: { some: {} } });
  });

  it("puts RUNNING rows left by a dead run back in the queue", async () => {
    const { prisma, run } = setup({ queued: null });
    await run();
    expect(prisma.classRecap.updateMany).toHaveBeenCalledWith({ data: { status: "QUEUED" }, where: { status: "RUNNING" } });
  });

  it("writes a READY draft from a pseudonymised transcript", async () => {
    const { models, prisma, run } = setup();
    const result = await run();
    expect(result.ready).toBe(1);
    const prompt = (models.complete.mock.calls[0] as unknown as [unknown, { user: string }])[1];
    expect(prompt.user).toMatch(/^S1, look\./);
    expect(prompt.user).not.toMatch(/Asha/);
    expect(prisma.classRecap.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ model: "qwen2.5:3b", provider: "LOCAL", status: "READY" }),
      where: { id: "r1", status: "RUNNING" }
    });
  });

  it("the local model never starts while any class is live", async () => {
    const { models, prisma, run } = setup({ live: 1 });
    const result = await run();
    expect(result.deferred).toBe(true);
    expect(prisma.classRecap.findFirst).not.toHaveBeenCalled();
    expect(models.complete).not.toHaveBeenCalled();
  });

  it("a class going live mid-run puts the recap back for 15 minutes without counting the attempt", async () => {
    const { prisma, run } = setup();
    // Before the loop: no class; before the first model call: one is live.
    prisma.liveSession.count.mockResolvedValueOnce(0).mockResolvedValue(1);
    const result = await run();
    expect(result.deferred).toBe(true);
    expect(prisma.classRecap.updateMany).toHaveBeenCalledWith({
      data: { attempts: { decrement: 1 }, notBefore: new Date(NOW.getTime() + RECAP_DEFER_MS), status: "QUEUED" },
      where: { id: "r1", status: "RUNNING" }
    });
  });

  it("the outside AI runs even while a class is live", async () => {
    const complete = jest.fn(async () => FINAL);
    const { models, run } = setup({ complete, live: 1, settings: { enabled: true, provider: "OUTSIDE" } });
    models.outside = OUTSIDE;
    const result = await run();
    expect(result.ready).toBe(1);
    expect((complete.mock.calls[0] as unknown as [{ provider: string }])[0].provider).toBe("OUTSIDE");
  });

  it("the outside AI chosen but not set up: nothing is written", async () => {
    const { models, prisma, run } = setup({ settings: { enabled: true, provider: "OUTSIDE" } });
    await run();
    expect(prisma.classRecap.findFirst).not.toHaveBeenCalled();
    expect(models.complete).not.toHaveBeenCalled();
  });

  it("skips a transcript that is too short", async () => {
    const { prisma, run } = setup({ transcript: ["Hello everyone"] });
    const result = await run();
    expect(result.skipped).toBe(1);
    expect(prisma.classRecap.updateMany).toHaveBeenCalledWith({
      data: { failureCode: "TOO_SHORT", status: "SKIPPED" },
      where: { id: "r1", status: "RUNNING" }
    });
  });

  it("a failed run is retried later, then FAILED after the last attempt", async () => {
    const failing = jest.fn(async () => {
      throw new Error("503");
    });
    const first = setup({ attempts: 1, complete: failing });
    await first.run();
    expect(first.prisma.classRecap.updateMany).toHaveBeenCalledWith({
      data: { failureCode: "MODEL_ERROR", notBefore: new Date(NOW.getTime() + RECAP_RETRY_MS), status: "QUEUED" },
      where: { id: "r1", status: "RUNNING" }
    });

    const last = setup({ attempts: 3, complete: failing });
    await last.run();
    expect(last.prisma.classRecap.updateMany).toHaveBeenCalledWith({
      data: { failureCode: "MODEL_ERROR", status: "FAILED" },
      where: { id: "r1", status: "RUNNING" }
    });
  });
});
