import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { LiveSessionStatus } from "./types/live-class.types";
import {
  LIVE_CLASS_RECORDING_TOPIC,
  type RecordingStateNotice,
} from "@nexa-chess/types";
import {
  UserRole,
  UserStatus,
} from "@prisma/client";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import type { Request, Response } from "express";
import { LiveClassAccessService } from "./live-class-access.service";

/**
 * One entry of an egress `fileResults` array as it arrives on the webhook.
 * `size` and `duration` are protobuf 64-bit fields, so they cross the wire as
 * strings; `duration` is in nanoseconds.
 */
type EgressFileResult = {
  location?: string;
  filename?: string;
  size?: string | number;
  duration?: string | number;
};

/** Class recording: egress start/stop, the egress webhook, and authorised playback. */
@Injectable()
export class LiveClassRecordingService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(LiveClassRecordingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly jwtService: JwtService,
    private readonly backupService: BackupService,
    private readonly recordingStorageService: RecordingStorageService,
    private readonly analyticsEvents: AnalyticsEventService,
    private readonly access: LiveClassAccessService
  ) {}

  /** Parses a protobuf 64-bit field, which may arrive as a string, or null. */
  private static toNumber(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Data-channel topic the live class broadcasts board state on. */
  private static readonly BOARD_SYNC_TOPIC = "board_sync";

  /**
   * Nudge the coach's client to re-broadcast the full board snapshot so the
   * recording template starts on the current position rather than the initial
   * one. Best-effort: a failure here costs the board's opening state, never the
   * recording itself.
   */
  private async requestBoardSyncForRecorder(roomName: string) {
    const payload = new TextEncoder().encode(JSON.stringify({ type: "REQUEST_SYNC" }));
    for (const delayMs of [4000, 9000]) {
      setTimeout(() => {
        this.livekit
          .broadcastData(roomName, payload, LiveClassRecordingService.BOARD_SYNC_TOPIC)
          .catch((error) =>
            this.logger.warn(
              `Failed to request a board sync for the recorder in ${roomName}: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          );
      }, delayMs).unref?.();
    }
  }

  async startRecording(accessToken: string | undefined, classId: string) {
    // The owning coach or an admin — any other coach is refused, not just
    // students (a role check alone let one coach record another's class).
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);

    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not live.");
    }

    const metadata = (liveSession.metadata as Record<string, any>) || {};
    if (metadata.egressId) {
      throw new BadRequestException("Recording is already in progress.");
    }

    const roomName = liveSession.roomName;
    const timestamp = new Date().getTime();
    const filepath = `recordings/${roomName}-${timestamp}.mp4`;

    await this.recordingStorageService.ensureStorageCapacity();
    const egressId = await this.livekit.startRecording(liveSession.roomName, filepath, classId);

    // The recording template joins as a hidden, subscribe-only participant, so
    // it cannot ask for the board state itself the way a late-joining student
    // does. Inject the request server-side instead: the coach answers with a
    // FORCE_SYNC carrying the full snapshot, which reaches the recorder like
    // any other board packet. Repeated because the template needs a few
    // seconds to launch Chrome and connect, and a request sent before it is in
    // the room is simply missed.
    void this.requestBoardSyncForRecorder(liveSession.roomName);

    // Do NOT set `recordingUrl` yet — a failed egress would leave a Download
    // button that 404s. It's set from the `egress_ended` webhook only when the
    // recording actually completes (AUDIT M20).
    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: {
        recordingStatus: "RECORDING",
        recordingStartedAt: new Date(),
        metadata: {
          ...metadata,
          egressId,
          recordingFilepath: filepath,
          recordingStatus: "RECORDING",
        },
      },
    });

    void this.announceRecordingState(roomName, true);

    return { success: true, egressId, filepath };
  }

  /** Best-effort: a dropped packet only delays the UI until LiveKit catches up. */
  private async announceRecordingState(roomName: string, recording: boolean) {
    try {
      const notice: RecordingStateNotice = { type: "RECORDING_STATE", recording };
      await this.livekit.broadcastData(
        roomName,
        new TextEncoder().encode(JSON.stringify(notice)),
        LIVE_CLASS_RECORDING_TOPIC
      );
    } catch (error) {
      this.logger.warn(`Failed to announce recording state in ${roomName}`, error as Error);
    }
  }

  async stopRecording(accessToken: string | undefined, classId: string) {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);

    const metadata = (liveSession.metadata as Record<string, any>) || {};
    if (!metadata.egressId) {
      throw new BadRequestException("No active recording found for this class.");
    }

    await this.livekit.stopRecording(metadata.egressId);

    const { egressId: _egressId, ...restMetadata } = metadata;

    // Keep `recordingFilepath`/`recordingStatus`; the `egress_ended` webhook
    // resolves the final state and sets `recordingUrl` on success (AUDIT M20).
    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: {
        recordingStatus: "STOPPING",
        metadata: { ...restMetadata, recordingStatus: "STOPPING" },
      },
    });

    void this.announceRecordingState(liveSession.roomName, false);

    return { success: true };
  }

  /**
   * Finalises or updates recording state from LiveKit egress webhooks:
   * - `egress_started` / `egress_updated`: Marks status as RECORDING (or STOPPING).
   * - `egress_ended`: Sets `recordingUrl` only on successful completion with normalized S3 key.
   */
  async handleEgressEnded(egressInfo: {
    eventType?: string;
    egressId?: string;
    roomName?: string;
    status?: string | number;
    file?: EgressFileResult;
    fileResults?: EgressFileResult[];
  }) {
    const roomName = egressInfo.roomName;
    const egressId = egressInfo.egressId;

    let liveSession = roomName
      ? await this.prisma.liveSession.findUnique({ where: { roomName } })
      : null;

    // Fall back to finding by active live session with matching egressId in metadata
    if (!liveSession && egressId) {
      const activeSessions = await this.prisma.liveSession.findMany({
        where: {
          status: { in: [LiveSessionStatus.LIVE, LiveSessionStatus.ENDED] },
        },
      });
      liveSession =
        activeSessions.find(
          (s) => (s.metadata as Record<string, any>)?.egressId === egressId
        ) || null;
    }

    if (!liveSession) return;

    const metadata = (liveSession.metadata as Record<string, any>) || {};
    const statusStr = String(egressInfo.status ?? "").toUpperCase();
    const eventType = egressInfo.eventType || "";

    // Egress active / starting
    if (
      eventType === "egress_started" ||
      statusStr === "1" ||
      statusStr === "EGRESS_ACTIVE" ||
      statusStr === "0" ||
      statusStr === "EGRESS_STARTING"
    ) {
      await this.prisma.liveSession.update({
        where: { id: liveSession.id },
        data: {
          recordingStatus: "RECORDING",
          recordingStartedAt: liveSession.recordingStartedAt ?? new Date(),
          metadata: {
            ...metadata,
            ...(egressId ? { egressId } : {}),
            recordingStatus: "RECORDING",
          },
        },
      });
      return;
    }

    // Egress ending / stopping
    if (statusStr === "2" || statusStr === "EGRESS_ENDING") {
      await this.prisma.liveSession.update({
        where: { id: liveSession.id },
        data: {
          recordingStatus: "STOPPING",
          metadata: {
            ...metadata,
            recordingStatus: "STOPPING",
          },
        },
      });
      return;
    }

    // Egress ended / complete or failed
    const completed =
      statusStr === "3" ||
      statusStr === "EGRESS_COMPLETE" ||
      /complete/i.test(statusStr);

    const fileResult = egressInfo.fileResults?.[0] ?? egressInfo.file;
    const rawLocation =
      fileResult?.filename || fileResult?.location || metadata.recordingFilepath || null;

    // Normalize S3 key to recordings/...
    const normalizeRecordingKey = (raw: string | null): string | null => {
      if (!raw) return null;
      const match = raw.match(/(recordings\/[^\s?#]+)/);
      if (match) return match[1];
      return raw.startsWith("/") ? raw.slice(1) : raw;
    };

    const location = normalizeRecordingKey(rawLocation);

    const { egressId: _activeEgressId, ...restMetadata } = metadata;

    // Promote recording metadata onto dedicated columns for analytics. The
    // egress file result carries the authoritative size and duration (duration
    // in nanoseconds) — use those, and only fall back to reading the file off
    // disk / the class's run length when a result omits them. Without this
    // every recording reported the scheduled class length rather than how much
    // video was actually captured.
    let recordingBytes: bigint | null = null;
    let recordingDurationSeconds: number | null = null;
    if (completed && location) {
      const reportedBytes = LiveClassRecordingService.toNumber(fileResult?.size);
      recordingBytes =
        reportedBytes !== null && reportedBytes > 0
          ? BigInt(Math.round(reportedBytes))
          : await this.recordingStorageService
              .getFileBytes(location)
              .then((bytes) => (bytes === null ? null : BigInt(bytes)));

      const reportedDurationNs = LiveClassRecordingService.toNumber(fileResult?.duration);
      if (reportedDurationNs !== null && reportedDurationNs > 0) {
        recordingDurationSeconds = Math.round(reportedDurationNs / 1e9);
      } else {
        const cls = await this.prisma.coachClass.findUnique({
          where: { id: liveSession.classId },
          select: { startsAt: true, endsAt: true },
        });
        const actualMs =
          liveSession.startedAt && liveSession.endedAt
            ? liveSession.endedAt.getTime() - liveSession.startedAt.getTime()
            : cls
              ? cls.endsAt.getTime() - cls.startsAt.getTime()
              : 0;
        recordingDurationSeconds = actualMs > 0 ? Math.round(actualMs / 1000) : null;
      }
    }

    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: {
        recordingUrl: completed ? location : null,
        recordingStatus: completed ? "COMPLETED" : "FAILED",
        recordingCompletedAt: completed ? new Date() : null,
        ...(recordingBytes !== null ? { recordingBytes } : {}),
        ...(recordingDurationSeconds !== null ? { recordingDurationSeconds } : {}),
        metadata: {
          ...restMetadata,
          recordingFilepath: location || metadata.recordingFilepath,
          recordingStatus: completed ? "COMPLETED" : "FAILED",
        },
      },
    });
  }

  /** Prisma include that pulls the batch students needed for recording access checks. */
  private static readonly recordingAccessInclude = {
    batch: { include: { students: true } },
    class: { include: { batch: { include: { students: true } } } },
  } as const;

  /**
   * Recording visibility: admins always, the owning coach, or a student in the
   * session's batch. Throws Forbidden otherwise.
   */
  private assertCanViewRecording(
    user: { id: string; role: UserRole },
    liveSession: {
      coachId: string;
      batch?: { students: { studentId: string; isDeleted: boolean }[] } | null;
      class?: { batch?: { students: { studentId: string; isDeleted: boolean }[] } | null } | null;
    }
  ) {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return;
    if (user.role === UserRole.COACH && liveSession.coachId === user.id) return;

    if (user.role === UserRole.STUDENT) {
      const batchStudents =
        liveSession.batch?.students || liveSession.class?.batch?.students || [];
      if (batchStudents.some((s) => s.studentId === user.id && !s.isDeleted)) return;
    }

    throw new ForbiddenException("You are not authorized to view this recording.");
  }

  /**
   * Short-lived, single-purpose token that lets a `<video>` element (which can't
   * send an Authorization header or, in some browsers, cookies) fetch one
   * recording. It is NOT an account token — it only names a viewer + class and
   * access is still re-checked against the batch on every request.
   */
  private mintRecordingStreamToken(userId: string, classId: string) {
    return this.jwtService.signAsync(
      { type: "recording-stream", sub: userId, classId },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: "15m" }
    );
  }

  private async resolveRecordingViewer(
    accessToken: string | undefined,
    streamToken: string | undefined,
    classId: string
  ) {
    if (accessToken) return this.access.authenticate(accessToken);

    if (streamToken) {
      let payload: { type?: string; sub?: string; classId?: string };
      try {
        payload = await this.jwtService.verifyAsync(streamToken, {
          secret: this.env.JWT_ACCESS_SECRET,
        });
      } catch {
        throw new UnauthorizedException("Invalid or expired stream token.");
      }
      if (
        payload.type !== "recording-stream" ||
        payload.classId !== classId ||
        !payload.sub
      ) {
        throw new UnauthorizedException("Invalid stream token.");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { coachProfile: true, studentProfile: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("Invalid session.");
      }
      return user;
    }

    throw new UnauthorizedException("Access token is missing.");
  }

  async downloadRecording(
    accessToken: string | undefined,
    classId: string,
    req: Request,
    download = false
  ) {
    const user = await this.access.authenticate(accessToken);

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: LiveClassRecordingService.recordingAccessInclude,
    });

    if (!liveSession || !liveSession.recordingUrl) {
      throw new NotFoundException("Recording not found.");
    }

    this.assertCanViewRecording(user, liveSession);

    if (this.recordingStorageService.hasLocalFile(liveSession.recordingUrl)) {
      const streamToken = await this.mintRecordingStreamToken(user.id, classId);
      const base = `${req.protocol}://${req.get("host")}`;
      const query = `st=${streamToken}${download ? "&dl=1" : ""}`;
      return {
        url: `${base}/live-class/${classId}/recording/stream?${query}`,
      };
    }

    return this.backupService.getDownloadUrl(liveSession.recordingUrl);
  }

  async streamRecording(
    accessToken: string | undefined,
    streamToken: string | undefined,
    classId: string,
    req: Request,
    res: Response,
    download = false
  ) {
    const user = await this.resolveRecordingViewer(accessToken, streamToken, classId);

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: LiveClassRecordingService.recordingAccessInclude,
    });

    if (!liveSession || !liveSession.recordingUrl) {
      throw new NotFoundException("Recording not found.");
    }

    this.assertCanViewRecording(user, liveSession);

    await this.recordingStorageService.streamVideoFile(
      liveSession.recordingUrl,
      req,
      res,
      { attachment: download }
    );
  }

  async getRecordingStorageUsage(accessToken: string | undefined) {
    const user = await this.access.authenticate(accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can view recording storage metrics.");
    }
    return this.recordingStorageService.getStorageUsage();
  }

  async updateRecordingProgress(accessToken: string | undefined, classId: string, watchedSeconds: number) {
    const user = await this.access.authenticate(accessToken);

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: {
        batch: {
          include: { students: true },
        },
        class: {
          include: { batch: { include: { students: true } } },
        },
      },
    });

    if (!liveSession || !liveSession.recordingUrl) {
      throw new NotFoundException("Recording not found.");
    }

    // Must be a student in the batch to track progress (coaches/admins don't need tracking)
    if (user.role !== UserRole.STUDENT) {
      return { success: true, ignored: true };
    }

    const batchStudents = liveSession.batch?.students || liveSession.class?.batch?.students || [];
    const isStudentInBatch = batchStudents.some((s) => s.studentId === user.id && !s.isDeleted);
    
    if (!isStudentInBatch) {
      throw new ForbiddenException("You are not authorized to view this recording.");
    }

    // Upsert tracking progress. We only want to increase watchedSeconds if it's higher
    const existing = await this.prisma.recordingWatchProgress.findUnique({
      where: {
        studentId_classId: {
          studentId: user.id,
          classId: classId,
        },
      },
    });

    if (!existing) {
      await this.prisma.recordingWatchProgress.create({
        data: {
          studentId: user.id,
          classId: classId,
          liveSessionId: liveSession.id,
          watchedSeconds,
        },
      });
    } else if (watchedSeconds > existing.watchedSeconds) {
      await this.prisma.recordingWatchProgress.update({
        where: { id: existing.id },
        data: { watchedSeconds },
      });
    }

    void this.analyticsEvents.recordRecordingWatchOncePerDay(user.id, classId);

    return { success: true };
  }
}
