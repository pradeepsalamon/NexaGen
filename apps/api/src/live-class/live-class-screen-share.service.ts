import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { LiveSessionStatus } from "./types/live-class.types";
import {
  deriveLiveKitGrants,
  liveClassSettingsSchema,
  LIVE_CLASS_SCREEN_SHARE_TOPIC,
  type LiveClassSettings,
  type ResolveScreenShareRequest,
  type ScreenShareRequestEntry,
  type ScreenShareRequestEvent,
  type ScreenShareRequestListResponse,
} from "@nexa-chess/types";
import {
  ScreenShareRequestStatus,
} from "@prisma/client";
import { LiveClassAccessService } from "./live-class-access.service";
import { withScreenShareSources } from "./live-class.util";

/** Student screen-share requests: per-student grant widening on top of the class policy. */
@Injectable()
export class LiveClassScreenShareService {
  private readonly logger = new Logger(LiveClassScreenShareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly access: LiveClassAccessService
  ) {}

  private static toScreenShareRequestEntry(row: {
    id: string;
    status: ScreenShareRequestStatus;
    requestedAt: Date;
    student: { firstName: string; lastName: string | null; avatarUrl: string | null };
    studentId: string;
  }): ScreenShareRequestEntry {
    return {
      id: row.id,
      studentId: row.studentId,
      studentName: `${row.student.firstName} ${row.student.lastName || ""}`.trim(),
      avatarUrl: row.student.avatarUrl,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
    };
  }

  private async announceScreenShareEvent(
    roomName: string,
    type: ScreenShareRequestEvent["type"],
    entry: ScreenShareRequestEntry,
  ): Promise<void> {
    try {
      const event: ScreenShareRequestEvent = { type, entry };
      await this.livekit.broadcastData(
        roomName,
        new TextEncoder().encode(JSON.stringify(event)),
        LIVE_CLASS_SCREEN_SHARE_TOPIC,
      );
    } catch (error) {
      this.logger.warn(`Failed to announce screen-share event in ${roomName}`, error as Error);
    }
  }

  /** Best-effort: widen one connected student's LiveKit grant to also allow screen share. */
  private async widenScreenShareGrant(
    liveSession: { roomName: string },
    studentId: string,
    settings: LiveClassSettings,
  ): Promise<void> {
    try {
      const participants = await this.livekit.listParticipants(liveSession.roomName);
      const participant = participants.find((p) => p.identity.split("_")[0] === studentId);
      if (!participant) return;
      const grants = withScreenShareSources(deriveLiveKitGrants(settings, "STUDENT"));
      await this.livekit.updateParticipantPermissions(liveSession.roomName, participant.identity, grants);
    } catch (error) {
      this.logger.warn(`Failed to widen screen-share grant for student ${studentId}`, error as Error);
    }
  }

