import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { runInTenant } from "../tenancy/tenant-context";
import { SystemNotifier } from "../mail/system-notifier.service";
import { LeadAwaitingDemoService } from "./lead-awaiting-demo.service";
import { LeadDemoMissedService } from "./lead-demo-missed.service";
import { LeadStageService } from "./lead-stage.service";

/** Automatic lead stages against real Postgres (docs/LEAD_STAGES.md). */
describe("lead stages (real Postgres)", () => {
  let t: TestApp;
  const db = <T>(fn: () => Promise<T>) => runInTenant(DEFAULT_TENANT_ID, "test:lead-stages", fn);

  beforeAll(async () => {
    t = await createTestApp();
  }, 60_000);

  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  afterAll(async () => {
    await t?.close();
  });

  const lead = (phone: string, status: "DEMO_CONFIRMED" | "DEMO_SCHEDULED" | "LOST" | "NEW" = "NEW") =>
    db(() =>
      t.prisma.lead.create({
        data: { experienceLevel: "beginner", parentName: "Parent", phone, status, studentAge: 9, studentName: "Kid" }
      })
    );

  const demo = async (status: "COMPLETED" | "SCHEDULED", endedAgoMs = 60 * 60_000) => {
    const coach = await db(() => createUser(t.prisma, UserRole.COACH));
    const endsAt = new Date(Date.now() - endedAgoMs);
    return db(() =>
      t.prisma.coachClass.create({
        data: { coachId: coach.id, endsAt, isDemo: true, startsAt: new Date(endsAt.getTime() - 60 * 60_000), status, topic: "Trial" }
      })
    );
  };

  const book = (leadId: string, classId: string, joinedAt: Date | null = null) =>
    db(async () => {
      await t.prisma.lead.update({ data: { assignedClassId: classId }, where: { id: leadId } });
      await t.prisma.demoClassRegistration.create({
        data: { classId, contactMethod: "PHONE", contactValue: leadId, joinedAt, leadId, name: "Kid", source: "LEAD" }
      });
    });

  const statusOf = async (id: string) => (await db(() => t.prisma.lead.findUniqueOrThrow({ where: { id } }))).status;

  it("moves a booked lead through the demo and writes the timeline", async () => {
    const stages = t.app.get(LeadStageService);
    const row = await lead("9000000101");

    await expect(db(() => stages.apply(row.id, "DEMO_BOOKED", { activity: { title: "Booked" } }))).resolves.toBe("DEMO_SCHEDULED");
    await expect(db(() => stages.apply(row.id, "DEMO_CONFIRMED"))).resolves.toBe("DEMO_CONFIRMED");
    await expect(db(() => stages.apply(row.id, "DEMO_BOOKED"))).resolves.toBe("DEMO_SCHEDULED");
    await expect(db(() => stages.apply(row.id, "DEMO_ATTENDED"))).resolves.toBe("DEMO_ATTENDED");
    // Never back once attended.
    await expect(db(() => stages.apply(row.id, "DEMO_BOOKED", { activity: { title: "Booked again" } }))).resolves.toBeNull();

    expect(await statusOf(row.id)).toBe("DEMO_ATTENDED");
    const titles = (await db(() => t.prisma.leadActivity.findMany({ orderBy: { createdAt: "asc" }, where: { leadId: row.id } }))).map((a) => a.title);
    expect(titles).toEqual(["Booked", "Booked again"]);
  });

  it("never moves a lead a person marked Lost", async () => {
    const row = await lead("9000000102", "LOST");
    await expect(db(() => t.app.get(LeadStageService).apply(row.id, "DEMO_ATTENDED"))).resolves.toBeNull();
    expect(await statusOf(row.id)).toBe("LOST");
  });

  it("marks a missed demo only when the class was held and the guest never joined", async () => {
    const held = await demo("COMPLETED");
    const notHeld = await demo("SCHEDULED");
    const longAgo = await demo("COMPLETED", 30 * 24 * 60 * 60_000);

    const missed = await lead("9000000201", "DEMO_CONFIRMED");
    const came = await lead("9000000202", "DEMO_SCHEDULED");
    const classNeverHeld = await lead("9000000203", "DEMO_SCHEDULED");
    const old = await lead("9000000204", "DEMO_SCHEDULED");
    await book(missed.id, held.id);
    await book(came.id, held.id, new Date());
    await book(classNeverHeld.id, notHeld.id);
    await book(old.id, longAgo.id);

    const job = t.app.get(LeadDemoMissedService);
    await expect(db(() => job.markMissedNow())).resolves.toBe(1);
    // Running again changes nothing.
    await expect(db(() => job.markMissedNow())).resolves.toBe(0);

    expect(await statusOf(missed.id)).toBe("NO_SHOW");
    expect(await statusOf(came.id)).toBe("DEMO_SCHEDULED");
    expect(await statusOf(classNeverHeld.id)).toBe("DEMO_SCHEDULED");
    expect(await statusOf(old.id)).toBe("DEMO_SCHEDULED");
  });

  it("tells staff once about leads with no demo time, or who missed theirs", async () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60_000);
    const waiting = await lead("9000000301");
    const tooNew = await lead("9000000302");
    const booked = await lead("9000000303", "DEMO_SCHEDULED");
    const missed = await lead("9000000304");
    await db(() => t.prisma.lead.update({ data: { createdAt: hoursAgo(5) }, where: { id: waiting.id } }));
    await db(() => t.prisma.lead.update({ data: { createdAt: hoursAgo(1) }, where: { id: tooNew.id } }));
    await db(() => t.prisma.lead.update({ data: { createdAt: hoursAgo(5) }, where: { id: booked.id } }));
    await db(() => t.prisma.lead.update({ data: { createdAt: hoursAgo(30), status: "NO_SHOW" }, where: { id: missed.id } }));
    await book(booked.id, (await demo("SCHEDULED", -24 * 60 * 60_000)).id);

    const send = jest.spyOn(t.app.get(SystemNotifier), "send").mockResolvedValue(undefined as never);
    await expect(db(() => t.app.get(LeadAwaitingDemoService).announceNow())).resolves.toBe(2);

    expect(send).toHaveBeenCalledTimes(1);
    const [key, , variables] = send.mock.calls[0];
    expect(key).toBe("LEADS_AWAITING_DEMO_ADMIN");
    expect(variables).toMatchObject({ "leads.awaitingCount": "2" });
    expect(variables?.["leads.awaitingList"]).toContain("9000000301: no demo time yet");
    expect(variables?.["leads.awaitingList"]).toContain("9000000304: missed their demo");
    send.mockRestore();
  });
});
