import {
  API_ROUTES,
  CLASS_RECAP_AI_LABEL,
  DEFAULT_TENANT_ID,
  type ClassRecapFeedResponse,
  type ClassRecapResponse,
  type ClassRecapSettings
} from "@nexa-chess/types";
import { RECAP_MODELS, type ChatModelConfig, type RecapModels } from "../ai/chat-model";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createWorld } from "../test/integration/access/world";
import { resetDatabase } from "../test/integration/db";
import { ClassRecapJob } from "./class-recap.job";

// AI class recaps end to end on real Postgres (docs/CLASS_RECAPS.md): an ended
// class with a transcript is picked up, the local model waits while any class
// is live, the draft is written from a pseudonymised transcript (the model is
// a stub), the coach publishes, and only the class's students read it.

const LOCAL: ChatModelConfig = {
  apiKey: null,
  model: "stub-model",
  name: "Our server",
  provider: "LOCAL",
  providerId: null,
  timeoutMs: 5000,
  url: "http://127.0.0.1:9"
};
const DRAFT = {
  keyPoints: ["Develop knights before bishops", "Castle early"],
  practice: ["Play two games focusing on development"],
  recap: "Today you learned how to start a game. We talked about development and king safety."
};

describe("AI class recaps (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let job: ClassRecapJob;
  let complete: jest.SpyInstance;
  let classId: string;
  const run = () => runInTenant(DEFAULT_TENANT_ID, "int:class-recaps", () => job.runForAcademy(new AbortController().signal));

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    const { a } = w;
    await t.prisma.user.update({ data: { firstName: "Kavya", lastName: "Menon" }, where: { id: a.student.id } });

    // The local model is a stub: no server is reached.
    const models = t.app.get<RecapModels>(RECAP_MODELS);
    (models as { local: ChatModelConfig | null }).local = LOCAL;
    complete = jest.spyOn(models, "complete").mockResolvedValue({ servedBy: LOCAL, text: JSON.stringify(DRAFT) });
    job = t.app.get(ClassRecapJob);

    // A class that ran for an hour and ended 10 minutes ago, with the coach's transcript.
    const startedAt = new Date(Date.now() - 70 * 60_000);
    const endedAt = new Date(Date.now() - 10 * 60_000);
    const cls = await t.prisma.coachClass.create({
      data: { batchId: a.batch.id, coachId: a.coach.id, endsAt: endedAt, startsAt: startedAt, status: "COMPLETED", topic: "Opening principles" }
    });
    classId = cls.id;
    const session = await t.prisma.liveSession.create({
      data: {
        batchId: a.batch.id,
        classId,
        coachId: a.coach.id,
        endedAt,
        roomName: "room-recap",
        scheduledAt: startedAt,
        startedAt,
        status: "ENDED"
      }
    });
    const words = Array.from({ length: 30 }, (_, i) => `idea${i}`).join(" ");
    await t.prisma.liveClassTranscriptSegment.createMany({
      data: [0, 1, 2, 3].map((i) => ({
        clientId: `recap-line-${i}`,
        lang: "en-IN",
        liveSessionId: session.id,
        speakerId: a.coach.id,
        spokenAt: new Date(startedAt.getTime() + i * 60_000),
        text: i === 0 ? `Kavya Menon, good question. ${words}` : `Develop your knights first. ${words}`
      }))
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it("queues the ended class, but the local model waits while any class is live", async () => {
    expect(await t.prisma.liveSession.count({ where: { status: "LIVE" } })).toBeGreaterThan(0);
    const result = await run();
    expect(result).toMatchObject({ deferred: true, queued: 1, ready: 0 });
    expect(complete).not.toHaveBeenCalled();
    expect(await t.prisma.classRecap.findUnique({ where: { classId } })).toMatchObject({ status: "QUEUED", tenantId: DEFAULT_TENANT_ID });
  });

  it("writes the draft from a pseudonymised transcript once no class is live", async () => {
    await t.prisma.liveSession.updateMany({ data: { endedAt: new Date(), status: "ENDED" }, where: { status: "LIVE" } });
    const result = await run();
    expect(result).toMatchObject({ queued: 0, ready: 1 });
    const prompt = complete.mock.calls[0][1] as { user: string };
    expect(prompt.user).toMatch(/^S\d+, good question\./);
    expect(prompt.user).not.toMatch(/Kavya|Menon/);
    expect(await t.prisma.classRecap.findUnique({ where: { classId } })).toMatchObject({
      draftJson: DRAFT,
      model: "stub-model",
      provider: "LOCAL",
      status: "READY"
    });
  });

  it("the coach sees the draft; the class's student sees nothing yet; another coach gets a 404", async () => {
    const staff = await t.call(w.a.coach, "GET", API_ROUTES.classRecaps.forClass(classId));
    expect(staff.status).toBe(200);
    expect(staff.body).toMatchObject({ recap: { draft: DRAFT, status: "READY" }, viewer: "STAFF" });

    const student = await t.call(w.a.student, "GET", API_ROUTES.classRecaps.forClass(classId));
    expect(student.body).toEqual({ recap: null, viewer: "STUDENT" });

    expect((await t.call(w.b.coach, "GET", API_ROUTES.classRecaps.forClass(classId))).status).toBe(404);
    expect((await t.call(w.a.coach, "GET", API_ROUTES.classRecaps.reviewCount)).body).toEqual({ ready: 2 });
  });

  it("refuses to publish a student code, then publishes the coach's edit", async () => {
    const refused = await t.call(w.a.coach, "POST", API_ROUTES.classRecaps.publish(classId), {
      content: { ...DRAFT, recap: "Well done S1." }
    });
    expect(refused.status).toBe(400);

    const edited = { ...DRAFT, recap: "Today you learned how to start a game well." };
    const published = await t.call(w.a.coach, "POST", API_ROUTES.classRecaps.publish(classId), { content: edited });
    expect(published.status).toBe(201);
    expect((published.body as ClassRecapResponse).recap).toMatchObject({ content: edited, draft: DRAFT, edited: true, status: "PUBLISHED" });
  });

  it("the class's student reads it with the AI label; another batch's student gets a 404", async () => {
    const mine = await t.call(w.a.student, "GET", API_ROUTES.classRecaps.forClass(classId));
    expect(mine.body).toMatchObject({ recap: { aiLabel: CLASS_RECAP_AI_LABEL, class: { topic: "Opening principles" } }, viewer: "STUDENT" });
    expect((mine.body as ClassRecapResponse).recap).not.toHaveProperty("draft");

    const feed = (await t.call(w.a.student, "GET", API_ROUTES.classRecaps.feedMine)).body as ClassRecapFeedResponse;
    expect(feed.items.map((item) => item.class.classId)).toEqual([classId]);
    expect((await t.call(w.b.student, "GET", API_ROUTES.classRecaps.forClass(classId))).status).toBe(404);
    expect(((await t.call(w.b.student, "GET", API_ROUTES.classRecaps.feedMine)).body as ClassRecapFeedResponse).items).toEqual([]);
  });

  it("an admin unpublishes it and chooses the outside AI; a coach can't change settings", async () => {
    expect((await t.call(w.admin, "POST", API_ROUTES.classRecaps.unpublish(classId))).status).toBe(201);
    expect((await t.call(w.a.student, "GET", API_ROUTES.classRecaps.forClass(classId))).body).toEqual({ recap: null, viewer: "STUDENT" });

    const saved = await t.call(w.admin, "PATCH", API_ROUTES.classRecaps.settings, { provider: "OUTSIDE" });
    expect(saved.status).toBe(200);
    expect(saved.body as ClassRecapSettings).toMatchObject({ enabled: true, local: { configured: true }, planIncludes: true, provider: "OUTSIDE" });
    expect((await t.call(w.a.coach, "PATCH", API_ROUTES.classRecaps.settings, { provider: "LOCAL" })).status).toBe(403);
  });

  it("is deleted with its class", async () => {
    await t.prisma.coachClass.delete({ where: { id: classId } });
    expect(await t.prisma.classRecap.count({ where: { classId } })).toBe(0);
  });
});
