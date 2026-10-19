import {
  BadRequestException,
  Injectable,
  Logger,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AttendanceStatus,
  AttendanceEventType,
  Prisma,
  UserRole,
  LiveSessionStatus,
} from "@prisma/client";
import { selectSessionToClose } from "./attendance-session.util";
import { authenticateUser } from "../auth/authenticate";
import { calculateTotalDuration, classRunSeconds, deriveAttendanceStamps, determineStatus } from "./attendance-calc.util";

/** Write side of attendance: LiveKit join/leave events, heartbeats, finalize, and the policy. */
@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService
  ) {}

  async recordJoinEvent(
    classId: string,
    userId: string,
    metadata?: { userAgent?: string; ipAddress?: string; source?: string; clientId?: string }
  ) {
    const now = new Date();

    // Upsert the ClassAttendance record. Two near-simultaneous joins (webhook +
    // token-request, or LiveKit retries) can both miss the row and race on the
    // create, throwing P2002 on the unique (classId, studentId). Retry once — by
    // then the row exists and the upsert takes the update path.
    const upsertAttendance = () =>
      this.prisma.classAttendance.upsert({
        where: { classId_studentId: { classId, studentId: userId } },
        update: {
          status: AttendanceStatus.PRESENT,
          lastActivity: now,
          updatedAt: now,
        },
        create: {
          classId,
          studentId: userId,
          status: AttendanceStatus.PRESENT,
          joinedAt: now,
          lastActivity: now,
        },
      });

    let attendance;
    try {
      attendance = await upsertAttendance();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        attendance = await upsertAttendance();
      } else {
        throw error;
      }
    }

    // Append a JOIN log
    await this.prisma.attendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId,
        eventType: AttendanceEventType.JOIN,
        timestamp: now,
        sessionStart: now,
        userAgent: metadata?.userAgent,
        ipAddress: metadata?.ipAddress,
        source: metadata?.source || "LIVEKIT",
        clientId: metadata?.clientId,
      },
    });

    this.logger.log(
      `JOIN recorded: user=${userId} class=${classId}`
    );

    return attendance;
  }

  async recordLeaveEvent(
    classId: string,
    userId: string,
    reason?: string,
    metadata?: { source?: string; clientId?: string }
  ) {
    const now = new Date();

    const attendance = await this.prisma.classAttendance.findUnique({
      where: { classId_studentId: { classId, studentId: userId } },
    });

    if (!attendance) {
      this.logger.warn(
        `LEAVE event for non-existent attendance: user=${userId} class=${classId}`
      );
      return null;
    }

    // A second concurrent tab of the same student can leave open sessions for
    // more than one clientId at once — close only the tab that actually sent
    // this event when we know which one that was (§2.8 multi-tab misfire),
    // falling back to the most recent open session otherwise.
    const openLogs = await this.prisma.attendanceLog.findMany({
      where: {
        attendanceId: attendance.id,
        eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
        sessionEnd: null,
      },
      select: { id: true, clientId: true, timestamp: true, sessionStart: true },
    });
    const closeId = selectSessionToClose(openLogs, metadata?.clientId);
    const openSession = closeId ? openLogs.find((log) => log.id === closeId) : undefined;

    const sessionDuration = openSession?.sessionStart
      ? Math.floor(
          (now.getTime() - openSession.sessionStart.getTime()) / 1000
        )
      : 0;

    // Close the open session
    if (openSession) {
      await this.prisma.attendanceLog.update({
        where: { id: openSession.id },
        data: { sessionEnd: now, sessionDuration },
      });
    }

    // Append a LEAVE log
    await this.prisma.attendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId,
        eventType: AttendanceEventType.LEAVE,
        timestamp: now,
        reason,
        source: metadata?.source || "LIVEKIT",
        clientId: metadata?.clientId,
      },
    });

    // Update the attendance record
    await this.prisma.classAttendance.update({
      where: { id: attendance.id },
      data: openSession
        ? { leftAt: now, lastActivity: now }
        : { lastActivity: now },
    });

    this.logger.log(
      `LEAVE recorded: user=${userId} class=${classId} duration=${sessionDuration}s`
    );

    return attendance;
  }

  async recordDisconnectEvent(
    classId: string,
    userId: string,
    reason?: string
  ) {
    const now = new Date();

    const attendance = await this.prisma.classAttendance.findUnique({
      where: { classId_studentId: { classId, studentId: userId } },
    });

    if (!attendance) return null;

    // Close open session. The sweep has no clientId of its own (it only fires
    // once every tab's heartbeat has gone stale, §2.8) — closes the most
    // recently opened session; a stray second one, if any, is caught by
    // `closeOpenAttendanceLogs` at finalize.
    const openLogs = await this.prisma.attendanceLog.findMany({
      where: {
        attendanceId: attendance.id,
        eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
        sessionEnd: null,
      },
      select: { id: true, clientId: true, timestamp: true, sessionStart: true },
    });
    const closeId = selectSessionToClose(openLogs, undefined);
    const openSession = closeId ? openLogs.find((log) => log.id === closeId) : undefined;

    const sessionDuration = openSession?.sessionStart
      ? Math.floor(
          (now.getTime() - openSession.sessionStart.getTime()) / 1000
        )
      : 0;

    if (openSession) {
      await this.prisma.attendanceLog.update({
        where: { id: openSession.id },
        data: { sessionEnd: now, sessionDuration },
      });
    }

    await this.prisma.attendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId,
        eventType: AttendanceEventType.DISCONNECT,
        timestamp: now,
        reason,
        source: "LIVEKIT",
      },
    });

    await this.prisma.classAttendance.update({
      where: { id: attendance.id },
      data: { lastActivity: now },
    });

    this.logger.log(
      `DISCONNECT recorded: user=${userId} class=${classId} reason=${reason}`
    );

    return attendance;
  }

  async recordReconnectEvent(classId: string, userId: string, clientId?: string) {
    const now = new Date();

    const attendance = await this.prisma.classAttendance.findUnique({
      where: { classId_studentId: { classId, studentId: userId } },
    });

    if (!attendance) return null;

    await this.prisma.attendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId,
        eventType: AttendanceEventType.RECONNECT,
        timestamp: now,
        sessionStart: now,
        source: "LIVEKIT",
        clientId,
      },
    });

    await this.prisma.classAttendance.update({
      where: { id: attendance.id },
      data: {
        reconnectCount: { increment: 1 },
        lastActivity: now,
        status: AttendanceStatus.PRESENT,
      },
    });

    this.logger.log(
      `RECONNECT recorded: user=${userId} class=${classId}`
    );

    return attendance;
  }

  /**
   * Fallback presence signal, called from POST /live-class/:id/heartbeat.
   * Webhooks stay primary; this only backstops a lost webhook via
   * `sweepStaleHeartbeats` below. `clientId` (the tab id) is accepted but not
   * persisted per-tab -- any tab's heartbeat resets the single lastHeartbeatAt
   * column, which is the deliberate nullable-column design for the multi-tab
   * case (P0 reliability Phase 1, RELIABILITY_DESIGN.md §2.8): the participant
   * is considered alive as long as any of their tabs is pinging.
   */
  async recordHeartbeat(
    classId: string,
    userId: string,
    isCoach: boolean,
    _clientId?: string
  ) {
    const now = new Date();
    if (isCoach) {
      await this.prisma.coachAttendance.updateMany({
        where: { classId, coachId: userId },
        data: { lastHeartbeatAt: now, lastActivity: now },
      });
    } else {
      await this.prisma.classAttendance.updateMany({
        where: { classId, studentId: userId },
        data: { lastHeartbeatAt: now, lastActivity: now },
      });
    }
  }

  /**
   * Backstop for a lost LiveKit disconnect webhook: a participant whose last
   * heartbeat is older than the active policy's grace period, in a still-LIVE
   * class, with no LEAVE/DISCONNECT closing their session yet, is treated as
   * disconnected. The "open JOIN/RECONNECT log" condition is what makes this
   * self-limiting -- recordDisconnectEvent/recordCoachDisconnectEvent close
   * that log's sessionEnd, so the same row cannot match again on the next
   * tick without a genuine reconnect creating a new open log first.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleStaleHeartbeats() {
    try {
      await this.jobLocks.runExclusive(JOB_LOCKS.attendanceHeartbeatSweep, () =>
        this.sweepStaleHeartbeats()
      );
    } catch (error) {
      this.logger.error("Error in handleStaleHeartbeats cron job", error);
    }
  }

  private async sweepStaleHeartbeats() {
    const policy = await this.getActivePolicy();
    const cutoff = new Date(Date.now() - policy.gracePeriodMinutes * 60_000);
    const openLogFilter = {
      eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
      sessionEnd: null,
    };

    const staleStudents = await this.prisma.classAttendance.findMany({
      where: {
        lastHeartbeatAt: { lt: cutoff },
        class: { liveSession: { status: LiveSessionStatus.LIVE } },
        logs: { some: openLogFilter },
      },
      select: { classId: true, studentId: true },
    });
    for (const row of staleStudents) {
      await this.recordDisconnectEvent(row.classId, row.studentId, "heartbeat_timeout");
    }

    const staleCoaches = await this.prisma.coachAttendance.findMany({
      where: {
        lastHeartbeatAt: { lt: cutoff },
        class: { liveSession: { status: LiveSessionStatus.LIVE } },
        logs: { some: openLogFilter },
      },
      select: { classId: true, coachId: true },
    });
    for (const row of staleCoaches) {
      await this.recordCoachDisconnectEvent(row.classId, row.coachId, "heartbeat_timeout");
    }
  }

  async recordCoachJoinEvent(
    classId: string,
    coachId: string,
    metadata?: { source?: string }
  ) {
    const now = new Date();

    const attendance = await this.prisma.coachAttendance.upsert({
      where: { classId },
      update: {
        status: AttendanceStatus.PRESENT,
        lastActivity: now,
        updatedAt: now,
      },
      create: {
        classId,
        coachId,
        status: AttendanceStatus.PRESENT,
        joinedAt: now,
        lastActivity: now,
      },
    });

    await this.prisma.coachAttendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId: coachId,
        eventType: AttendanceEventType.JOIN,
        timestamp: now,
        sessionStart: now,
        source: metadata?.source || "LIVEKIT",
      },
    });

    this.logger.log(`COACH JOIN recorded: coach=${coachId} class=${classId}`);
    return attendance;
  }

  async recordCoachReconnectEvent(classId: string, coachId: string) {
    const now = new Date();

    const attendance = await this.prisma.coachAttendance.findUnique({
      where: { classId },
    });
    if (!attendance) return null;

    await this.prisma.coachAttendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId: coachId,
        eventType: AttendanceEventType.RECONNECT,
        timestamp: now,
        sessionStart: now,
        source: "LIVEKIT",
      },
    });

    await this.prisma.coachAttendance.update({
      where: { id: attendance.id },
      data: {
        reconnectCount: { increment: 1 },
        lastActivity: now,
        status: AttendanceStatus.PRESENT,
      },
    });

    this.logger.log(`COACH RECONNECT recorded: coach=${coachId} class=${classId}`);
    return attendance;
  }

  async recordCoachLeaveEvent(
    classId: string,
    coachId: string,
    reason?: string
  ) {
    const now = new Date();

    const attendance = await this.prisma.coachAttendance.findUnique({
      where: { classId },
    });
    if (!attendance) return null;

    const openSession = await this.prisma.coachAttendanceLog.findFirst({
      where: {
        attendanceId: attendance.id,
        eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
        sessionEnd: null,
      },
      orderBy: { timestamp: "desc" },
    });

    const sessionDuration = openSession?.sessionStart
      ? Math.floor((now.getTime() - openSession.sessionStart.getTime()) / 1000)
      : 0;

    if (openSession) {
      await this.prisma.coachAttendanceLog.update({
        where: { id: openSession.id },
        data: { sessionEnd: now, sessionDuration },
      });
    }

    await this.prisma.coachAttendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId: coachId,
        eventType: AttendanceEventType.LEAVE,
        timestamp: now,
        reason,
        source: "LIVEKIT",
      },
    });

    await this.prisma.coachAttendance.update({
      where: { id: attendance.id },
      data: openSession
        ? { leftAt: now, lastActivity: now }
        : { lastActivity: now },
    });

    this.logger.log(`COACH LEAVE recorded: coach=${coachId} class=${classId}`);
    return attendance;
  }

  /** Coach counterpart of recordDisconnectEvent; see sweepStaleHeartbeats. */
  async recordCoachDisconnectEvent(classId: string, coachId: string, reason?: string) {
    const now = new Date();

    const attendance = await this.prisma.coachAttendance.findUnique({
      where: { classId },
    });
    if (!attendance) return null;

    const openSession = await this.prisma.coachAttendanceLog.findFirst({
      where: {
        attendanceId: attendance.id,
        eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
        sessionEnd: null,
      },
      orderBy: { timestamp: "desc" },
    });

    const sessionDuration = openSession?.sessionStart
      ? Math.floor((now.getTime() - openSession.sessionStart.getTime()) / 1000)
      : 0;

    if (openSession) {
      await this.prisma.coachAttendanceLog.update({
        where: { id: openSession.id },
        data: { sessionEnd: now, sessionDuration },
      });
    }

    await this.prisma.coachAttendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId: coachId,
        eventType: AttendanceEventType.DISCONNECT,
        timestamp: now,
        reason,
        source: "LIVEKIT",
      },
    });

    await this.prisma.coachAttendance.update({
      where: { id: attendance.id },
      data: { lastActivity: now },
    });

    this.logger.log(`COACH DISCONNECT recorded: coach=${coachId} class=${classId} reason=${reason}`);
    return attendance;
  }

  async recordBoardJoinEvent(classId: string, coachId: string) {
    const now = new Date();

    const attendance = await this.prisma.coachAttendance.upsert({
      where: { classId },
      update: { lastActivity: now },
      create: {
        classId,
        coachId,
        status: AttendanceStatus.PRESENT,
        joinedAt: now,
        lastActivity: now,
      },
    });

    await this.prisma.coachAttendanceLog.create({
      data: {
        attendanceId: attendance.id,
        // userId is a foreign key to users.id — the board participant is the
        // coach. The BOARD_JOIN event type is what distinguishes this log.
        userId: coachId,
        eventType: AttendanceEventType.BOARD_JOIN,
        timestamp: now,
        sessionStart: now,
        source: "LIVEKIT",
      },
    });

    this.logger.log(`BOARD JOIN recorded for class=${classId}`);
    return attendance;
  }

  async recordBoardLeaveEvent(classId: string, coachId: string) {
    const now = new Date();

    const attendance = await this.prisma.coachAttendance.findUnique({
      where: { classId },
    });
    if (!attendance) return null;

    const openBoardSession = await this.prisma.coachAttendanceLog.findFirst({
      where: {
        attendanceId: attendance.id,
        eventType: AttendanceEventType.BOARD_JOIN,
        sessionEnd: null,
      },
      orderBy: { timestamp: "desc" },
    });

    const sessionDuration = openBoardSession?.sessionStart
      ? Math.floor((now.getTime() - openBoardSession.sessionStart.getTime()) / 1000)
      : 0;

    if (openBoardSession) {
      await this.prisma.coachAttendanceLog.update({
        where: { id: openBoardSession.id },
        data: { sessionEnd: now, sessionDuration },
      });
    }

    await this.prisma.coachAttendanceLog.create({
      data: {
        attendanceId: attendance.id,
        userId: coachId,
        eventType: AttendanceEventType.BOARD_LEAVE,
        timestamp: now,
        source: "LIVEKIT",
      },
    });

    // Update the total board duration
    await this.prisma.coachAttendance.update({
      where: { id: attendance.id },
      data: {
        boardDuration: { increment: sessionDuration },
        lastActivity: now,
      },
    });

    this.logger.log(`BOARD LEAVE recorded for class=${classId} duration=${sessionDuration}s`);
    return attendance;
  }

  async finalizeClassAttendance(classId: string) {
    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true,
      },
    });

    if (!coachClass) return;

    // Score attendance against how long the class ACTUALLY ran, falling back to
    // the scheduled window. A coach ending early must not mark everyone partial.
    // (`startsAt`/`endsAt` are the immutable schedule — see AUDIT.md H2.)
    const session = coachClass.liveSession;
    const scheduledDuration = classRunSeconds(coachClass);

    // The instant the class stopped. Any session log still open when finalize
    // runs (e.g. `room_finished` beat the last `participant_left`, or a webhook
    // was dropped) is clamped to this, so finalize is re-runnable and a second
    // pass can't keep growing durations against `new Date()` (AUDIT M2, M3).
    const classEndTime = session?.endedAt ?? coachClass.endsAt ?? new Date();
    await this.closeOpenAttendanceLogs(classId, classEndTime);

    // Get active policy
    const policy = await this.getActivePolicy();

    // Get all attendance records for this class
    const attendances = await this.prisma.classAttendance.findMany({
      where: { classId },
      include: { logs: { orderBy: { timestamp: "asc" } } },
    });

    const attendedStudentIds = new Set(attendances.map((a) => a.studentId));

    // Calculate duration and percentage for each attendee
    for (const attendance of attendances) {
      const totalDuration = calculateTotalDuration(attendance.logs, classEndTime);
      const attendancePercent =
        scheduledDuration > 0
          ? Math.min(100, (totalDuration / scheduledDuration) * 100)
          : 100;

      const status = determineStatus(attendancePercent, policy);

      // A row can exist with no real presence: `getToken` opens attendance on
      // TOKEN_REQUEST, so a student who loaded the class page but never connected
      // (tab closed, connection failed, coach ended immediately) still has a row
      // with `joinedAt` set. Once scored to zero time it is indistinguishable
      // from a no-show — clear the join/leave stamps so it reads as ABSENT.
      const neverPresent = totalDuration === 0;

      // Derive the join/leave stamps from the session logs, clamped to the
      // class window. The live LEAVE/DISCONNECT webhooks that normally set
      // `leftAt` are often lost in local dev (LiveKit can't reach localhost),
      // which otherwise leaves "Left: —" next to a real duration.
      const stamps = neverPresent
        ? { joinedAt: null, leftAt: null }
        : deriveAttendanceStamps(attendance, classEndTime);

      await this.prisma.classAttendance.update({
        where: { id: attendance.id },
        data: {
          totalDuration,
          attendancePercent: Math.round(attendancePercent * 10) / 10,
          status,
          ...stamps,
        },
      });
    }

    // Mark absent students (enrolled but never joined)
    if (coachClass.batch?.students) {
      for (const batchStudent of coachClass.batch.students) {
        if (!attendedStudentIds.has(batchStudent.studentId)) {
          await this.prisma.classAttendance.upsert({
            where: {
              classId_studentId: {
                classId,
                studentId: batchStudent.studentId,
              },
            },
            update: {
              status: AttendanceStatus.ABSENT,
              totalDuration: 0,
              attendancePercent: 0,
            },
            create: {
              classId,
              studentId: batchStudent.studentId,
              // The column defaults to now(); a no-show never joined.
              joinedAt: null,
              status: AttendanceStatus.ABSENT,
              totalDuration: 0,
              attendancePercent: 0,
            },
          });
        }
      }
    }

    // Finalize coach attendance
    const coachAttendance = await this.prisma.coachAttendance.findUnique({
      where: { classId },
      include: { logs: { orderBy: { timestamp: "asc" } } },
    });

    if (coachAttendance) {
      const coachTotalDuration = calculateTotalDuration(
        coachAttendance.logs.filter(
          (l) =>
            l.eventType === AttendanceEventType.JOIN ||
            l.eventType === AttendanceEventType.RECONNECT ||
            l.eventType === AttendanceEventType.LEAVE
        ),
        classEndTime
      );

      // Board usage is its own session series (BOARD_JOIN → BOARD_LEAVE).
      // Recompute it authoritatively from the logs so a board tab still open
      // when the class ends — its BOARD_LEAVE never arrives, or lands after
      // finalize — is still counted. `closeOpenAttendanceLogs` above has
      // already stamped `sessionEnd`/`sessionDuration` on any open BOARD_JOIN.
      const boardCap = classEndTime.getTime();
      const boardDuration = coachAttendance.logs
        .filter((l) => l.eventType === AttendanceEventType.BOARD_JOIN)
        .reduce((sum, l) => {
          if (l.sessionStart) {
            const end = Math.min(l.sessionEnd?.getTime() ?? boardCap, boardCap);
            return sum + Math.max(0, Math.floor((end - l.sessionStart.getTime()) / 1000));
          }
          return l.sessionDuration ? sum + l.sessionDuration : sum;
        }, 0);

      const coachStamps =
        coachTotalDuration > 0
          ? deriveAttendanceStamps(coachAttendance, classEndTime)
          : {};

      await this.prisma.coachAttendance.update({
        where: { id: coachAttendance.id },
        data: { totalDuration: coachTotalDuration, boardDuration, ...coachStamps },
      });
    }

    // Compare-and-set so the "finalized" marker is written exactly once. The
    // post-class summary screen polls on this flag (AUDIT — see classSummary).
    await this.prisma.liveSession.updateMany({
      where: { classId, attendanceFinalizedAt: null },
      data: { attendanceFinalizedAt: new Date() },
    });

    this.logger.log(
      `Class attendance finalized: classId=${classId}, attendees=${attendances.length}`
    );
  }

  async getActivePolicy() {
    let policy = await this.prisma.attendancePolicy.findFirst({
      where: { isActive: true },
    });

    if (!policy) {
      // Create default policy
      policy = await this.prisma.attendancePolicy.create({
        data: {
          name: "Default Policy",
          isActive: true,
          presentThreshold: 90,
          lateThreshold: 70,
          partialThreshold: 30,
          gracePeriodMinutes: 5,
          minDurationMinutes: 5,
          reconnectTolerance: 3,
        },
      });
    }

    return policy;
  }

  /**
   * Authenticated read of the active policy. `getActivePolicy` is kept internal
   * because it lazily creates a row, which must never be reachable anonymously.
   */
  async getPolicy(accessToken: string | undefined) {
    await this.getAuthenticatedUser(accessToken);
    return this.getActivePolicy();
  }

  async updatePolicy(
    accessToken: string | undefined,
    data: {
      presentThreshold?: number;
      lateThreshold?: number;
      partialThreshold?: number;
      gracePeriodMinutes?: number;
      minDurationMinutes?: number;
      reconnectTolerance?: number;
    }
  ) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Admin access required.");
    }

    const policy = await this.getActivePolicy();

    // Thresholds are evaluated highest-first in determineStatus, so they must
    // stay strictly descending or statuses become unreachable.
    const presentThreshold = data.presentThreshold ?? policy.presentThreshold;
    const lateThreshold = data.lateThreshold ?? policy.lateThreshold;
    const partialThreshold = data.partialThreshold ?? policy.partialThreshold;

    if (!(presentThreshold > lateThreshold && lateThreshold > partialThreshold)) {
      throw new BadRequestException(
        "Thresholds must be descending: present > late > partial."
      );
    }

    return this.prisma.attendancePolicy.update({
      where: { id: policy.id },
      data,
    });
  }

  /**
   * Clamp every still-open session log for a class to `endTime` and fill in its
   * `sessionDuration`, so `finalizeClassAttendance` is idempotent and a late
   * `participant_left` after `room_finished` can't leave a session open
   * (AUDIT M2, M3).
   */
  private async closeOpenAttendanceLogs(classId: string, endTime: Date) {
    // `sessionStart` / `sessionEnd` are `timestamp WITHOUT time zone` columns
    // holding UTC wall-clock (the Prisma default). Bind the cutoff the same way
    // — an ISO string cast `::timestamp` keeps those exact digits — NOT as a
    // `Date`, which Prisma sends as `timestamptz`: PostgreSQL then coerces it
    // (and the bare `sessionStart` column) through the session time zone, which
    // is a no-op only when the DB runs in UTC. On a non-UTC box every close was
    // shifted by the offset, turning a 20-minute class into hours (see
    // attendance-calculations.spec).
    const cutoff = endTime.toISOString();
    await this.prisma.$executeRaw`
      UPDATE "attendance_logs" l
      SET "sessionEnd" = ${cutoff}::timestamp,
          "sessionDuration" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${cutoff}::timestamp - l."sessionStart"))))::int
      FROM "class_attendance" ca
      WHERE l."attendanceId" = ca."id"
        AND ca."classId" = ${classId}
        AND l."sessionStart" IS NOT NULL
        AND l."sessionEnd" IS NULL
    `;
    await this.prisma.$executeRaw`
      UPDATE "coach_attendance_logs" l
      SET "sessionEnd" = ${cutoff}::timestamp,
          "sessionDuration" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${cutoff}::timestamp - l."sessionStart"))))::int
      FROM "coach_attendance" ca
      WHERE l."attendanceId" = ca."id"
        AND ca."classId" = ${classId}
        AND l."sessionStart" IS NOT NULL
        AND l."sessionEnd" IS NULL
    `;
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
