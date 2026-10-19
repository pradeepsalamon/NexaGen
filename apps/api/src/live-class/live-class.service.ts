import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  ServiceUnavailableException,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { getApiEnv } from "@nexa-chess/config/api";
import { LiveSessionStatus, LiveKitTokenOptions } from "./types/live-class.types";
import {
  CLASS_START_BLOCK_MESSAGES,
  deriveLiveKitGrants,
  getClassStartAvailability,
  liveClassSettingsSchema,
  LIVE_CLASS_SETTINGS_TOPIC,
  type LiveClassSettings,
  type LiveClassSettingsMessage,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import {
  UserRole,
  ClassStatus,
  ScreenShareRequestStatus,
  WaitingRoomStatus,
} from "@prisma/client";
import { AttendanceService } from "../attendance/attendance.service";
import { LiveClassSettingsService } from "./live-class-settings.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { LiveClassAccessService } from "./live-class-access.service";
import { GameRecorderService } from "../game-library/game-recorder.service";
import { LiveClassWaitingRoomService } from "./live-class-waiting-room.service";
import { isCoachParticipant, withScreenShareSources } from "./live-class.util";
import { EntitlementService } from "../platform/entitlement.service";

/** Live-class lifecycle: start, join token, mid-class settings, heartbeat, end and the stale-class sweep. */
@Injectable()
export class LiveClassService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(LiveClassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly livekit: LiveKitService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService,
    private readonly settingsService: LiveClassSettingsService,
    private readonly analyticsEvents: AnalyticsEventService,
    private readonly access: LiveClassAccessService,
    private readonly waitingRoom: LiveClassWaitingRoomService,
    private readonly gameRecorder: GameRecorderService,
    private readonly entitlements: EntitlementService
  ) {}

  /** Sibling modules (puzzle, simul, match, move poll) reach the access checks through here. */
  resolveParticipant(accessToken: string | undefined, classId: string) {
    return this.access.resolveParticipant(accessToken, classId);
  }

  resolveClassManager(accessToken: string | undefined, classId: string, opts: { requireLive?: boolean } = {}) {
    return this.access.resolveClassManager(accessToken, classId, opts);
  }

  connectedUserIds(roomName: string): Promise<Set<string>> {
    return this.access.connectedUserIds(roomName);
  }

  async startClass(accessToken: string | undefined, classId: string) {
    const user = await this.access.authenticate(accessToken);

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

    // The start window (shared with the Start buttons): never more than
    // CLASS_EARLY_START_MINUTES ahead — ending a class started days early marked
    // a future class COMPLETED — and not after its window has passed. A class
    // already marked LIVE is a restart of the same session and stays allowed.
    if (scheduledClass.status === ClassStatus.SCHEDULED) {
      const availability = getClassStartAvailability(scheduledClass);
      if (!availability.canStart) {
        throw new BadRequestException({
          message: CLASS_START_BLOCK_MESSAGES[availability.reason],
          code: `CLASS_START_${availability.reason}`,
          opensAt: availability.opensAt ?? null
        });
      }
    }

    let liveSession = await this.prisma.liveSession.findUnique({
      where: { classId }
    });

    if (liveSession && liveSession.status === LiveSessionStatus.LIVE) {
      throw new ConflictException("Live class is already running.");
    }

    await this.entitlements.assertCanStartLiveClass(classId);

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
          startedAt: new Date(),
          coachAbsentSince: null
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
    const user = await this.access.authenticate(accessToken);

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
    const isStudent =
      user.role === UserRole.STUDENT &&
      (liveSession.batch?.students.some((s: any) => s.studentId === user.id) ||
        !!(await this.prisma.liveClassPull.findFirst({
          where: { liveSessionId: liveSession.id, studentId: user.id, status: { in: ["PENDING", "JOINED"] } },
          select: { id: true },
        })));
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
        grants = withScreenShareSources(grants);
      }
    }

    if (isStudent && effectiveSettings?.waitingRoom === "ENABLED") {
      await this.waitingRoom.gateWaitingRoom(liveSession, user);
    } else if (isStudent) {
      // Without a waiting room a DENIED row can only be a kick; no rejoin until pulled back in.
      const row = await this.prisma.liveClassWaitingParticipant.findUnique({
        where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
        select: { status: true },
      });
      if (row?.status === WaitingRoomStatus.DENIED) {
        throw new ForbiddenException({
          message: "Your coach removed you from this class.",
          code: "REMOVED_FROM_CLASS",
        });
      }
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

      if (!participants.some(p => isCoachParticipant(p.identity, liveSession.coachId))) {
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
    const user = await this.access.authenticate(accessToken);
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
      if (isCoachParticipant(participant.identity, coachId)) continue;
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
    const user = await this.access.authenticate(accessToken);
    const liveSession = await this.access.getAccessibleLiveSession(user, classId);
    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;

    await this.attendanceService.recordHeartbeat(classId, user.id, isCoach, clientId);

    return { ok: true };
  }

  async endClass(accessToken: string | undefined, classId: string) {
    const user = await this.access.authenticate(accessToken);

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

  /**
   * `endedAt` is when the class actually stopped. A manual end is "now"; the
   * stale sweep passes the moment the coach left, so a class auto-ended after
   * the absence grace period is not credited with minutes nobody taught —
   * attendance is scored against `endedAt - startedAt` and every session is
   * clamped to `endedAt`.
   */
  private async internalEndClass(
    classId: string,
    liveSessionId: string,
    roomName: string,
    endedAt: Date = new Date()
  ) {
    // Idempotent: only the run that actually flips LIVE -> ENDED does the work,
    // so a retry (or the per-minute cron racing a manual end) can't double-
    // finalize attendance or re-delete the room (AUDIT M21).
    const { count } = await this.prisma.liveSession.updateMany({
      where: { id: liveSessionId, status: LiveSessionStatus.LIVE },
      data: {
        status: LiveSessionStatus.ENDED,
        endedAt
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

    // A running activity queue ends with the class: the item the class was on
    // counts as done, and nothing can advance it any more.
    try {
      const running = await this.prisma.liveClassActivityQueue.findFirst({
        where: { liveClassId: classId, status: "LIVE" },
        select: { id: true, currentItemId: true },
      });
      if (running) {
        await this.prisma.liveClassActivityQueue.updateMany({
          where: { id: running.id, status: "LIVE" },
          data: { currentItemId: null, finishedAt: endedAt, status: "FINISHED" },
        });
        if (running.currentItemId) {
          await this.prisma.liveClassActivityQueueItem.updateMany({
            where: { id: running.currentItemId, completedAt: null },
            data: { completedAt: endedAt },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to finish the activity queue for class ${classId}`, error);
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

    // The class board's games are over with the class (Game Library).
    try {
      await this.gameRecorder.completeClassBoardGames(classId, endedAt);
    } catch (error) {
      this.logger.warn(`Failed to close Game Library board games for class ${classId}`, error);
    }

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
      await this.jobLocks.runExclusive(JOB_LOCKS.liveClassStaleSweep, () =>
        this.sweepStaleClasses()
      );
    } catch (error) {
      this.logger.error("Error in handleStaleClasses cron job", error);
    }
  }

  private async sweepStaleClasses() {
    const now = new Date();
    const graceMs = this.env.LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES * 60_000;
    const overrunMs = this.env.LIVE_CLASS_MAX_OVERRUN_MINUTES * 60_000;

    const activeSessions = await this.prisma.liveSession.findMany({
      where: { status: LiveSessionStatus.LIVE },
      include: { class: true }
    });

    for (const session of activeSessions) {
      try {
        const decision = await this.getAutoEndReason(session, now, graceMs, overrunMs);
        if (decision) {
          this.logger.log(`Automatically ending class ${session.classId}: ${decision.reason}.`);
          await this.internalEndClass(session.classId, session.id, session.roomName, decision.endedAt);
        }
      } catch (error) {
        this.logger.error(`Failed to auto-end class ${session.classId}`, error);
      }
    }
  }

  /**
   * Decides whether a LIVE session should be auto-ended, and when it actually
   * stopped; also tracks coach absence.
   */
  private async getAutoEndReason(
    session: {
      id: string;
      coachId: string;
      roomName: string;
      coachAbsentSince: Date | null;
      startedAt?: Date | null;
      class: { endsAt: Date };
    },
    now: Date,
    graceMs: number,
    overrunMs: number
  ): Promise<{ reason: string; endedAt: Date } | null> {
    // The class stopped when the coach walked out, never before it started.
    const stoppedAt = (since: Date | null) => {
      const floor = session.startedAt?.getTime() ?? 0;
      return since && since.getTime() > floor ? since : now;
    };

    const pastEnd = session.class.endsAt <= now;
    if (overrunMs > 0 && now.getTime() - session.class.endsAt.getTime() >= overrunMs) {
      return { reason: "ran past the maximum overrun", endedAt: now };
    }

    // Throws on a real LiveKit outage — never mistake that for an empty room.
    const participants = await this.livekit.listParticipants(session.roomName);
    const coachPresent = participants.some(p => isCoachParticipant(p.identity, session.coachId));

    if (coachPresent) {
      if (session.coachAbsentSince) {
        await this.prisma.liveSession.update({ where: { id: session.id }, data: { coachAbsentSince: null } });
      }
      return null;
    }

    if (pastEnd) {
      return {
        reason: "coach left after the scheduled end time",
        endedAt: stoppedAt(session.coachAbsentSince)
      };
    }

    if (!session.coachAbsentSince) {
      await this.prisma.liveSession.update({ where: { id: session.id }, data: { coachAbsentSince: now } });
      return null;
    }

    if (graceMs > 0 && now.getTime() - session.coachAbsentSince.getTime() >= graceMs) {
      return {
        reason: "coach has been out of the room past the grace period",
        endedAt: stoppedAt(session.coachAbsentSince)
      };
    }
    return null;
  }

  async getLiveClass(accessToken: string | undefined, classId: string) {
    const user = await this.access.authenticate(accessToken);
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
    const isStudent =
      user.role === UserRole.STUDENT &&
      (!!scheduledClass.batch?.students.some((s) => s.studentId === user.id) ||
        (!!scheduledClass.liveSession &&
          !!(await this.prisma.liveClassPull.findFirst({
            where: {
              liveSessionId: scheduledClass.liveSession.id,
              studentId: user.id,
              status: { in: ["PENDING", "JOINED"] },
            },
            select: { id: true },
          }))));
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
    const user = await this.access.authenticate(accessToken);
    const liveSession = await this.access.getAccessibleLiveSession(
      user,
      classId,
      "Live class not found."
    );

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    return { participants };
  }
}
