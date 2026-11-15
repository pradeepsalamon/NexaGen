import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  liveClassSettingsSchema,
  TRANSCRIPT_CONSENT_VERSION,
  TRANSCRIPT_PAGE_SIZE,
  transcriptConsentIsCurrent,
  type AppendTranscriptRequest,
  type AppendTranscriptResponse,
  type LiveClassTranscriptLine,
  type LiveClassTranscriptResponse,
  type SetTranscriptConsentRequest,
  type TranscriptConsentResponse
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { decodeCreatedAtCursor, encodeCreatedAtCursor } from "../common/cursor-pagination";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassAccessService } from "./live-class-access.service";
import { LiveSessionStatus } from "./types/live-class.types";

/** A class that just ended still takes the coach's last buffered lines for this long. */
export const TRANSCRIPT_END_GRACE_MS = 2 * 60 * 1000;

type ConsentRow = { transcriptConsentAt: Date | null; transcriptConsentVersion: number | null };

/**
 * The stored transcript of the coach's speech. The coach's browser does the
 * recognition and posts finished phrases as text; no audio reaches the API.
 * Only the class's own coach is ever transcribed, only while the class setting
 * is on, and only after that coach agreed (`CoachProfile.transcriptConsentAt`).
 * Reading is coach-owner/admin: students never see it.
 */
@Injectable()
export class LiveClassTranscriptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LiveClassAccessService
  ) {}

  async append(
    accessToken: string | undefined,
    classId: string,
    body: AppendTranscriptRequest,
    now: Date = new Date()
  ): Promise<AppendTranscriptResponse> {
    const { user, liveSession } = await this.access.resolveClassManager(accessToken, classId);
    // resolveClassManager lets an admin through; a transcript is the coach's
    // own voice under the coach's own consent, so nobody writes one for them.
    if (user.role !== UserRole.COACH || liveSession.coachId !== user.id) {
      throw new ForbiddenException("Only the class's own coach is transcribed.");
    }
    this.assertAcceptingLines(liveSession, now);
    this.assertTranscriptEnabled(liveSession.effectiveSettings);
    if (!transcriptConsentIsCurrent(user.coachProfile ?? { transcriptConsentAt: null, transcriptConsentVersion: null })) {
      throw new ForbiddenException("Agree to the class transcript before it can be saved.");
    }

    const earliest = (liveSession.startedAt ?? now).getTime();
    const latest = (liveSession.endedAt ?? now).getTime();
    const byClientId = new Map(body.lines.map((line) => [line.clientId, line]));
    const result = await this.prisma.liveClassTranscriptSegment.createMany({
      data: [...byClientId.values()].map((line) => ({
        clientId: line.clientId,
        lang: line.lang,
        liveSessionId: liveSession.id,
        speakerId: user.id,
        // The coach's clock is not trusted beyond ordering inside the class.
        spokenAt: new Date(Math.min(Math.max(new Date(line.spokenAt).getTime(), earliest), Math.max(earliest, latest))),
        text: line.text
      })),
      // A retried request (lost response, page closing) finds its lines stored.
      skipDuplicates: true
    });
    return { saved: result.count };
  }

  async read(
    accessToken: string | undefined,
    classId: string,
    cursor: string | undefined
  ): Promise<LiveClassTranscriptResponse> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);
    const after = cursor ? decodeCreatedAtCursor(cursor) : null;
    const rows = await this.prisma.liveClassTranscriptSegment.findMany({
      orderBy: [{ spokenAt: "asc" }, { id: "asc" }],
      select: { id: true, lang: true, spokenAt: true, text: true },
      take: TRANSCRIPT_PAGE_SIZE + 1,
      where: {
        liveSessionId: liveSession.id,
        ...(after
          ? { OR: [{ spokenAt: { gt: after.createdAt } }, { id: { gt: after.id }, spokenAt: after.createdAt }] }
          : {})
      }
    });
    const items = rows.slice(0, TRANSCRIPT_PAGE_SIZE);
    const last = items[items.length - 1];
    return {
      items: items.map(LiveClassTranscriptService.toLine),
      nextCursor:
        rows.length > TRANSCRIPT_PAGE_SIZE && last
          ? encodeCreatedAtCursor({ createdAt: last.spokenAt, id: last.id })
          : null
    };
  }

  async getConsent(accessToken: string | undefined): Promise<TranscriptConsentResponse> {
    const user = await this.authenticateCoach(accessToken);
    return LiveClassTranscriptService.toConsent(user.coachProfile);
  }

  /**
   * Withdrawing stops any further transcription at once (`append` re-reads the
   * consent on every request). Lines already stored age out on the retention
   * window; they are not deleted here.
   */
  async setConsent(
    accessToken: string | undefined,
    body: SetTranscriptConsentRequest,
    now: Date = new Date()
  ): Promise<TranscriptConsentResponse> {
    const user = await this.authenticateCoach(accessToken);
    const next: ConsentRow = body.consent
      ? { transcriptConsentAt: now, transcriptConsentVersion: TRANSCRIPT_CONSENT_VERSION }
      : { transcriptConsentAt: null, transcriptConsentVersion: null };
    const updated = await this.prisma.coachProfile.updateMany({ data: next, where: { userId: user.id } });
    if (updated.count === 0) {
      throw new NotFoundException("Your coach profile was not found.");
    }
    return LiveClassTranscriptService.toConsent(next);
  }

  private async authenticateCoach(accessToken: string | undefined) {
    const user = await this.access.authenticate(accessToken);
    if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only a coach gives consent to a class transcript.");
    }
    return user;
  }

  private assertAcceptingLines(
    liveSession: { endedAt: Date | null; status: LiveSessionStatus },
    now: Date
  ) {
    if (liveSession.status === LiveSessionStatus.LIVE) return;
    const justEnded =
      liveSession.status === LiveSessionStatus.ENDED &&
      !!liveSession.endedAt &&
      now.getTime() - liveSession.endedAt.getTime() <= TRANSCRIPT_END_GRACE_MS;
    if (!justEnded) {
      throw new BadRequestException("Class is not currently live.");
    }
  }

  private assertTranscriptEnabled(effectiveSettings: unknown) {
    const settings = liveClassSettingsSchema.safeParse(effectiveSettings ?? {});
    if (!settings.success || settings.data.transcript !== "ENABLED") {
      throw new ForbiddenException("The transcript is turned off for this class.");
    }
  }

  private static toConsent(row: ConsentRow | null | undefined): TranscriptConsentResponse {
    const consented = !!row && transcriptConsentIsCurrent(row);
    return {
      consented,
      consentedAt: consented && row?.transcriptConsentAt ? row.transcriptConsentAt.toISOString() : null,
      currentVersion: TRANSCRIPT_CONSENT_VERSION
    };
  }

  private static toLine(row: { id: string; lang: string; spokenAt: Date; text: string }): LiveClassTranscriptLine {
    return { id: row.id, lang: row.lang, spokenAt: row.spokenAt.toISOString(), text: row.text };
  }
}
