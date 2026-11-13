import {
  API_ROUTES,
  type AppendTranscriptResponse,
  type LiveClassTranscriptResponse,
  type TranscriptConsentResponse
} from "@nexa-chess/types";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

type World = Awaited<ReturnType<typeof createWorld>>;

const line = (clientId: string, text: string, spokenAt = new Date().toISOString()) => ({
  clientId,
  lang: "en-IN",
  spokenAt,
  text
});

/** The coach's stored transcript against real Postgres: consent, the class setting, retries, paging. */
describe("live-class transcript (real app, real Postgres)", () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const enable = (classId: string) =>
    t.prisma.liveSession.update({ data: { effectiveSettings: { transcript: "ENABLED" } }, where: { classId } });
  const consent = (value: boolean) => t.call(w.a.coach, "PUT", API_ROUTES.liveClass.transcriptConsent(), { consent: value });
  const append = (lines: ReturnType<typeof line>[]) =>
    t.call(w.a.coach, "POST", API_ROUTES.liveClass.transcript(w.a.liveClass.id), { lines });

  it("stores nothing until the class setting is on and the coach has agreed", async () => {
    // Setting off (the default), consent given.
    expect((await consent(true)).status).toBe(200);
    expect((await append([line("client-0001", "hello")])).status).toBe(403);

    // Setting on, consent withdrawn.
    await enable(w.a.liveClass.id);
    expect(((await consent(false)).body as TranscriptConsentResponse).consented).toBe(false);
    expect((await append([line("client-0001", "hello")])).status).toBe(403);
    expect(await t.prisma.liveClassTranscriptSegment.count()).toBe(0);

    // Both.
    expect(((await consent(true)).body as TranscriptConsentResponse).consented).toBe(true);
    const res = await append([line("client-0001", "hello")]);
    expect(res.status).toBe(200);
    expect(res.body as AppendTranscriptResponse).toEqual({ saved: 1 });
    const session = await t.prisma.liveSession.findUniqueOrThrow({ where: { classId: w.a.liveClass.id } });
    expect(await t.prisma.liveClassTranscriptSegment.findMany()).toEqual([
      expect.objectContaining({
        liveSessionId: session.id,
        speakerId: w.a.coach.id,
        tenantId: session.tenantId,
        text: "hello"
      })
    ]);
  });

  it("stores a retried line once and reads the class back oldest first", async () => {
    await enable(w.a.liveClass.id);
    await consent(true);
    const session = await t.prisma.liveSession.findUniqueOrThrow({ where: { classId: w.a.liveClass.id } });
    const at = (seconds: number) => new Date((session.startedAt ?? new Date()).getTime() + seconds * 1000).toISOString();

    expect((await append([line("client-0002", "second", at(20)), line("client-0001", "first", at(10))])).body).toEqual({
      saved: 2
    });
    // The response was lost: the browser sends the batch again with one new line.
    expect(
      (await append([line("client-0002", "second", at(20)), line("client-0001", "first", at(10)), line("client-0003", "third", at(30))]))
        .body
    ).toEqual({ saved: 1 });

    const read = await t.call(w.a.coach, "GET", API_ROUTES.liveClass.transcript(w.a.liveClass.id));
    expect(read.status).toBe(200);
    const body = read.body as LiveClassTranscriptResponse;
    expect(body.items.map((item) => item.text)).toEqual(["first", "second", "third"]);
    expect(body.nextCursor).toBeNull();

    // An admin of the academy reads it; the class's student does not.
    expect((await t.call(w.admin, "GET", API_ROUTES.liveClass.transcript(w.a.liveClass.id))).status).toBe(200);
    expect((await t.call(w.a.student, "GET", API_ROUTES.liveClass.transcript(w.a.liveClass.id))).status).toBe(403);
    // And an admin cannot write one on the coach's behalf.
    expect(
      (await t.call(w.admin, "POST", API_ROUTES.liveClass.transcript(w.a.liveClass.id), { lines: [line("admin-0001", "x")] })).status
    ).toBe(403);
  });

  it("puts the coach's lines in their own data export", async () => {
    await enable(w.a.liveClass.id);
    await consent(true);
    await append([line("client-0001", "A fork wins the exchange")]);

    const mine = await t.call(w.a.coach, "GET", API_ROUTES.privacy.dataExport);
    expect(JSON.stringify(mine.body)).toContain("A fork wins the exchange");
    const other = await t.call(w.b.coach, "GET", API_ROUTES.privacy.dataExport);
    expect(JSON.stringify(other.body)).not.toContain("A fork wins the exchange");
  });
});
