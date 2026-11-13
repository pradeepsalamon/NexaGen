/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { TRANSCRIPT_CONSENT_VERSION, TRANSCRIPT_PAGE_SIZE, type AppendTranscriptRequest } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { LiveClassTranscriptService, TRANSCRIPT_END_GRACE_MS } from "./live-class-transcript.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const STARTED = new Date("2026-11-12T10:00:00Z");
const NOW = new Date("2026-11-12T10:30:00Z");

const consented = { transcriptConsentAt: STARTED, transcriptConsentVersion: TRANSCRIPT_CONSENT_VERSION };
const coach = (coachProfile: any = consented) => ({ coachProfile, id: "coach-1", role: UserRole.COACH });
const session = (over: any = {}) => ({
  coachId: "coach-1",
  effectiveSettings: { transcript: "ENABLED" },
  endedAt: null,
  id: "session-1",
  startedAt: STARTED,
  status: "LIVE",
  ...over
});
const line = (clientId: string, spokenAt = "2026-11-12T10:20:00.000Z", text = "Knight to f3") => ({
  clientId,
  lang: "en-IN" as const,
  spokenAt,
  text
});
const body = (...lines: AppendTranscriptRequest["lines"]): AppendTranscriptRequest => ({ lines });

function setup(opts: { user?: any; liveSession?: any } = {}) {
  const rows: any[] = [];
  const prisma = {
    coachProfile: { updateMany: jest.fn(async () => ({ count: 1 })) },
    liveClassTranscriptSegment: {
      createMany: jest.fn(async ({ data }: any) => {
        const fresh = data.filter((d: any) => !rows.some((r) => r.clientId === d.clientId));
        for (const d of fresh) rows.push({ id: `seg-${String(rows.length).padStart(4, "0")}`, ...d });
        return { count: fresh.length };
      }),
      findMany: jest.fn(async ({ take, where }: any) => {
        const after = where.OR?.[0]?.spokenAt?.gt as Date | undefined;
        const afterId = where.OR?.[1]?.id?.gt as string | undefined;
        return [...rows]
          .sort((a, b) => a.spokenAt - b.spokenAt || a.id.localeCompare(b.id))
          .filter((r) => !after || r.spokenAt > after || (r.spokenAt.getTime() === after.getTime() && r.id > afterId!))
          .slice(0, take);
      })
    }
  };
  const user = opts.user ?? coach();
  const access = {
    authenticate: jest.fn(async () => user),
    resolveClassManager: jest.fn(async () => ({ liveSession: opts.liveSession ?? session(), user }))
  };
  const service = new LiveClassTranscriptService(prisma as any, access as any);
  return { access, prisma, rows, service };
}

