import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  Inject,
  forwardRef
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { LiveSessionStatus, LiveKitTokenOptions } from "./types/live-class.types";
import { UserRole, UserStatus, ClassStatus } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import type { Request, Response } from "express";

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

@Injectable()
export class LiveClassService {
  // Postgres advisory-lock key for the stale-class sweep (AUDIT M21).
  private static readonly STALE_CLASS_LOCK_ID = 73002002;

  private readonly env = getApiEnv();
  private readonly logger = new Logger(LiveClassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
    private readonly backupService: BackupService,
    private readonly recordingStorageService: RecordingStorageService,
    private readonly analyticsEvents: AnalyticsEventService
  ) { }

  /** Parses a protobuf 64-bit field, which may arrive as a string, or null. */
  private static toNumber(value: string | number | undefined | null): number | null {
    if (value === undefined || value === null) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Matches the coach's participant regardless of the `_<clientId>` tab suffix (AUDIT M23). */
  private static isCoachParticipant(identity: string | undefined, coachId: string) {
    return identity === coachId || identity?.split("_")[0] === coachId;
  }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        accessToken,
        { secret: this.env.JWT_ACCESS_SECRET }
      );
      if (payload.type !== "access") {
        throw new UnauthorizedException("Invalid token type.");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { coachProfile: true, studentProfile: true }
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("Invalid session.");
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }

  /**
   * Loads the live session for a class and asserts the caller may participate in
   * it: the owning coach, a student enrolled in the batch, or an admin.
   */
  private async getAccessibleLiveSession(
    user: { id: string; role: UserRole },
    classId: string,
    notFoundMessage = "Live session not found."
  ) {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
    });

    if (!liveSession) {
      throw new NotFoundException(notFoundMessage);
    }

    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;
    const isStudent =
      user.role === UserRole.STUDENT &&
      !!liveSession.batch?.students.some((s) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You do not have access to this class.");
    }

    return liveSession;
  }

  async startClass(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only coaches can start a live class.");
    }

    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: classId }
    });

    if (!scheduledClass) {
      throw new NotFoundException("Class not found.");
    }

    if (scheduledClass.coachId !== user.id) {
      throw new ForbiddenException("You are not assigned to this class.");
    }

    if (scheduledClass.status === "CANCELLED" || scheduledClass.status === "COMPLETED") {
      throw new BadRequestException("Cannot start a cancelled or completed class.");
    }

    let liveSession = await this.prisma.liveSession.findUnique({
      where: { classId }
    });

    if (liveSession && liveSession.status === LiveSessionStatus.LIVE) {
      throw new ConflictException("Live class is already running.");
    }

    if (!liveSession) {
      const roomName = this.livekit.generateRoomName(classId);
      const room = await this.livekit.createRoom(roomName);

      liveSession = await this.prisma.liveSession.create({
        data: {
          batchId: scheduledClass.batchId,
          coachId: scheduledClass.coachId,
          classId: scheduledClass.id,
          roomName: roomName,
          livekitRoomName: room.sid,
          status: LiveSessionStatus.LIVE,
          scheduledAt: scheduledClass.startsAt,
          startedAt: new Date()
        }
      });
    } else {
      liveSession = await this.prisma.liveSession.update({
        where: { id: liveSession.id },
        data: {
          status: LiveSessionStatus.LIVE,
          startedAt: new Date()
        }
      });
    }

    // Only the status changes. `startsAt`/`endsAt` are the *scheduled* window
    // and must stay immutable — overwriting them destroyed the schedule, made
    // "scheduled duration" equal the actual duration, and forced the coach
    // late-start metric to always be zero. Actual times live on the
    // LiveSession (`startedAt` / `endedAt`). See AUDIT.md H2.
    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { status: ClassStatus.LIVE }
    });

    return { message: "Class started successfully", liveSession };
  }

  async getToken(accessToken: string | undefined, classId: string, clientId?: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: classId }
    });

    if (!scheduledClass) {
      throw new NotFoundException("Class not found.");
    }

    if (scheduledClass.status !== ClassStatus.LIVE) {
      throw new ForbiddenException("Class is not currently active.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { 
        batch: { include: { students: { where: { isDeleted: false } } } },
        class: true
      }
    });

    if (!liveSession) {
      throw new NotFoundException("Live class has not been started yet.");
    }

    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException(`Live class is currently ${liveSession.status}.`);
    }

    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;
    const isStudent = user.role === UserRole.STUDENT && liveSession.batch?.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You are not authorized to join this class.");
    }

    if (isStudent) {
      const coachNotJoined = new BadRequestException({
        // AUDIT H14: a structured `code` lets the web app branch on this
        // specific, common, non-terminal condition instead of substring-
        // matching `message` (which fell through to a generic "Connection
        // Lost" screen with no retry).
        message: "Coach has not joined the meeting yet. Please wait.",
        code: "COACH_NOT_JOINED"
      });

      let participants: Awaited<ReturnType<typeof this.livekit.listParticipants>>;
      try {
        // `listParticipants` returns `[]` for a not-yet-created room and only
        // throws on a real LiveKit outage, which must not be disguised as
        // "coach hasn't joined" (AUDIT M22).
        participants = await this.livekit.listParticipants(liveSession.roomName);
      } catch (error) {
        this.logger.error(`LiveKit listParticipants failed for ${liveSession.roomName}`, error as Error);
        throw new ServiceUnavailableException({
          message: "The live class service is temporarily unavailable. Please try again.",
          code: "LIVEKIT_UNAVAILABLE"
        });
      }

      if (!participants.some(p => LiveClassService.isCoachParticipant(p.identity, liveSession.coachId))) {
        throw coachNotJoined;
      }
    }

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveSession.roomName,
      participantIdentity: clientId ? `${user.id}_${clientId}` : user.id,
      participantName: `${user.firstName} ${user.lastName || ""}`.trim(),
      isCoach: isCoach || isAdmin
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveSession.class?.topic || liveSession.class?.title || "Live Class";

    // Auto-mark attendance for students when they request a token (join class)
    if (isStudent && liveSession.classId) {
      try {
        await this.attendanceService.recordJoinEvent(
          liveSession.classId,
          user.id,
          { source: "TOKEN_REQUEST" }
        );
      } catch (error) {
        this.logger.warn(`Failed to record attendance for student ${user.id}`, error);
      }
      void this.analyticsEvents.record(user.id, "CLASS_JOIN", liveSession.classId);
    }

    return { token: livekitToken, roomName: liveSession.roomName, topic };
  }

  async endClass(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    if (user.role !== UserRole.COACH && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("You do not have permission to end this class.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId }
    });

    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }

    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only end your own classes.");
    }

    await this.internalEndClass(classId, liveSession.id, liveSession.roomName);

    return { message: "Class ended successfully" };
  }

  private async internalEndClass(classId: string, liveSessionId: string, roomName: string) {
    // Idempotent: only the run that actually flips LIVE -> ENDED does the work,
    // so a retry (or the per-minute cron racing a manual end) can't double-
    // finalize attendance or re-delete the room (AUDIT M21).
    const { count } = await this.prisma.liveSession.updateMany({
      where: { id: liveSessionId, status: LiveSessionStatus.LIVE },
      data: {
        status: LiveSessionStatus.ENDED,
        endedAt: new Date()
      }
    });

    if (count === 0) {
      return;
    }

    try {
      await this.livekit.deleteRoom(roomName);
    } catch (error) {
      this.logger.warn(`Failed to delete LiveKit room ${roomName}`, error);
    }

    // `endsAt` stays as scheduled — the real end time is LiveSession.endedAt,
    // which was just written above. See AUDIT.md H2.
    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { status: ClassStatus.COMPLETED }
    });

    // Finalize attendance calculations for all students
    try {
      await this.attendanceService.finalizeClassAttendance(classId);
    } catch (error) {
      this.logger.error(`Failed to finalize attendance for class ${classId}`, error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleStaleClasses() {
    try {
      // Only one instance should sweep stale classes per tick (AUDIT M21).
      const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${LiveClassService.STALE_CLASS_LOCK_ID}) AS locked
      `;
      if (!lock?.locked) {
        return;
      }

      try {
        await this.sweepStaleClasses();
      } finally {
        await this.prisma.$queryRaw`
          SELECT pg_advisory_unlock(${LiveClassService.STALE_CLASS_LOCK_ID})
        `;
      }
    } catch (error) {
      this.logger.error("Error in handleStaleClasses cron job", error);
    }
  }

  private async sweepStaleClasses() {
      const now = new Date();

      // Find all LIVE sessions whose scheduled end time has passed
      const activeSessions = await this.prisma.liveSession.findMany({
        where: {
          status: LiveSessionStatus.LIVE,
          class: {
            endsAt: {
              lte: now
            }
          }
        },
        include: {
          class: true
        }
      });

      for (const session of activeSessions) {
        try {
          const participants = await this.livekit.listParticipants(session.roomName);
          const coachParticipant = participants.find(p => LiveClassService.isCoachParticipant(p.identity, session.coachId));
          
          if (!coachParticipant) {
            this.logger.log(`Automatically ending class ${session.classId} because coach left after scheduled end time.`);
            await this.internalEndClass(session.classId, session.id, session.roomName);
          }
        } catch (error) {
          this.logger.error(`Failed to auto-end class ${session.classId}`, error);
        }
      }
  }

  async getLiveClass(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { 
        liveSession: true,
        batch: { include: { students: { where: { isDeleted: false } } } }
      }
    });

    if (!scheduledClass) {
      throw new NotFoundException("Class not found.");
    }

    const isCoach = user.role === UserRole.COACH && scheduledClass.coachId === user.id;
    const isStudent = user.role === UserRole.STUDENT && scheduledClass.batch?.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You do not have access to this class.");
    }

    // Exclude the deeply nested batch details before returning to avoid over-fetching/leaking
    const { batch: _batch, ...classWithoutBatch } = scheduledClass;

    return classWithoutBatch;
  }

  async getParticipants(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const liveSession = await this.getAccessibleLiveSession(
      user,
      classId,
      "Live class not found."
    );

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    return { participants };
  }

  async joinDemoClass(classId: string, body: { guestName: string }) {
    if (!body.guestName || body.guestName.trim().length === 0) {
      throw new BadRequestException("Guest name is required");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { class: true }
    });

    if (!liveSession) {
      // No live session created yet — class hasn't started
      const coachClass = await this.prisma.coachClass.findUnique({ where: { id: classId } });
      if (coachClass?.status === 'COMPLETED') {
        throw new NotFoundException("This demo class has already ended.");
      }
      if (coachClass?.status === 'CANCELLED') {
        throw new NotFoundException("This demo class has been cancelled.");
      }
      const now = new Date();
      if (coachClass?.startsAt && coachClass.startsAt > now) {
        const formattedTime = coachClass.startsAt.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        throw new NotFoundException(`This demo class has not started yet. It is scheduled for ${formattedTime}. Please wait for the coach to begin the session.`);
      }
      throw new NotFoundException("This demo class has not started yet. Please wait for the coach to begin the session.");
    }

    if (liveSession.status === LiveSessionStatus.ENDED) {
      throw new NotFoundException("This demo class has already ended.");
    }

    if (liveSession.status !== LiveSessionStatus.LIVE) {
      const now = new Date();
      if (liveSession.class?.startsAt && liveSession.class.startsAt > now) {
        const formattedTime = liveSession.class.startsAt.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        throw new NotFoundException(`This demo class has not started yet. It is scheduled for ${formattedTime}. Please wait for the coach to begin the session.`);
      }
      throw new NotFoundException("This demo class has not started yet. Please wait for the coach to begin the session.");
    }

    if (!liveSession.class?.isDemo) {
      throw new ForbiddenException("This class is not a demo class.");
    }

    // `crypto.randomUUID()` — the old `Math.random().toString(36).substring(7)`
    // yielded ~4 chars, so two guests could collide and LiveKit would evict the
    // earlier one for a duplicate identity (AUDIT M18).
    const participantIdentity = `guest_${randomUUID()}`;

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveSession.roomName,
      participantIdentity,
      participantName: body.guestName,
      isCoach: false
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveSession.class?.topic || liveSession.class?.title || "Demo Class";

    // Append the guest to metadata.participants with a single atomic JSONB
    // update, so concurrent guest joins don't clobber each other's entries via
    // a read-modify-write race (AUDIT M19).
    const guestEntry = JSON.stringify([
      { name: body.guestName, joinedAt: new Date().toISOString() }
    ]);
    await this.prisma.$executeRaw`
      UPDATE "live_sessions"
      SET "metadata" = jsonb_set(
        COALESCE("metadata", '{}'::jsonb),
        '{participants}',
        COALESCE("metadata" -> 'participants', '[]'::jsonb) || ${guestEntry}::jsonb,
        true
      )
      WHERE "id" = ${liveSession.id}
    `;

    return { token: livekitToken, roomName: liveSession.roomName, topic };
  }

  async saveChatMessage(
    accessToken: string | undefined,
    classId: string,
    message: string,
    clientMessageId?: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      throw new BadRequestException("Message cannot be empty.");
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException("Message is too long (2000 characters max).");
    }

    const liveSession = await this.getAccessibleLiveSession(user, classId);

    const name = [user.firstName, user.role === UserRole.COACH ? user.lastName : null]
      .filter(Boolean)
      .join(" ")
      .trim();

    return this.prisma.liveChatMessage.create({
      data: {
        liveSessionId: liveSession.id,
        senderId: user.id,
        senderName: name,
        senderRole: user.role,
        message: trimmed,
        clientMessageId: clientMessageId ?? null,
      },
    });
  }

  async getChatHistory(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const liveSession = await this.getAccessibleLiveSession(user, classId);

    return this.prisma.liveChatMessage.findMany({
      where: { liveSessionId: liveSession.id },
      orderBy: { createdAt: "asc" },
      take: 500, // Limit to last 500 messages
    });
  }

  async startRecording(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.COACH && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only coaches or admins can start recording.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });

    if (!liveSession) {
      throw new NotFoundException("Live session not found.");
    }

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
    const egressId = await this.livekit.startRecording(liveSession.roomName, filepath);

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

    return { success: true, egressId, filepath };
  }

  async stopRecording(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.COACH && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only coaches or admins can stop recording.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });

    if (!liveSession) {
      throw new NotFoundException("Live session not found.");
    }

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
      const reportedBytes = LiveClassService.toNumber(fileResult?.size);
      recordingBytes =
        reportedBytes !== null && reportedBytes > 0
          ? BigInt(Math.round(reportedBytes))
          : await this.recordingStorageService
              .getFileBytes(location)
              .then((bytes) => (bytes === null ? null : BigInt(bytes)));

      const reportedDurationNs = LiveClassService.toNumber(fileResult?.duration);
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
    if (accessToken) return this.getAuthenticatedUser(accessToken);

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
    const user = await this.getAuthenticatedUser(accessToken);

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: LiveClassService.recordingAccessInclude,
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
      include: LiveClassService.recordingAccessInclude,
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
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can view recording storage metrics.");
    }
    return this.recordingStorageService.getStorageUsage();
  }

  async updateRecordingProgress(accessToken: string | undefined, classId: string, watchedSeconds: number) {
    const user = await this.getAuthenticatedUser(accessToken);

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