  /**
   * Best-effort: put one connected student's LiveKit grant back to the plain
   * class policy and mute any screen-share track that fell out of it — the
   * same "mute what fell out of the allowed set" step `applyLiveSettingsToRoom`
   * does for a room-wide policy change.
   */
  private async narrowScreenShareGrant(
    liveSession: { roomName: string },
    studentId: string,
    settings: LiveClassSettings,
  ): Promise<void> {
    try {
      const participants = await this.livekit.listParticipants(liveSession.roomName);
      const participant = participants.find((p) => p.identity.split("_")[0] === studentId);
      if (!participant) return;
      const grants = deriveLiveKitGrants(settings, "STUDENT");
      await this.livekit.updateParticipantPermissions(liveSession.roomName, participant.identity, grants);
      const allowedSources = new Set(grants.canPublishSources);
      for (const track of participant.tracks ?? []) {
        if (track.muted) continue;
        const label = LiveKitService.trackSourceLabel(track.source);
        if (label && !allowedSources.has(label)) {
          await this.livekit.muteParticipantTrack(liveSession.roomName, participant.identity, track.sid);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to narrow screen-share grant for student ${studentId}`, error as Error);
    }
  }

  /** Coach-owner/admin: requests currently pending or approved, oldest first. */
  async getScreenShareRequestList(
    accessToken: string | undefined,
    classId: string,
  ): Promise<ScreenShareRequestListResponse> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);

    const rows = await this.prisma.liveClassScreenShareRequest.findMany({
      where: {
        liveSessionId: liveSession.id,
        status: { in: [ScreenShareRequestStatus.PENDING, ScreenShareRequestStatus.APPROVED] },
      },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { requestedAt: "asc" },
    });

    return { entries: rows.map((row) => LiveClassScreenShareService.toScreenShareRequestEntry(row)) };
  }

  /** Student: ask to share their screen while the class-wide policy is DISABLED. */
  async requestScreenShare(
    accessToken: string | undefined,
    classId: string,
  ): Promise<ScreenShareRequestEntry> {
    const { user, liveSession } = await this.access.resolveParticipant(accessToken, classId);
    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }

    let effectiveSettings: LiveClassSettings | null = null;
    try {
      if (liveSession.effectiveSettings) {
        effectiveSettings = liveClassSettingsSchema.parse(liveSession.effectiveSettings);
      }
    } catch (error) {
      this.logger.warn(`Invalid effectiveSettings for class ${classId}`, error as Error);
    }
    if (effectiveSettings?.student.screenShare === "ALLOWED") {
      throw new BadRequestException("Screen sharing is already allowed for this class.");
    }

    const existing = await this.prisma.liveClassScreenShareRequest.findUnique({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    // Idempotent: a pending or already-approved request isn't re-announced —
    // the client may retry the click before the first response lands.
    if (existing?.status === ScreenShareRequestStatus.PENDING || existing?.status === ScreenShareRequestStatus.APPROVED) {
      return LiveClassScreenShareService.toScreenShareRequestEntry(existing);
    }

    const updated = await this.prisma.liveClassScreenShareRequest.upsert({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      create: { liveSessionId: liveSession.id, studentId: user.id },
      update: { status: ScreenShareRequestStatus.PENDING, resolvedAt: null, resolvedById: null },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    const entry = LiveClassScreenShareService.toScreenShareRequestEntry(updated);
    await this.announceScreenShareEvent(liveSession.roomName, "REQUESTED", entry);
    return entry;
  }

  /** Coach-owner/admin: approve, deny, or revoke one student's screen-share request. */
  async resolveScreenShareRequest(
    accessToken: string | undefined,
    classId: string,
    body: ResolveScreenShareRequest,
  ): Promise<ScreenShareRequestEntry> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);

    const fromStatus =
      body.action === "REVOKE" ? ScreenShareRequestStatus.APPROVED : ScreenShareRequestStatus.PENDING;
    const toStatus =
      body.action === "APPROVE"
        ? ScreenShareRequestStatus.APPROVED
        : body.action === "DENY"
          ? ScreenShareRequestStatus.DENIED
          : ScreenShareRequestStatus.REVOKED;

    // The `status: fromStatus` filter is the idempotency guard against a
    // double-click or two coach tabs resolving the same request at once.
    const { count } = await this.prisma.liveClassScreenShareRequest.updateMany({
      where: { liveSessionId: liveSession.id, studentId: body.studentId, status: fromStatus },
      data: { status: toStatus, resolvedAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException("No matching screen-share request for that student.");
    }

    const updated = await this.prisma.liveClassScreenShareRequest.findUniqueOrThrow({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: body.studentId } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    let effectiveSettings: LiveClassSettings | null = null;
    try {
      if (liveSession.effectiveSettings) {
        effectiveSettings = liveClassSettingsSchema.parse(liveSession.effectiveSettings);
      }
    } catch (error) {
      this.logger.warn(`Invalid effectiveSettings for class ${classId}`, error as Error);
    }
    const settings = effectiveSettings ?? liveClassSettingsSchema.parse({});

    if (body.action === "APPROVE") {
      await this.widenScreenShareGrant(liveSession, body.studentId, settings);
    } else if (body.action === "REVOKE") {
      await this.narrowScreenShareGrant(liveSession, body.studentId, settings);
    }

    const entry = LiveClassScreenShareService.toScreenShareRequestEntry(updated);
    await this.announceScreenShareEvent(liveSession.roomName, "RESOLVED", entry);
    return entry;
  }

  /** Student: self-report that they stopped sharing, so the grant is narrowed back. */
  async endScreenShare(
    accessToken: string | undefined,
    classId: string,
  ): Promise<ScreenShareRequestEntry> {
    const { user, liveSession } = await this.access.resolveParticipant(accessToken, classId);

    const { count } = await this.prisma.liveClassScreenShareRequest.updateMany({
      where: { liveSessionId: liveSession.id, studentId: user.id, status: ScreenShareRequestStatus.APPROVED },
      data: { status: ScreenShareRequestStatus.REVOKED, resolvedAt: new Date(), resolvedById: user.id },
    });

    const updated = await this.prisma.liveClassScreenShareRequest.findUniqueOrThrow({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
    const entry = LiveClassScreenShareService.toScreenShareRequestEntry(updated);

    // count === 0 means the coach already revoked it first — a legitimate
    // race, not an error, so the student's client shouldn't see a failure.
    if (count > 0) {
      let effectiveSettings: LiveClassSettings | null = null;
      try {
        if (liveSession.effectiveSettings) {
          effectiveSettings = liveClassSettingsSchema.parse(liveSession.effectiveSettings);
        }
      } catch (error) {
        this.logger.warn(`Invalid effectiveSettings for class ${classId}`, error as Error);
      }
      await this.narrowScreenShareGrant(liveSession, user.id, effectiveSettings ?? liveClassSettingsSchema.parse({}));
      await this.announceScreenShareEvent(liveSession.roomName, "RESOLVED", entry);
    }

    return entry;
  }

  /**
   * Best-effort cleanup for a student who disconnects (crash, closed tab)
   * without a clean `endScreenShare` call — called from the LiveKit webhook
   * handler (`attendance-webhook.controller.ts`'s `participant_left`), not a
   * route, keyed directly by ids rather than an access token. A failure here
   * must never disrupt attendance recording.
   */
  async endScreenShareOnDisconnect(classId: string, studentId: string): Promise<void> {
    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) return;

    const { count } = await this.prisma.liveClassScreenShareRequest.updateMany({
      where: { liveSessionId: liveSession.id, studentId, status: ScreenShareRequestStatus.APPROVED },
      data: { status: ScreenShareRequestStatus.REVOKED, resolvedAt: new Date() },
    });
    if (count === 0) return;

    let effectiveSettings: LiveClassSettings | null = null;
    try {
      if (liveSession.effectiveSettings) {
        effectiveSettings = liveClassSettingsSchema.parse(liveSession.effectiveSettings);
      }
    } catch (error) {
      this.logger.warn(`Invalid effectiveSettings for class ${classId}`, error as Error);
    }
    await this.narrowScreenShareGrant(liveSession, studentId, effectiveSettings ?? liveClassSettingsSchema.parse({}));

    const updated = await this.prisma.liveClassScreenShareRequest.findUnique({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
    if (updated) {
      await this.announceScreenShareEvent(
        liveSession.roomName,
        "RESOLVED",
        LiveClassScreenShareService.toScreenShareRequestEntry(updated),
      );
    }
  }
}