describe("LiveClassTranscriptService", () => {
  describe("append", () => {
    it("stores the owning coach's lines against the session", async () => {
      const { rows, service } = setup();
      await expect(service.append(TOKEN, CLASS_ID, body(line("client-0001"), line("client-0002")), NOW)).resolves.toEqual({
        saved: 2
      });
      expect(rows[0]).toMatchObject({
        clientId: "client-0001",
        lang: "en-IN",
        liveSessionId: "session-1",
        speakerId: "coach-1",
        spokenAt: new Date("2026-11-12T10:20:00.000Z"),
        text: "Knight to f3"
      });
    });

    it("stores a retried line once", async () => {
      const { prisma, rows, service } = setup();
      await service.append(TOKEN, CLASS_ID, body(line("client-0001")), NOW);
      await expect(
        service.append(TOKEN, CLASS_ID, body(line("client-0001"), line("client-0001"), line("client-0002")), NOW)
      ).resolves.toEqual({ saved: 1 });
      expect(rows).toHaveLength(2);
      expect(prisma.liveClassTranscriptSegment.createMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ skipDuplicates: true })
      );
    });

    it("clamps the coach's clock to the class", async () => {
      const { rows, service } = setup();
      await service.append(
        TOKEN,
        CLASS_ID,
        body(line("client-early", "2020-01-01T00:00:00.000Z"), line("client-late", "2030-01-01T00:00:00.000Z")),
        NOW
      );
      expect(rows.map((r) => r.spokenAt)).toEqual([STARTED, NOW]);
    });

    it("refuses an admin: nobody is transcribed on the coach's behalf", async () => {
      const { prisma, service } = setup({ user: { coachProfile: null, id: "admin-1", role: UserRole.ADMIN } });
      await expect(service.append(TOKEN, CLASS_ID, body(line("client-0001")), NOW)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(prisma.liveClassTranscriptSegment.createMany).not.toHaveBeenCalled();
    });

    it.each([
      ["turned off", { transcript: "DISABLED" }],
      ["not in the snapshot", {}],
      ["missing a snapshot", null]
    ])("refuses while the class setting is %s", async (_name, effectiveSettings) => {
      const { service } = setup({ liveSession: session({ effectiveSettings }) });
      await expect(service.append(TOKEN, CLASS_ID, body(line("client-0001")), NOW)).rejects.toThrow(
        "The transcript is turned off for this class."
      );
    });

    it.each([
      ["never given", { transcriptConsentAt: null, transcriptConsentVersion: null }],
      ["for an older version", { transcriptConsentAt: STARTED, transcriptConsentVersion: TRANSCRIPT_CONSENT_VERSION - 1 }],
      ["on a missing profile", null]
    ])("refuses when consent was %s", async (_name, coachProfile) => {
      const { prisma, service } = setup({ user: coach(coachProfile) });
      await expect(service.append(TOKEN, CLASS_ID, body(line("client-0001")), NOW)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(prisma.liveClassTranscriptSegment.createMany).not.toHaveBeenCalled();
    });

    it("takes the last buffered lines just after the class ends, then stops", async () => {
      const endedAt = new Date(NOW.getTime() - TRANSCRIPT_END_GRACE_MS + 1000);
      const justEnded = setup({ liveSession: session({ endedAt, status: "ENDED" }) });
      await expect(
        justEnded.service.append(TOKEN, CLASS_ID, body(line("client-0001", NOW.toISOString())), NOW)
      ).resolves.toEqual({ saved: 1 });
      // Nothing is stamped after the class ended.
      expect(justEnded.rows[0].spokenAt).toEqual(endedAt);

      const longEnded = setup({
        liveSession: session({ endedAt: new Date(NOW.getTime() - TRANSCRIPT_END_GRACE_MS - 1000), status: "ENDED" })
      });
      await expect(longEnded.service.append(TOKEN, CLASS_ID, body(line("client-0001")), NOW)).rejects.toBeInstanceOf(
        BadRequestException
      );
      const scheduled = setup({ liveSession: session({ status: "SCHEDULED" }) });
      await expect(scheduled.service.append(TOKEN, CLASS_ID, body(line("client-0001")), NOW)).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  describe("read", () => {
    it("pages oldest first without skipping lines that share a timestamp", async () => {
      const { service } = setup();
      const lines = Array.from({ length: TRANSCRIPT_PAGE_SIZE + 3 }, (_, i) =>
        line(`client-${String(i).padStart(4, "0")}`, "2026-11-12T10:20:00.000Z", `line ${i}`)
      );
      for (let i = 0; i < lines.length; i += 50) {
        await service.append(TOKEN, CLASS_ID, body(...lines.slice(i, i + 50)), NOW);
      }

      const first = await service.read(TOKEN, CLASS_ID, undefined);
      expect(first.items).toHaveLength(TRANSCRIPT_PAGE_SIZE);
      expect(first.items[0]).toEqual({
        id: expect.any(String),
        lang: "en-IN",
        spokenAt: "2026-11-12T10:20:00.000Z",
        text: "line 0"
      });
      expect(first.nextCursor).toEqual(expect.any(String));

      const second = await service.read(TOKEN, CLASS_ID, first.nextCursor!);
      expect(second.items.map((l) => l.text)).toEqual(["line 200", "line 201", "line 202"]);
      expect(second.nextCursor).toBeNull();
    });

    it("rejects a tampered cursor as a 400", async () => {
      const { service } = setup();
      await expect(service.read(TOKEN, CLASS_ID, "not-a-cursor")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("consent", () => {
    it("reports only consent to the current version", async () => {
      await expect(setup().service.getConsent(TOKEN)).resolves.toEqual({
        consented: true,
        consentedAt: STARTED.toISOString(),
        currentVersion: TRANSCRIPT_CONSENT_VERSION
      });
      const stale = setup({ user: coach({ transcriptConsentAt: STARTED, transcriptConsentVersion: 0 }) });
      await expect(stale.service.getConsent(TOKEN)).resolves.toMatchObject({ consented: false, consentedAt: null });
    });

    it("records and withdraws the coach's own consent", async () => {
      const { prisma, service } = setup({ user: coach(null) });
      await expect(service.setConsent(TOKEN, { consent: true }, NOW)).resolves.toMatchObject({
        consented: true,
        consentedAt: NOW.toISOString()
      });
      expect(prisma.coachProfile.updateMany).toHaveBeenLastCalledWith({
        data: { transcriptConsentAt: NOW, transcriptConsentVersion: TRANSCRIPT_CONSENT_VERSION },
        where: { userId: "coach-1" }
      });
      await expect(service.setConsent(TOKEN, { consent: false }, NOW)).resolves.toMatchObject({ consented: false });
      expect(prisma.coachProfile.updateMany).toHaveBeenLastCalledWith({
        data: { transcriptConsentAt: null, transcriptConsentVersion: null },
        where: { userId: "coach-1" }
      });
    });

    it("is a coach's alone to give", async () => {
      const { service } = setup({ user: { coachProfile: null, id: "admin-1", role: UserRole.ADMIN } });
      await expect(service.getConsent(TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.setConsent(TOKEN, { consent: true })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("404s when the coach has no profile row", async () => {
      const { prisma, service } = setup();
      prisma.coachProfile.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.setConsent(TOKEN, { consent: true })).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
