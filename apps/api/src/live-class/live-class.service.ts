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
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { LiveSessionStatus, LiveKitTokenOptions } from "./types/live-class.types";
import {
  deriveLiveKitGrants,
  liveClassSettingsSchema,
  privateChatRecipientAllowed,
  LIVE_CLASS_MODERATION_TOPIC,
  LIVE_CLASS_RECORDING_TOPIC,
  PRESENCE_ONLINE_WINDOW_MS,
  type PullRosterResponse,
  type PullRosterStudent,
  LIVE_CLASS_SCREEN_SHARE_TOPIC,
  LIVE_CLASS_SETTINGS_TOPIC,
  LIVE_CLASS_WAITING_ROOM_TOPIC,
  type DerivedLiveKitGrants,
  type GuestJoinDemoRequest,
  type GuestJoinDemoResponse,
  type LiveChatMessageResponse,
  type LiveClassSettings,
  type LiveClassSettingsMessage,
  type LiveKitTrackSource,
  type ModerateParticipantRequest,
  type ModerateParticipantResponse,
  type ModerationNotice,
  type RecordingStateNotice,
  type ResolveScreenShareRequest,
  type ResolveWaitingRoomRequest,
  type ScreenShareRequestEntry,
  type ScreenShareRequestEvent,
  type ScreenShareRequestListResponse,
  type UpdateLiveClassSettingsRequest,
  type WaitingRoomEntry,
  type WaitingRoomEvent,
  type WaitingRoomListResponse,
} from "@nexa-chess/types";
import {
  UserRole,
  UserStatus,
  ClassStatus,
  DemoRegistrationContactMethod,
  ScreenShareRequestStatus,
  WaitingRoomStatus,
} from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import { AttendanceService } from "../attendance/attendance.service";
import { BackupService } from "../backup/backup.service";
import { RecordingStorageService } from "./recording-storage.service";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { MailService } from "../mail/mail.service";
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
    private readonly settingsService: LiveClassSettingsService,
    private readonly analyticsEvents: AnalyticsEventService,
    private readonly whatsapp: WhatsAppService,
    private readonly mail: MailService
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

  private static readonly SCREEN_SHARE_SOURCES: LiveKitTrackSource[] = [
    "screen_share",
    "screen_share_audio",
  ];

  /** Widens a set of derived grants to also allow screen share, for one approved student. */
  private static withScreenShareSources(grants: DerivedLiveKitGrants): DerivedLiveKitGrants {
    return {
      ...grants,
      canPublish: true,
      canPublishSources: Array.from(
        new Set([...grants.canPublishSources, ...LiveClassService.SCREEN_SHARE_SOURCES])
      ),
    };
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

  /**
   * Public: authenticate the caller and assert they may participate in the class
   * (owning coach, enrolled student, or admin). For sibling modules that layer
   * their own in-room features on top of a live class.
   */
  async resolveParticipant(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const liveSession = await this.getAccessibleLiveSession(user, classId);
    return { user, liveSession };
  }

  /**
   * Public: authenticate the caller and assert they own the class (coach) or are
   * an admin. `requireLive` additionally asserts the session is LIVE.
   */
  async resolveClassManager(
    accessToken: string | undefined,
    classId: string,
    opts: { requireLive?: boolean } = {},
  ) {
    const user = await this.getAuthenticatedUser(accessToken);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (user.role !== UserRole.COACH && !isAdmin) {
      throw new ForbiddenException("You do not have permission to manage this class.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }
    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only manage your own classes.");
    }
    if (opts.requireLive && liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }

    return { user, liveSession };
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

    // Freeze the effective pre-class settings onto the session (§38). Once
    // written it is never recomputed from batch/system here — a later change to
    // a preset or batch default cannot disturb a class that is already running.
    // Best-effort: a resolver failure must not block starting the class.
    if (!liveSession.settingsSnapshotAt) {
      try {
        const { resolved } = await this.settingsService.resolveForClass(classId);
        liveSession = await this.prisma.liveSession.update({
          where: { id: liveSession.id },
          data: { effectiveSettings: resolved as object, settingsSnapshotAt: new Date() }
        });
      } catch (error) {
        this.logger.error(`Failed to snapshot live-class settings for ${classId}`, error as Error);
      }
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

    // Pre-class settings enforcement: derive LiveKit publish grants from the
    // frozen snapshot (§38). A class started before this feature has no
    // snapshot → `grants` stays undefined and the pre-feature grant logic runs.
    // Hoisted above the gates below so the waiting-room check can read the
    // resolved policy before minting anything.
    let effectiveSettings: LiveClassSettings | null = null;
    let grants: LiveKitTokenOptions["grants"];
    if (liveSession.effectiveSettings) {
      try {
        effectiveSettings = liveClassSettingsSchema.parse(liveSession.effectiveSettings);
        grants = deriveLiveKitGrants(
          effectiveSettings,
          isStudent ? "STUDENT" : "COACH"
        );
      } catch (error) {
        this.logger.warn(`Invalid effectiveSettings for class ${classId}; using default grants`, error as Error);
        effectiveSettings = null;
      }
    }

    // A previously-approved screen-share request must survive a reconnect —
    // `getToken` is otherwise the only place grants are computed, so without
    // this an approved student silently loses the widened grant on refresh.
    if (isStudent && grants) {
      const approvedShare = await this.prisma.liveClassScreenShareRequest.findUnique({
        where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
        select: { status: true },
      });
      if (approvedShare?.status === ScreenShareRequestStatus.APPROVED) {
        grants = LiveClassService.withScreenShareSources(grants);
      }
    }

    if (isStudent && effectiveSettings?.waitingRoom === "ENABLED") {
      await this.gateWaitingRoom(liveSession, user);
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

      let participants: Awaited<ReturnType<LiveKitService["listParticipants"]>>;
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
      isCoach: isCoach || isAdmin,
      grants
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveSession.class?.topic || liveSession.class?.title || "Live Class";

    if (isStudent) {
      await this.prisma.liveClassPull.updateMany({
        where: { liveSessionId: liveSession.id, studentId: user.id, status: "PENDING" },
        data: { status: "JOINED", resolvedAt: new Date() },
      });
    }

    // Auto-mark attendance for students when they request a token (join class)
    if (isStudent && liveSession.classId) {
      try {
        await this.attendanceService.recordJoinEvent(
          liveSession.classId,
          user.id,
          { source: "TOKEN_REQUEST", clientId }
        );
      } catch (error) {
        this.logger.warn(`Failed to record attendance for student ${user.id}`, error);
      }
      void this.analyticsEvents.record(user.id, "CLASS_JOIN", liveSession.classId);
    }

    return {
      token: livekitToken,
      roomName: liveSession.roomName,
      topic,
      // The resolved policy for this participant's UI (lock the mic button etc.).
      // Null when the class predates pre-class settings — the client then keeps
      // its permissive defaults, matching the token.
      settings: effectiveSettings
    };
  }

  /**
   * Coach/admin changes the class settings while the class is running. Persists
   * the class-layer override (with audit), refreezes `LiveSession.effectiveSettings`
   * so tokens minted from here on match, then pushes the new publish grants to
   * every student already in the room and broadcasts a `SETTINGS_UPDATE` so
   * their UI re-locks.
   */
  async updateLiveSettings(
    accessToken: string | undefined,
    classId: string,
    body: UpdateLiveClassSettingsRequest,
  ) {
    const user = await this.getAuthenticatedUser(accessToken);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (user.role !== UserRole.COACH && !isAdmin) {
      throw new ForbiddenException("You do not have permission to change class settings.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }
    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only change settings for your own classes.");
    }
    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }

    // Persist the class-layer override + audit row (reuses the settings service
    // authorization and validation).
    await this.settingsService.updateSettingsForClass(accessToken, classId, body);

    // Refreeze the snapshot so newly-minted tokens match the running room.
    const { resolved } = await this.settingsService.resolveForClass(classId);
    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: { effectiveSettings: resolved as object, settingsSnapshotAt: new Date() },
    });

    await this.applyLiveSettingsToRoom(liveSession.roomName, liveSession.coachId, resolved);

    return this.settingsService.getSettingsForClass(accessToken, classId);
  }

  /** Push refreshed grants to connected students and broadcast the new config. */
  private async applyLiveSettingsToRoom(
    roomName: string,
    coachId: string,
    resolved: LiveClassSettings,
  ) {
    let participants: Awaited<ReturnType<typeof this.livekit.listParticipants>> = [];
    try {
      participants = await this.livekit.listParticipants(roomName);
    } catch (error) {
      this.logger.error(`Failed to list participants for ${roomName} on live-settings change`, error as Error);
    }

    const studentGrants = deriveLiveKitGrants(resolved, "STUDENT");
    const allowedSources = new Set(studentGrants.canPublishSources);

    for (const participant of participants) {
      if (LiveClassService.isCoachParticipant(participant.identity, coachId)) continue;
      if (participant.identity.startsWith("guest_")) continue;
      // Role is signed into participant metadata; only real students are clamped
      // (admins join with a coach-equivalent token).
      let role: string | undefined;
      try {
        role = participant.metadata ? JSON.parse(participant.metadata).role : undefined;
      } catch {
        role = undefined;
      }
      if (role && role !== "STUDENT") continue;

      try {
        await this.livekit.updateParticipantPermissions(roomName, participant.identity, studentGrants);
        for (const track of participant.tracks ?? []) {
          if (track.muted) continue;
          const label = LiveKitService.trackSourceLabel(track.source);
          if (label && !allowedSources.has(label)) {
            await this.livekit.muteParticipantTrack(roomName, participant.identity, track.sid);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to apply live settings to ${participant.identity}`, error as Error);
      }
    }

    try {
      const message: LiveClassSettingsMessage = { type: "SETTINGS_UPDATE", settings: resolved };
      await this.livekit.broadcastData(
        roomName,
        new TextEncoder().encode(JSON.stringify(message)),
        LIVE_CLASS_SETTINGS_TOPIC,
      );
    } catch (error) {
      this.logger.warn(`Failed to broadcast live-settings update for ${roomName}`, error as Error);
    }
  }

  async heartbeat(accessToken: string | undefined, classId: string, clientId?: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const liveSession = await this.getAccessibleLiveSession(user, classId);
    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;

    await this.attendanceService.recordHeartbeat(classId, user.id, isCoach, clientId);

    return { ok: true };
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

    // No LiveKit grant to narrow — the room is being deleted below anyway.
    await this.prisma.liveClassScreenShareRequest.updateMany({
      where: { liveSessionId, status: { in: [ScreenShareRequestStatus.PENDING, ScreenShareRequestStatus.APPROVED] } },
      data: { status: ScreenShareRequestStatus.REVOKED, resolvedAt: new Date() },
    });

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

    // Resolved pre-class settings so the pre-join screen can show the policy
    // summary and lock its device toggles *before* a token is minted. Uses the
    // frozen snapshot once the class is live, else the current layer resolution.
    // Best-effort — a resolver failure must not break loading the class.
    let preClassSettings: LiveClassSettings | null = null;
    try {
      const snapshot = scheduledClass.liveSession?.effectiveSettings;
      preClassSettings = snapshot
        ? liveClassSettingsSchema.parse(snapshot)
        : (await this.settingsService.resolveForClass(classId)).resolved;
    } catch (error) {
      this.logger.warn(`Failed to resolve pre-class settings for ${classId}`, error as Error);
    }

    return { ...classWithoutBatch, preClassSettings };
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

  /**
   * Registers a visitor for a demo class — name plus a phone number or email,
   * standing in for a full account — and, if the class happens to be live
   * right now, immediately mints a guest LiveKit token too. A visitor who
   * registers before the coach starts gets back `joined: false` with the
   * scheduled time instead of an error; the join page re-submits the same
   * details once the class goes live (see `registerDemoGuest` for why that
   * retry never re-registers or re-sends the confirmation).
   */
  async joinDemoClass(
    classId: string,
    body: GuestJoinDemoRequest
  ): Promise<GuestJoinDemoResponse> {
    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { liveSession: true }
    });

    if (!coachClass || !coachClass.isDemo) {
      throw new NotFoundException("This demo class was not found.");
    }
    if (coachClass.status === ClassStatus.CANCELLED) {
      throw new NotFoundException("This demo class has been cancelled.");
    }
    if (coachClass.status === ClassStatus.COMPLETED) {
      throw new NotFoundException("This demo class has already ended.");
    }

    const liveSession = coachClass.liveSession;
    if (liveSession?.status === LiveSessionStatus.ENDED) {
      throw new NotFoundException("This demo class has already ended.");
    }

    const topic = coachClass.topic || coachClass.title || "Demo Class";
    const registration = await this.registerDemoGuest(classId, coachClass.startsAt, topic, body);

    if (liveSession?.status !== LiveSessionStatus.LIVE) {
      // Guest demo registration — no account/timezone; state the schedule in UTC.
      const formattedTime = coachClass.startsAt.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        timeZone: 'UTC', timeZoneName: 'short'
      });
      return {
        registered: true,
        joined: false,
        token: null,
        roomName: null,
        topic,
        startsAt: coachClass.startsAt.toISOString(),
        message: `You're registered! This demo class is scheduled for ${formattedTime}. Come back here once the coach starts the session.`
      };
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

    if (!registration.joinedAt) {
      await this.prisma.demoClassRegistration
        .update({ where: { id: registration.id }, data: { joinedAt: new Date() } })
        .catch(() => undefined);
    }

    return {
      registered: true,
      joined: true,
      token: livekitToken,
      roomName: liveSession.roomName,
      topic,
      startsAt: null,
      message: null
    };
  }

  /**
   * Upserts the guest's registration (one row per class per contact — see the
   * `@@unique([classId, contactMethod, contactValue])` index) and, only the
   * first time, fires a best-effort confirmation on whichever channel they
   * picked. The join page re-submits the same details while it waits for the
   * class to go live, and that retry must reuse the existing row rather than
   * re-registering or spamming a second confirmation.
   */
  private async registerDemoGuest(
    classId: string,
    startsAt: Date,
    topic: string,
    body: GuestJoinDemoRequest
  ) {
    const contactMethod: DemoRegistrationContactMethod =
      body.contactMethod === "EMAIL"
        ? DemoRegistrationContactMethod.EMAIL
        : DemoRegistrationContactMethod.PHONE;

    const contactValue =
      contactMethod === DemoRegistrationContactMethod.EMAIL
        ? (body.email as string)
        : this.whatsapp.normalizeRecipient(body.phoneNumber) ??
          (body.phoneNumber as string).replace(/\D/g, "");

    if (!contactValue) {
      throw new BadRequestException("Enter a valid phone number or email address.");
    }

    const existing = await this.prisma.demoClassRegistration.findUnique({
      where: {
        classId_contactMethod_contactValue: { classId, contactMethod, contactValue }
      }
    });
    if (existing) return existing;

    const created = await this.prisma.demoClassRegistration.create({
      data: {
        classId,
        name: body.guestName,
        contactMethod,
        contactValue,
        phoneNumber: contactMethod === DemoRegistrationContactMethod.PHONE ? body.phoneNumber : null,
        email: contactMethod === DemoRegistrationContactMethod.EMAIL ? body.email : null
      }
    });

    void this.sendDemoRegistrationConfirmation(classId, created, startsAt, topic);

    return created;
  }

  /** Best-effort — a failed confirmation never blocks registration or join. */
  private async sendDemoRegistrationConfirmation(
    classId: string,
    registration: {
      name: string;
      contactMethod: DemoRegistrationContactMethod;
      phoneNumber: string | null;
      email: string | null;
    },
    startsAt: Date,
    topic: string
  ) {
    try {
      if (registration.contactMethod === DemoRegistrationContactMethod.EMAIL && registration.email) {
        await this.mail.sendDemoClassRegistrationConfirmation({
          to: registration.email,
          guestName: registration.name,
          classTopic: topic,
          startsAt,
          joinUrl: `${getFrontendUrl(this.env)}/demo/${classId}`
        });
      } else if (registration.phoneNumber) {
        // A first-time visitor is outside WhatsApp's 24h customer-service
        // window, so this free-form text may simply not deliver — attempted
        // anyway, best effort, and never awaited by the caller's response.
        await this.whatsapp.trySendText({
          to: registration.phoneNumber,
          body: `Hi ${registration.name}, you're registered for the demo class "${topic}". We'll see you there!`
        });
      }
    } catch (error) {
      this.logger.warn(
        `Demo registration confirmation for class ${classId} failed: ${(error as Error).message}`
      );
    }
  }

  async saveChatMessage(
    accessToken: string | undefined,
    classId: string,
    message: string,
    clientMessageId?: string,
    recipientId?: string | null
  ): Promise<LiveChatMessageResponse> {
    const user = await this.getAuthenticatedUser(accessToken);

    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      throw new BadRequestException("Message cannot be empty.");
    }
    if (trimmed.length > 2000) {
      throw new BadRequestException("Message is too long (2000 characters max).");
    }

    const liveSession = await this.getAccessibleLiveSession(user, classId);

    if (recipientId) {
      await this.assertPrivateChatAllowed(user, liveSession, recipientId);
    }

    const name = [user.firstName, user.role === UserRole.COACH ? user.lastName : null]
      .filter(Boolean)
      .join(" ")
      .trim();

    const row = await this.prisma.liveChatMessage.create({
      data: {
        liveSessionId: liveSession.id,
        senderId: user.id,
        senderName: name,
        senderRole: user.role,
        message: trimmed,
        clientMessageId: clientMessageId ?? null,
        recipientId: recipientId ?? null,
      },
    });

    return LiveClassService.toChatMessage(row);
  }

  /**
   * Private chat is deliberately one-to-one **with the coach**: a student may
   * only address staff, and staff may address anyone in the class. This is the
   * write-side enforcement -- the web client hides the option and drops inbound
   * packets that break the same rule, but neither of those binds an attacker.
   */
  private async assertPrivateChatAllowed(
    user: { id: string; role: UserRole },
    liveSession: { id: string; coachId: string; batch?: { students: { studentId: string }[] } | null },
    recipientId: string
  ) {
    if (recipientId === user.id) {
      throw new BadRequestException("You cannot send a private message to yourself.");
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, role: true, status: true },
    });
    if (!recipient || recipient.status !== UserStatus.ACTIVE) {
      throw new NotFoundException("Recipient not found.");
    }

    if (!privateChatRecipientAllowed(user.role, recipient.role)) {
      throw new ForbiddenException(
        "Private messages are only allowed between a student and the coach."
      );
    }

    // The recipient must actually belong to this class, whichever side they are on.
    const inClass =
      recipient.id === liveSession.coachId ||
      recipient.role === UserRole.ADMIN ||
      recipient.role === UserRole.SUPER_ADMIN ||
      !!liveSession.batch?.students.some((s) => s.studentId === recipient.id);
    if (!inClass) {
      throw new ForbiddenException("That person is not in this class.");
    }
  }

  async getChatHistory(
    accessToken: string | undefined,
    classId: string
  ): Promise<LiveChatMessageResponse[]> {
    const user = await this.getAuthenticatedUser(accessToken);
    const liveSession = await this.getAccessibleLiveSession(user, classId);

    // Room-wide messages, plus only the private threads this user is party to --
    // filtering client-side would ship other people's DMs down the wire.
    const rows = await this.prisma.liveChatMessage.findMany({
      where: {
        liveSessionId: liveSession.id,
        OR: [
          { recipientId: null },
          { recipientId: user.id },
          { senderId: user.id, recipientId: { not: null } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 500, // Limit to last 500 messages
    });

    return rows.map(LiveClassService.toChatMessage);
  }

  private static toChatMessage(row: {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: string | null;
    recipientId: string | null;
    message: string;
    clientMessageId: string | null;
    createdAt: Date;
  }): LiveChatMessageResponse {
    return {
      id: row.id,
      senderId: row.senderId,
      senderName: row.senderName,
      senderRole: row.senderRole,
      recipientId: row.recipientId,
      message: row.message,
      clientMessageId: row.clientMessageId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private static toWaitingRoomEntry(row: {
    id: string;
    status: WaitingRoomStatus;
    requestedAt: Date;
    student: { firstName: string; lastName: string | null; avatarUrl: string | null };
    studentId: string;
  }): WaitingRoomEntry {
    return {
      id: row.id,
      studentId: row.studentId,
      studentName: `${row.student.firstName} ${row.student.lastName || ""}`.trim(),
      avatarUrl: row.student.avatarUrl,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
    };
  }

  /** Best-effort nudge to any coach/admin already connected. Never throws. */
  private async announceWaitingRoomEvent(
    roomName: string,
    type: WaitingRoomEvent["type"],
    entry: WaitingRoomEntry,
  ): Promise<void> {
    try {
      const event: WaitingRoomEvent = { type, entry };
      await this.livekit.broadcastData(
        roomName,
        new TextEncoder().encode(JSON.stringify(event)),
        LIVE_CLASS_WAITING_ROOM_TOPIC,
      );
    } catch (error) {
      this.logger.warn(`Failed to announce waiting-room event in ${roomName}`, error as Error);
    }
  }

  /**
   * Blocks a student's token request until a coach admits them. Called from
   * `getToken` only when the class's resolved settings enable the waiting
   * room. Returns normally (falls through to token minting) once the
   * student's row is ADMITTED; otherwise throws a structured, client-known
   * error the web app polls or shows a "not admitted" screen for.
   */
  private async gateWaitingRoom(
    liveSession: { id: string; roomName: string },
    user: { id: string },
  ): Promise<void> {
    // The coach explicitly pulled this student in — that is the admission.
    const pulled = await this.prisma.liveClassPull.findFirst({
      where: { liveSessionId: liveSession.id, studentId: user.id, status: { in: ["PENDING", "JOINED"] } },
      select: { id: true },
    });
    if (pulled) return;

    const existing = await this.prisma.liveClassWaitingParticipant.findUnique({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
    });

    if (existing?.status === WaitingRoomStatus.ADMITTED) {
      return;
    }

    if (existing?.status === WaitingRoomStatus.DENIED) {
      throw new ForbiddenException({
        message: "The coach has not admitted you to this class.",
        code: "JOIN_DENIED",
      });
    }

    if (!existing) {
      const created = await this.prisma.liveClassWaitingParticipant.create({
        data: { liveSessionId: liveSession.id, studentId: user.id },
        include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      });
      // Only announce on the transition into PENDING — the client silently
      // re-polls this same gate every few seconds, and re-announcing on every
      // poll would spam the coach with a fresh toast each time.
      await this.announceWaitingRoomEvent(
        liveSession.roomName,
        "JOIN_REQUESTED",
        LiveClassService.toWaitingRoomEntry(created),
      );
    }

    throw new BadRequestException({
      message: "Waiting for the coach to let you in.",
      code: "WAITING_FOR_ADMIT",
    });
  }

  /** Coach-owner/admin: students currently pending admission, oldest first. */
  // ─── Pull a student into class ───────────────────────────────

  /**
   * Coach-owner/admin: every student in the class's batch with whether they
   * have the app open (presence heartbeat), are already in the room, and any
   * pull already sent.
   */
  async getPullRoster(accessToken: string | undefined, classId: string): Promise<PullRosterResponse> {
    const { liveSession } = await this.resolveClassManager(accessToken, classId);

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      select: { batchId: true },
    });
    if (!coachClass?.batchId) return { students: [] };

    const [enrolments, pulls, inRoom] = await Promise.all([
      this.prisma.batchStudent.findMany({
        where: { batchId: coachClass.batchId, student: { status: UserStatus.ACTIVE } },
        include: {
          student: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true, lastSeenAt: true },
          },
        },
      }),
      this.prisma.liveClassPull.findMany({ where: { liveSessionId: liveSession.id } }),
      this.connectedUserIds(liveSession.roomName),
    ]);

    const pullByStudent = new Map(pulls.map((p) => [p.studentId, p]));
    const onlineSince = Date.now() - PRESENCE_ONLINE_WINDOW_MS;

    const students: PullRosterStudent[] = enrolments.map(({ student }) => {
      const pull = pullByStudent.get(student.id);
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        avatarUrl: student.avatarUrl,
        online: !!student.lastSeenAt && student.lastSeenAt.getTime() >= onlineSince,
        lastSeenAt: student.lastSeenAt?.toISOString() ?? null,
        inClass: inRoom.has(student.id),
        pull: pull ? { status: pull.status, requestedAt: pull.requestedAt.toISOString() } : null,
      };
    });

    // Who the coach is most likely to act on first: absent + online.
    students.sort(
      (a, b) =>
        Number(a.inClass) - Number(b.inClass) ||
        Number(b.online) - Number(a.online) ||
        a.name.localeCompare(b.name),
    );
    return { students };
  }

  /** Coach-owner/admin: send (or re-send) a pull to one enrolled student. */
  async pullStudent(
    accessToken: string | undefined,
    classId: string,
    studentId: string,
  ): Promise<{ status: "PENDING" }> {
    const { user, liveSession } = await this.resolveClassManager(accessToken, classId, { requireLive: true });

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      select: { batchId: true },
    });
    const enrolled = coachClass?.batchId
      ? await this.prisma.batchStudent.findFirst({
          where: { batchId: coachClass.batchId, studentId },
          select: { id: true },
        })
      : null;
    if (!enrolled) {
      throw new BadRequestException("That student is not in this class's batch.");
    }

    const now = new Date();
    await this.prisma.liveClassPull.upsert({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId } },
      update: { status: "PENDING", requestedAt: now, resolvedAt: null, requestedById: user.id },
      create: { liveSessionId: liveSession.id, studentId, requestedById: user.id },
    });
    return { status: "PENDING" };
  }

  /** Coach-owner/admin: withdraw a pull the student has not acted on yet. */
  async cancelPull(
    accessToken: string | undefined,
    classId: string,
    studentId: string,
  ): Promise<{ cancelled: boolean }> {
    const { liveSession } = await this.resolveClassManager(accessToken, classId);
    const { count } = await this.prisma.liveClassPull.updateMany({
      where: { liveSessionId: liveSession.id, studentId, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
    return { cancelled: count > 0 };
  }

  /** User ids connected to the room; empty (not an error) if LiveKit can't be asked. */
  private async connectedUserIds(roomName: string): Promise<Set<string>> {
    try {
      const participants = await this.livekit.listParticipants(roomName);
      return new Set(participants.map((p) => p.identity.split("_")[0]));
    } catch (error) {
      this.logger.warn(`Could not list participants for ${roomName}`, error as Error);
      return new Set();
    }
  }

  async getWaitingRoomList(
    accessToken: string | undefined,
    classId: string,
  ): Promise<WaitingRoomListResponse> {
    const { liveSession } = await this.resolveClassManager(accessToken, classId);

    const rows = await this.prisma.liveClassWaitingParticipant.findMany({
      where: { liveSessionId: liveSession.id, status: WaitingRoomStatus.PENDING },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { requestedAt: "asc" },
    });

    return { entries: rows.map((row) => LiveClassService.toWaitingRoomEntry(row)) };
  }

  /** Coach-owner/admin: admit or deny one pending student. */
  async resolveWaitingRoomEntry(
    accessToken: string | undefined,
    classId: string,
    body: ResolveWaitingRoomRequest,
  ): Promise<WaitingRoomEntry> {
    const { user, liveSession } = await this.resolveClassManager(accessToken, classId);

    const status = body.action === "ADMIT" ? WaitingRoomStatus.ADMITTED : WaitingRoomStatus.DENIED;
    // The `status: PENDING` filter is the idempotency guard against a
    // double-click or two coach tabs resolving the same request at once.
    const { count } = await this.prisma.liveClassWaitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, studentId: body.studentId, status: WaitingRoomStatus.PENDING },
      data: { status, resolvedAt: new Date(), resolvedById: user.id },
    });

    if (count === 0) {
      throw new NotFoundException("No pending request for that student.");
    }

    const updated = await this.prisma.liveClassWaitingParticipant.findUniqueOrThrow({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: body.studentId } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    const entry = LiveClassService.toWaitingRoomEntry(updated);
    await this.announceWaitingRoomEvent(liveSession.roomName, "REQUEST_RESOLVED", entry);
    return entry;
  }

  /** Student: (re)request admission, most commonly after a denial. */
  async requestWaitingRoomAdmission(
    accessToken: string | undefined,
    classId: string,
  ): Promise<WaitingRoomEntry> {
    const { user, liveSession } = await this.resolveParticipant(accessToken, classId);
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
    if (effectiveSettings?.waitingRoom !== "ENABLED") {
      throw new BadRequestException("This class does not use a waiting room.");
    }

    const updated = await this.prisma.liveClassWaitingParticipant.upsert({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      create: { liveSessionId: liveSession.id, studentId: user.id },
      update: { status: WaitingRoomStatus.PENDING, resolvedAt: null, resolvedById: null },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    const entry = LiveClassService.toWaitingRoomEntry(updated);
    // Explicit user click, not a silent poll — always announce.
    await this.announceWaitingRoomEvent(liveSession.roomName, "JOIN_REQUESTED", entry);
    return entry;
  }

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
      const grants = LiveClassService.withScreenShareSources(deriveLiveKitGrants(settings, "STUDENT"));
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
    const { liveSession } = await this.resolveClassManager(accessToken, classId);

    const rows = await this.prisma.liveClassScreenShareRequest.findMany({
      where: {
        liveSessionId: liveSession.id,
        status: { in: [ScreenShareRequestStatus.PENDING, ScreenShareRequestStatus.APPROVED] },
      },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { requestedAt: "asc" },
    });

    return { entries: rows.map((row) => LiveClassService.toScreenShareRequestEntry(row)) };
  }

  /** Student: ask to share their screen while the class-wide policy is DISABLED. */
  async requestScreenShare(
    accessToken: string | undefined,
    classId: string,
  ): Promise<ScreenShareRequestEntry> {
    const { user, liveSession } = await this.resolveParticipant(accessToken, classId);
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
      return LiveClassService.toScreenShareRequestEntry(existing);
    }

    const updated = await this.prisma.liveClassScreenShareRequest.upsert({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      create: { liveSessionId: liveSession.id, studentId: user.id },
      update: { status: ScreenShareRequestStatus.PENDING, resolvedAt: null, resolvedById: null },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    const entry = LiveClassService.toScreenShareRequestEntry(updated);
    await this.announceScreenShareEvent(liveSession.roomName, "REQUESTED", entry);
    return entry;
  }

  /** Coach-owner/admin: approve, deny, or revoke one student's screen-share request. */
  async resolveScreenShareRequest(
    accessToken: string | undefined,
    classId: string,
    body: ResolveScreenShareRequest,
  ): Promise<ScreenShareRequestEntry> {
    const { liveSession } = await this.resolveClassManager(accessToken, classId);

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

    const entry = LiveClassService.toScreenShareRequestEntry(updated);
    await this.announceScreenShareEvent(liveSession.roomName, "RESOLVED", entry);
    return entry;
  }

  /** Student: self-report that they stopped sharing, so the grant is narrowed back. */
  async endScreenShare(
    accessToken: string | undefined,
    classId: string,
  ): Promise<ScreenShareRequestEntry> {
    const { user, liveSession } = await this.resolveParticipant(accessToken, classId);

    const { count } = await this.prisma.liveClassScreenShareRequest.updateMany({
      where: { liveSessionId: liveSession.id, studentId: user.id, status: ScreenShareRequestStatus.APPROVED },
      data: { status: ScreenShareRequestStatus.REVOKED, resolvedAt: new Date(), resolvedById: user.id },
    });

    const updated = await this.prisma.liveClassScreenShareRequest.findUniqueOrThrow({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
    const entry = LiveClassService.toScreenShareRequestEntry(updated);

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
        LiveClassService.toScreenShareRequestEntry(updated),
      );
    }
  }

  /**
   * Switch off one participant's already-published mic, camera or screen share.
   *
   * Mute only -- there is no server-side "unmute": re-opening someone's
   * microphone without them touching it is a privacy hole, and LiveKit would
   * need the client to republish anyway. The participant turns it back on
   * themselves (unless the class policy locks that source off).
   */
  async moderateParticipant(
    accessToken: string | undefined,
    classId: string,
    body: ModerateParticipantRequest
  ): Promise<ModerateParticipantResponse> {
    const user = await this.getAuthenticatedUser(accessToken);

    if (
      user.role !== UserRole.COACH &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only a coach can turn off someone else's microphone or camera.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }
    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only moderate your own classes.");
    }
    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }
    if (LiveClassService.isCoachParticipant(body.identity, liveSession.coachId)) {
      throw new BadRequestException("Use your own controls to mute yourself.");
    }

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    const participant = participants.find((p) => p.identity === body.identity);
    if (!participant) {
      throw new NotFoundException("That participant is no longer in the class.");
    }

    let muted = false;
    for (const track of participant.tracks ?? []) {
      if (track.muted) continue;
      if (LiveKitService.trackSourceLabel(track.source) !== body.source) continue;
      await this.livekit.muteParticipantTrack(liveSession.roomName, participant.identity, track.sid);
      muted = true;
    }

    if (muted) {
      // Best-effort explanation for a track that just went dead. The mute is
      // already enforced at the SFU, so a dropped packet costs a toast only.
      try {
        const notice: ModerationNotice = {
          type: "FORCE_MUTE",
          identity: participant.identity,
          source: body.source,
          byName: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "The coach",
        };
        await this.livekit.broadcastData(
          liveSession.roomName,
          new TextEncoder().encode(JSON.stringify(notice)),
          LIVE_CLASS_MODERATION_TOPIC
        );
      } catch (error) {
        this.logger.warn(`Failed to announce force-mute in ${liveSession.roomName}`, error as Error);
      }
    }

    return { muted, identity: participant.identity, source: body.source };
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
          .broadcastData(roomName, payload, LiveClassService.BOARD_SYNC_TOPIC)
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
