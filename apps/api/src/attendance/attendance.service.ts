import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  AttendanceStatus,
  AttendanceEventType,
  Prisma,
  UserRole,
  UserStatus,
  ClassStatus,
  LiveSessionStatus,
} from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import type { ParticipantPresence } from "@nexa-chess/types";

const CLASS_DETAIL_INCLUDE = {
  coach: true,
  batch: {
    include: {
      students: { where: { isDeleted: false }, include: { student: true } },
    },
  },
  liveSession: true,
  coachAttendance: { include: { logs: { orderBy: { timestamp: "asc" } } } },
  attendances: {
    include: { student: true, logs: { orderBy: { timestamp: "asc" } } },
  },
} satisfies Prisma.CoachClassInclude;

type ClassDetailPayload = Prisma.CoachClassGetPayload<{
  include: typeof CLASS_DETAIL_INCLUDE;
}>;

@Injectable()
export class AttendanceService {
  // Postgres advisory-lock key for the heartbeat-timeout sweep (P0 reliability
  // Phase 1). Distinct from LiveClassService.STALE_CLASS_LOCK_ID (73002002).
  private static readonly HEARTBEAT_SWEEP_LOCK_ID = 73002003;

  // Presence classification for getLiveClassMonitoring (P0 reliability Phase
  // 2). A heartbeat younger than this is ONLINE; older but still inside the
  // active policy's gracePeriodMinutes is RECONNECTING; beyond that is
  // OFFLINE (sweepStaleHeartbeats will soon convert it to a real LEAVE log).
  // No AttendancePolicy field exists for the ping cadence itself, so this
  // mirrors the frontend's intended ~15s heartbeat interval (RELIABILITY_
  // DESIGN.md §4.1) rather than reading it from policy.
  private static readonly HEARTBEAT_FRESH_MS = 30_000;

  private readonly env = getApiEnv();
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  // ──────────────────────────────────────────────
  // EVENT RECORDING (called from webhook / live-class)
  // ──────────────────────────────────────────────

  async recordJoinEvent(
    classId: string,
    userId: string,
    metadata?: { userAgent?: string; ipAddress?: string; source?: string }
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
    metadata?: { source?: string }
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

    // Find the most recent JOIN/RECONNECT log without a sessionEnd
    const openSession = await this.prisma.attendanceLog.findFirst({
      where: {
        attendanceId: attendance.id,
        eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
        sessionEnd: null,
      },
      orderBy: { timestamp: "desc" },
    });

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
      },
    });

    // Update the attendance record
    await this.prisma.classAttendance.update({
      where: { id: attendance.id },
      data: { leftAt: now, lastActivity: now },
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

    // Close open session
    const openSession = await this.prisma.attendanceLog.findFirst({
      where: {
        attendanceId: attendance.id,
        eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
        sessionEnd: null,
      },
      orderBy: { timestamp: "desc" },
    });

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

  async recordReconnectEvent(classId: string, userId: string) {
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
      const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${AttendanceService.HEARTBEAT_SWEEP_LOCK_ID}) AS locked
      `;
      if (!lock?.locked) {
        return;
      }

      try {
        await this.sweepStaleHeartbeats();
      } finally {
        await this.prisma.$queryRaw`
          SELECT pg_advisory_unlock(${AttendanceService.HEARTBEAT_SWEEP_LOCK_ID})
        `;
      }
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

  // ──────────────────────────────────────────────
  // COACH & BOARD EVENT RECORDING
  // ──────────────────────────────────────────────

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
      data: { leftAt: now, lastActivity: now },
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

  // ──────────────────────────────────────────────
  // FINALIZATION (called when class ends)
  // ──────────────────────────────────────────────

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
    const effectiveDuration =
      session?.startedAt && session?.endedAt
        ? Math.floor(
            (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
          )
        : Math.floor(
            (coachClass.endsAt.getTime() - coachClass.startsAt.getTime()) / 1000
          );
    const scheduledDuration = effectiveDuration;

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
      const totalDuration = this.calculateTotalDuration(attendance.logs, classEndTime);
      const attendancePercent =
        scheduledDuration > 0
          ? Math.min(100, (totalDuration / scheduledDuration) * 100)
          : 100;

      const status = this.determineStatus(attendancePercent, policy);

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
        : this.deriveAttendanceStamps(attendance, classEndTime);

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
      const coachTotalDuration = this.calculateTotalDuration(
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
          ? this.deriveAttendanceStamps(coachAttendance, classEndTime)
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

  // ──────────────────────────────────────────────
  // QUERY METHODS
  // ──────────────────────────────────────────────

  /**
   * A coach may only read a student's data when the student is enrolled in a
   * batch that coach is assigned to, or in a batch that coach teaches classes for.
   */
  private async assertCoachTeachesStudent(coachId: string, studentId: string) {
    const enrolment = await this.prisma.batchStudent.findFirst({
      where: {
        studentId,
        isDeleted: false,
        batch: {
          isDeleted: false,
          OR: [
            { coaches: { some: { coachId, isDeleted: false } } },
            { classes: { some: { coachId } } },
          ],
        },
      },
      select: { id: true },
    });

    if (!enrolment) {
      throw new ForbiddenException("Not authorized to view this student's attendance.");
    }
  }

  async getStudentAttendance(
    accessToken: string | undefined,
    targetStudentId?: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    // Students can only view own data; admins any; coaches only their own students
    let studentId = user.id;
    if (targetStudentId) {
      if (user.role === UserRole.COACH) {
        await this.assertCoachTeachesStudent(user.id, targetStudentId);
      } else if (
        user.role !== UserRole.ADMIN &&
        user.role !== UserRole.SUPER_ADMIN
      ) {
        throw new ForbiddenException("Not authorized to view this student's attendance.");
      }
      studentId = targetStudentId;
    } else if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Student ID required for non-student users.");
    }

    // Fetch completed classes the student was enrolled in
    const completedClasses = await this.prisma.coachClass.findMany({
      where: {
        batch: {
          students: { some: { studentId, isDeleted: false } },
        },
        status: ClassStatus.COMPLETED,
      },
      include: {
        batch: true,
        coach: true,
        liveSession: true,
        attendances: {
          where: { studentId },
          include: { logs: { orderBy: { timestamp: "asc" } } },
        },
      },
      orderBy: { startsAt: "desc" },
    });

    // Calculate stats
    let attended = 0;
    let totalLearningSeconds = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let runLength = 0;
    let streakBroken = false;

    const history = completedClasses.map((cls) => {
      const att = cls.attendances[0];
      const isPresent =
        att &&
        (att.status === AttendanceStatus.PRESENT ||
          att.status === AttendanceStatus.LATE);
      const isPartial = att?.status === AttendanceStatus.PARTIAL;

      if (isPresent || isPartial) {
        attended++;
        totalLearningSeconds += att.totalDuration || 0;
      }

      // Classes are ordered desc, so `currentStreak` is the unbroken run back
      // from the newest class. `longestStreak` is the longest run *anywhere* in
      // the history, so it needs its own counter that resets on a miss —
      // reusing `currentStreak` capped it at the most recent streak (AUDIT H15).
      if (isPresent || isPartial) {
        runLength++;
        if (!streakBroken) currentStreak++;
        longestStreak = Math.max(longestStreak, runLength);
      } else {
        runLength = 0;
        streakBroken = true;
      }

      const scheduledDuration = Math.floor(
        (cls.endsAt.getTime() - cls.startsAt.getTime()) / 1000
      );
      // How long the class ACTUALLY ran, falling back to the scheduled window.
      // Attendance % is already scored against this; the history row should
      // measure "time present / class length", not "time present / schedule".
      const classActualDuration =
        cls.liveSession?.startedAt && cls.liveSession?.endedAt
          ? Math.floor(
              (cls.liveSession.endedAt.getTime() -
                cls.liveSession.startedAt.getTime()) /
                1000
            )
          : scheduledDuration;

      return {
        id: cls.id,
        topic: cls.topic || "Untitled Class",
        batchName: cls.batch?.name || "Demo Class",
        coachName: `${cls.coach.firstName} ${cls.coach.lastName || ""}`.trim(),
        date: cls.startsAt.toISOString(),
        actualStart: cls.liveSession?.startedAt?.toISOString() || null,
        actualEnd: cls.liveSession?.endedAt?.toISOString() || null,
        status: att?.status || "ABSENT",
        joinedAt: att?.joinedAt?.toISOString() || null,
        leftAt: att?.leftAt?.toISOString() || null,
        scheduledDuration,
        classActualDuration,
        actualDuration: att?.totalDuration || 0,
        attendancePercent: att?.attendancePercent ?? 0,
        reconnectCount: att?.reconnectCount || 0,
        logCount: att?.logs?.length || 0,
      };
    });

    const total = completedClasses.length;
    const missed = total - attended;
    const percentage =
      total > 0 ? Math.round((attended / total) * 100) : 100;
    const totalLearningHours =
      Math.round((totalLearningSeconds / 3600) * 10) / 10;

    // Monthly & weekly stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const monthClasses = completedClasses.filter(
      (c) => c.startsAt >= monthStart
    );
    const weekClasses = completedClasses.filter(
      (c) => c.startsAt >= weekStart
    );

    const monthAttended = monthClasses.filter((c) => {
      const att = c.attendances[0];
      return (
        att &&
        (att.status === AttendanceStatus.PRESENT ||
          att.status === AttendanceStatus.LATE ||
          att.status === AttendanceStatus.PARTIAL)
      );
    }).length;

    const weekAttended = weekClasses.filter((c) => {
      const att = c.attendances[0];
      return (
        att &&
        (att.status === AttendanceStatus.PRESENT ||
          att.status === AttendanceStatus.LATE ||
          att.status === AttendanceStatus.PARTIAL)
      );
    }).length;

    const monthPercent =
      monthClasses.length > 0
        ? Math.round((monthAttended / monthClasses.length) * 100)
        : 100;
    const weekPercent =
      weekClasses.length > 0
        ? Math.round((weekAttended / weekClasses.length) * 100)
        : 100;

    return {
      stats: {
        total,
        attended,
        missed,
        percentage,
        totalLearningHours,
        currentStreak,
        longestStreak,
        monthlyPercent: monthPercent,
        weeklyPercent: weekPercent,
      },
      history,
    };
  }

  async getAttendanceLogs(
    accessToken: string | undefined,
    classId: string,
    studentId: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    // Authorization: student can view own only
    if (
      user.role === UserRole.STUDENT &&
      user.id !== studentId
    ) {
      throw new ForbiddenException("Not authorized to view this student's logs.");
    }

    const attendance = await this.prisma.classAttendance.findUnique({
      where: { classId_studentId: { classId, studentId } },
      include: {
        logs: { orderBy: { timestamp: "asc" } },
        class: true,
      },
    });

    if (!attendance) {
      throw new NotFoundException("Attendance record not found.");
    }

    // Coaches may only read logs for classes they teach
    if (
      user.role === UserRole.COACH &&
      attendance.class.coachId !== user.id
    ) {
      throw new ForbiddenException("Not authorized to view this student's logs.");
    }

    // Calculate interruption stats
    const disconnects = attendance.logs.filter(
      (l) => l.eventType === AttendanceEventType.DISCONNECT
    );
    const totalInterruptions = disconnects.length;
    let longestInterruption = 0;
    let totalDowntime = 0;

    for (const disconnect of disconnects) {
      const reconnect = attendance.logs.find(
        (l) =>
          l.eventType === AttendanceEventType.RECONNECT &&
          l.timestamp > disconnect.timestamp
      );
      if (reconnect) {
        const gap = Math.floor(
          (reconnect.timestamp.getTime() - disconnect.timestamp.getTime()) /
            1000
        );
        totalDowntime += gap;
        longestInterruption = Math.max(longestInterruption, gap);
      }
    }

    return {
      classId,
      studentId,
      status: attendance.status,
      totalDuration: attendance.totalDuration,
      attendancePercent: attendance.attendancePercent,
      reconnectCount: attendance.reconnectCount,
      joinedAt: attendance.joinedAt?.toISOString() || null,
      leftAt: attendance.leftAt?.toISOString() || null,
      scheduledDuration: attendance.class
        ? Math.floor(
            (attendance.class.endsAt.getTime() -
              attendance.class.startsAt.getTime()) /
              1000
          )
        : 0,
      totalInterruptions,
      longestInterruption,
      totalDowntime,
      logs: attendance.logs.map((log) => ({
        id: log.id,
        eventType: log.eventType,
        timestamp: log.timestamp.toISOString(),
        sessionStart: log.sessionStart?.toISOString() || null,
        sessionEnd: log.sessionEnd?.toISOString() || null,
        sessionDuration: log.sessionDuration,
        reason: log.reason,
        source: log.source,
      })),
    };
  }

  async getClassAttendanceReport(
    accessToken: string | undefined,
    classId: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        coach: true,
        batch: { include: { students: { where: { isDeleted: false }, include: { student: true } } } },
        liveSession: true,
        attendances: {
          include: {
            student: true,
            logs: { orderBy: { timestamp: "asc" } },
          },
        },
      },
    });

    if (!coachClass) {
      throw new NotFoundException("Class not found.");
    }

    // Verify access
    const isCoach =
      user.role === UserRole.COACH && coachClass.coachId === user.id;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isAdmin) {
      throw new ForbiddenException("Not authorized to view this class report.");
    }

    const scheduledDuration = Math.floor(
      (coachClass.endsAt.getTime() - coachClass.startsAt.getTime()) / 1000
    );

    const totalStudents = coachClass.batch?.students?.length || 0;
    const attendanceMap = new Map(
      coachClass.attendances.map((a) => [a.studentId, a])
    );

    const { presentCount, lateCount, partialCount, absentCount, overallPercent } =
      this.tallyAttendance(coachClass.attendances, totalStudents);

    const students = (coachClass.batch?.students || []).map((bs) => {
      const att = attendanceMap.get(bs.studentId);
      return {
        id: bs.studentId,
        name: `${bs.student.firstName} ${bs.student.lastName || ""}`.trim(),
        status: att?.status || "ABSENT",
        joinedAt: att?.joinedAt?.toISOString() || null,
        leftAt: att?.leftAt?.toISOString() || null,
        duration: att?.totalDuration || 0,
        attendancePercent: att?.attendancePercent ?? 0,
        reconnectCount: att?.reconnectCount || 0,
        logCount: att?.logs?.length || 0,
      };
    });

    return {
      classId: coachClass.id,
      topic: coachClass.topic || "Untitled Class",
      batchName: coachClass.batch?.name || "Demo Class",
      coachName: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
      scheduledStart: coachClass.startsAt.toISOString(),
      scheduledEnd: coachClass.endsAt.toISOString(),
      actualStart: coachClass.liveSession?.startedAt?.toISOString() || null,
      actualEnd: coachClass.liveSession?.endedAt?.toISOString() || null,
      scheduledDuration,
      status: coachClass.status,
      totalStudents,
      presentCount,
      absentCount,
      lateCount,
      partialCount,
      overallPercent,
      students,
    };
  }

  async getCompletedClasses(
    accessToken: string | undefined,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      coachId?: string;
      batchId?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Admin access required.");
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      status: { in: [ClassStatus.COMPLETED, ClassStatus.CANCELLED] },
    };

    const dateFrom = this.parseDateFilter(filters.dateFrom, "dateFrom");
    const dateTo = this.parseDateFilter(filters.dateTo, "dateTo");
    if (dateFrom || dateTo) {
      where.startsAt = {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateTo && { lte: dateTo }),
      };
    }
    if (filters.coachId) where.coachId = filters.coachId;
    if (filters.batchId) where.batchId = filters.batchId;

    const [classes, total] = await Promise.all([
      this.prisma.coachClass.findMany({
        where,
        include: {
          coach: true,
          batch: { include: { students: { where: { isDeleted: false } } } },
          liveSession: true,
          coachAttendance: true,
          attendances: {
            where: { status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] } },
          },
        },
        orderBy: { startsAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.coachClass.count({ where }),
    ]);

    const items = classes.map((cls) => {
      const scheduledDuration = Math.floor(
        (cls.endsAt.getTime() - cls.startsAt.getTime()) / 1000
      );
      const totalStudents = cls.batch?.students?.length || 0;

      return {
        id: cls.id,
        topic: cls.topic || "Untitled Class",
        batchName: cls.batch?.name || "Demo Class",
        coachName: `${cls.coach.firstName} ${cls.coach.lastName || ""}`.trim(),
        coachId: cls.coachId,
        date: cls.startsAt.toISOString(),
        scheduledStart: cls.startsAt.toISOString(),
        scheduledEnd: cls.endsAt.toISOString(),
        actualStart: cls.liveSession?.startedAt?.toISOString() || null,
        actualEnd: cls.liveSession?.endedAt?.toISOString() || null,
        scheduledDuration,
        actualDuration:
          cls.liveSession?.startedAt && cls.liveSession?.endedAt
            ? Math.floor(
                (cls.liveSession.endedAt.getTime() -
                  cls.liveSession.startedAt.getTime()) /
                  1000
              )
            : 0,
        status: cls.status,
        totalStudents,
        studentsAttended: cls.attendances.length,
        coachTeachingDuration: cls.coachAttendance?.totalDuration || 0,
        coachBoardDuration: cls.coachAttendance?.boardDuration || 0,
        attendancePercent:
          totalStudents > 0
            ? Math.round((cls.attendances.length / totalStudents) * 100)
            : 0,
      };
    });

    return {
      classes: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAdminCoachTeachingReport(
    accessToken: string | undefined,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      coachId?: string;
    }
  ) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Admin access required.");
    }

    const coachWhere: any = {
      role: UserRole.COACH,
      status: UserStatus.ACTIVE,
      isDeleted: false,
    };
    if (filters.coachId) coachWhere.id = filters.coachId;

    const coaches = await this.prisma.user.findMany({
      where: coachWhere,
      include: { coachProfile: true },
    });
    const coachIds = coaches.map((c) => c.id);

    const reportDateFrom = this.parseDateFilter(filters.dateFrom, "dateFrom");
    const reportDateTo = this.parseDateFilter(filters.dateTo, "dateTo");
    const dateFilter =
      reportDateFrom || reportDateTo
        ? {
            startsAt: {
              ...(reportDateFrom && { gte: reportDateFrom }),
              ...(reportDateTo && { lte: reportDateTo }),
            },
          }
        : {};

    // Two aggregate queries for all coaches instead of 3 per coach (AUDIT M6).
    const [classCounts, coachAttendances] = await Promise.all([
      this.prisma.coachClass.groupBy({
        by: ["coachId", "status"],
        where: { coachId: { in: coachIds }, ...dateFilter },
        _count: { _all: true },
      }),
      this.prisma.coachAttendance.findMany({
        where: {
          coachId: { in: coachIds },
          class: { status: ClassStatus.COMPLETED, ...dateFilter },
        },
        include: { class: { select: { startsAt: true, endsAt: true } } },
      }),
    ]);

    const totalByCoach = new Map<string, number>();
    const cancelledByCoach = new Map<string, number>();
    for (const row of classCounts) {
      const n = row._count._all;
      totalByCoach.set(row.coachId, (totalByCoach.get(row.coachId) ?? 0) + n);
      if (row.status === ClassStatus.CANCELLED) {
        cancelledByCoach.set(row.coachId, (cancelledByCoach.get(row.coachId) ?? 0) + n);
      }
    }

    const attendanceByCoach = new Map<
      string,
      { scheduledSeconds: number; actualSeconds: number; count: number }
    >();
    for (const ca of coachAttendances) {
      const agg =
        attendanceByCoach.get(ca.coachId) ?? {
          scheduledSeconds: 0,
          actualSeconds: 0,
          count: 0,
        };
      agg.scheduledSeconds += Math.floor(
        (ca.class.endsAt.getTime() - ca.class.startsAt.getTime()) / 1000
      );
      agg.actualSeconds += ca.totalDuration || 0;
      agg.count += 1;
      attendanceByCoach.set(ca.coachId, agg);
    }

    const coachReports = coaches.map((coach) => {
      const totalClasses = totalByCoach.get(coach.id) ?? 0;
      const cancelledClasses = cancelledByCoach.get(coach.id) ?? 0;
      const agg =
        attendanceByCoach.get(coach.id) ?? {
          scheduledSeconds: 0,
          actualSeconds: 0,
          count: 0,
        };
      const completedClasses = agg.count;

      return {
        coachId: coach.id,
        coachName: `${coach.firstName} ${coach.lastName || ""}`.trim(),
        email: coach.email,
        totalClasses,
        completedClasses,
        cancelledClasses,
        totalScheduledHours: Math.round((agg.scheduledSeconds / 3600) * 10) / 10,
        totalActualHours: Math.round((agg.actualSeconds / 3600) * 10) / 10,
        avgDurationMinutes:
          completedClasses > 0
            ? Math.round(agg.actualSeconds / completedClasses / 60)
            : 0,
        completionPercent:
          totalClasses > 0
            ? Math.round((completedClasses / totalClasses) * 100)
            : 0,
      };
    });

    return { coaches: coachReports };
  }

  async getClassDetailReport(
    accessToken: string | undefined,
    classId: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: CLASS_DETAIL_INCLUDE,
    });

    if (!coachClass) throw new NotFoundException("Class not found.");

    const isCoach =
      user.role === UserRole.COACH && coachClass.coachId === user.id;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (!isCoach && !isAdmin) {
      throw new ForbiddenException("Not authorized to view this class report.");
    }

    return this.assembleClassDetailReport(coachClass);
  }

  private assembleClassDetailReport(coachClass: ClassDetailPayload) {
    const scheduledDuration = Math.floor(
      (coachClass.endsAt.getTime() - coachClass.startsAt.getTime()) / 1000
    );

    const totalStudents = coachClass.batch?.students?.length || 0;
    const attendanceMap = new Map(
      coachClass.attendances.map((a) => [a.studentId, a])
    );

    const { presentCount, lateCount, partialCount, absentCount, overallPercent } =
      this.tallyAttendance(coachClass.attendances, totalStudents);

    const students = (coachClass.batch?.students || []).map((bs) => {
      const att = attendanceMap.get(bs.studentId);
      return {
        id: bs.studentId,
        name: `${bs.student.firstName} ${bs.student.lastName || ""}`.trim(),
        email: bs.student.email,
        status: att?.status || "ABSENT",
        joinedAt: att?.joinedAt?.toISOString() || null,
        leftAt: att?.leftAt?.toISOString() || null,
        duration: att?.totalDuration || 0,
        attendancePercent: att?.attendancePercent ?? 0,
        reconnectCount: att?.reconnectCount || 0,
        logCount: att?.logs?.length || 0,
        logs: (att?.logs || []).map((log) => ({
          id: log.id,
          eventType: log.eventType,
          timestamp: log.timestamp.toISOString(),
          sessionStart: log.sessionStart?.toISOString() || null,
          sessionEnd: log.sessionEnd?.toISOString() || null,
          sessionDuration: log.sessionDuration,
          reason: log.reason,
          source: log.source,
        })),
      };
    });

    const coachAttendance = coachClass.coachAttendance
      ? {
          coachName: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
          joinedAt: coachClass.coachAttendance.joinedAt?.toISOString() || null,
          leftAt: coachClass.coachAttendance.leftAt?.toISOString() || null,
          totalDuration: coachClass.coachAttendance.totalDuration,
          boardDuration: coachClass.coachAttendance.boardDuration,
          reconnectCount: coachClass.coachAttendance.reconnectCount,
          logs: coachClass.coachAttendance.logs.map((log) => ({
            id: log.id,
            eventType: log.eventType,
            timestamp: log.timestamp.toISOString(),
            sessionStart: log.sessionStart?.toISOString() || null,
            sessionEnd: log.sessionEnd?.toISOString() || null,
            sessionDuration: log.sessionDuration,
            reason: log.reason,
            source: log.source,
          })),
        }
      : null;

    const actualDuration =
      coachClass.liveSession?.startedAt && coachClass.liveSession?.endedAt
        ? Math.floor(
            (coachClass.liveSession.endedAt.getTime() -
              coachClass.liveSession.startedAt.getTime()) /
              1000
          )
        : 0;

    return {
      classId: coachClass.id,
      topic: coachClass.topic || "Untitled Class",
      batchName: coachClass.batch?.name || "Demo Class",
      coachName: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
      scheduledStart: coachClass.startsAt.toISOString(),
      scheduledEnd: coachClass.endsAt.toISOString(),
      actualStart: coachClass.liveSession?.startedAt?.toISOString() || null,
      actualEnd: coachClass.liveSession?.endedAt?.toISOString() || null,
      scheduledDuration,
      actualDuration,
      status: coachClass.status,
      totalStudents,
      presentCount,
      absentCount,
      lateCount,
      partialCount,
      overallPercent,
      coachAttendance,
      students,
    };
  }

  /**
   * Post-class summary for the room's "class ended" screen. Coaches/admins get
   * the full class report; students get their own attendance row. `finalized`
   * is false while attendance is still being scored — the client polls on it.
   */
  async getClassSummary(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    let coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: CLASS_DETAIL_INCLUDE,
    });
    if (!coachClass) throw new NotFoundException("Class not found.");

    const isCoach =
      user.role === UserRole.COACH && coachClass.coachId === user.id;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    const isStudent =
      user.role === UserRole.STUDENT &&
      (coachClass.batch?.students.some((s) => s.studentId === user.id) ?? false);
    if (!isCoach && !isAdmin && !isStudent) {
      throw new ForbiddenException("You do not have access to this class.");
    }

    // Self-heal a dropped/failed finalize: re-run the idempotent finalize once
    // the class has ended but the marker is still unset.
    const hasEnded =
      coachClass.status === ClassStatus.COMPLETED ||
      coachClass.liveSession?.status === "ENDED";
    if (hasEnded && !coachClass.liveSession?.attendanceFinalizedAt) {
      try {
        await this.finalizeClassAttendance(classId);
        coachClass = await this.prisma.coachClass.findUnique({
          where: { id: classId },
          include: CLASS_DETAIL_INCLUDE,
        });
      } catch (error) {
        this.logger.warn(
          `Lazy finalize failed for class ${classId}`,
          error as Error
        );
      }
    }
    if (!coachClass) throw new NotFoundException("Class not found.");

    // "Pending" only while an ended class has no finalize marker yet; a class
    // that never ran (SCHEDULED / CANCELLED / still LIVE) has nothing to wait on.
    const stillEnded =
      coachClass.status === ClassStatus.COMPLETED ||
      coachClass.liveSession?.status === "ENDED";
    const finalized =
      !!coachClass.liveSession?.attendanceFinalizedAt || !stillEnded;

    const actualDuration =
      coachClass.liveSession?.startedAt && coachClass.liveSession?.endedAt
        ? Math.floor(
            (coachClass.liveSession.endedAt.getTime() -
              coachClass.liveSession.startedAt.getTime()) /
              1000
          )
        : 0;

    let myAttendance: {
      status: AttendanceStatus;
      attendancePercent: number;
      totalDuration: number;
      joinedAt: string | null;
      leftAt: string | null;
      reconnectCount: number;
    } | null = null;
    if (isStudent) {
      const att = coachClass.attendances.find((a) => a.studentId === user.id);
      myAttendance = {
        status: att?.status ?? AttendanceStatus.ABSENT,
        attendancePercent: att?.attendancePercent ?? 0,
        totalDuration: att?.totalDuration ?? 0,
        joinedAt: att?.joinedAt?.toISOString() ?? null,
        leftAt: att?.leftAt?.toISOString() ?? null,
        reconnectCount: att?.reconnectCount ?? 0,
      };
    }

    return {
      classId: coachClass.id,
      topic: coachClass.topic || "Untitled Class",
      batchName: coachClass.batch?.name || "Demo Class",
      coachName: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
      scheduledStart: coachClass.startsAt.toISOString(),
      scheduledEnd: coachClass.endsAt.toISOString(),
      actualStart: coachClass.liveSession?.startedAt?.toISOString() || null,
      actualEnd: coachClass.liveSession?.endedAt?.toISOString() || null,
      actualDuration,
      status: coachClass.status,
      finalized,
      viewerRole: (isStudent ? "STUDENT" : isCoach ? "COACH" : "ADMIN") as
        | "COACH"
        | "ADMIN"
        | "STUDENT",
      report: isCoach || isAdmin ? this.assembleClassDetailReport(coachClass) : null,
      myAttendance,
    };
  }

  async getCoachTeachingStats(
    accessToken: string | undefined,
    targetCoachId?: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    let coachId = user.id;
    if (targetCoachId) {
      if (
        user.role !== UserRole.ADMIN &&
        user.role !== UserRole.SUPER_ADMIN
      ) {
        throw new ForbiddenException("Not authorized to view this coach's stats.");
      }
      coachId = targetCoachId;
    } else if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Coach ID required for non-coach users.");
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalClasses,
      completedClasses,
      cancelledClasses,
      monthlyClasses,
    ] = await Promise.all([
      this.prisma.coachClass.count({ where: { coachId } }),
      this.prisma.coachClass.count({
        where: { coachId, status: ClassStatus.COMPLETED },
      }),
      this.prisma.coachClass.count({
        where: { coachId, status: ClassStatus.CANCELLED },
      }),
      this.prisma.coachClass.count({
        where: {
          coachId,
          status: ClassStatus.COMPLETED,
          startsAt: { gte: monthStart },
        },
      }),
    ]);

    let totalTeachingSeconds = 0;
    let lateStarts = 0;
    let earlyExits = 0;

    // Use coach attendance records for accurate teaching hours
    const coachAttendances = await this.prisma.coachAttendance.findMany({
      where: { coachId, class: { status: ClassStatus.COMPLETED } },
      include: { class: { select: { startsAt: true, endsAt: true } } },
    });

    for (const ca of coachAttendances) {
      if (ca.totalDuration) {
        totalTeachingSeconds += ca.totalDuration;
      }

      // Late start: joined more than 5 minutes after scheduled
      if (ca.joinedAt && ca.class?.startsAt) {
        const lateBy =
          (ca.joinedAt.getTime() - ca.class.startsAt.getTime()) / 60000;
        if (lateBy > 5) lateStarts++;
      }

      // Early exit: left more than 5 minutes before the scheduled end
      if (ca.leftAt && ca.class?.endsAt) {
        const earlyBy =
          (ca.class.endsAt.getTime() - ca.leftAt.getTime()) / 60000;
        if (earlyBy > 5) earlyExits++;
      }
    }

    const totalTeachingHours =
      Math.round((totalTeachingSeconds / 3600) * 10) / 10;
    const avgSessionMinutes =
      coachAttendances.length > 0
        ? Math.round(totalTeachingSeconds / coachAttendances.length / 60)
        : 0;

    // Recent class history
    const recentClasses = await this.prisma.coachClass.findMany({
      where: { coachId, status: ClassStatus.COMPLETED },
      include: {
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true,
        attendances: { where: { status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] } } },
        coachAttendance: { include: { logs: { orderBy: { timestamp: "asc" } } } },
      },
      orderBy: { startsAt: "desc" },
      take: 50,
    });

    const history = recentClasses.map((cls) => {
      const teachDuration =
        cls.liveSession?.startedAt && cls.liveSession?.endedAt
          ? Math.floor(
              (cls.liveSession.endedAt.getTime() -
                cls.liveSession.startedAt.getTime()) /
                1000
            )
          : 0;

      return {
        id: cls.id,
        topic: cls.topic || "Untitled Class",
        batchName: cls.batch?.name || "Demo Class",
        date: cls.startsAt.toISOString(),
        scheduledStart: cls.startsAt.toISOString(),
        scheduledEnd: cls.endsAt.toISOString(),
        actualStart: cls.liveSession?.startedAt?.toISOString() || null,
        actualEnd: cls.liveSession?.endedAt?.toISOString() || null,
        teachingDuration: teachDuration,
        coachTotalDuration: cls.coachAttendance?.totalDuration || 0,
        boardDuration: cls.coachAttendance?.boardDuration || 0,
        reconnectCount: cls.coachAttendance?.reconnectCount || 0,
        logs: (cls.coachAttendance?.logs || []).map((log) => ({
          id: log.id,
          eventType: log.eventType,
          timestamp: log.timestamp.toISOString(),
          sessionStart: log.sessionStart?.toISOString() || null,
          sessionEnd: log.sessionEnd?.toISOString() || null,
          sessionDuration: log.sessionDuration,
          reason: log.reason,
          source: log.source,
        })),
        studentsPresent: cls.attendances.length,
        totalStudents: cls.batch?.students?.length || 0,
        attendancePercent:
          (cls.batch?.students?.length || 0) > 0
            ? Math.round(
                (cls.attendances.length /
                  (cls.batch?.students?.length || 1)) *
                  100
              )
            : 0,
      };
    });

    return {
      stats: {
        totalClasses,
        completedClasses,
        cancelledClasses,
        totalTeachingHours,
        avgSessionMinutes,
        lateStarts,
        earlyExits,
        monthlyClasses,
      },
      history,
    };
  }

  async getAdminDashboard(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Admin access required.");
    }

    const now = new Date();
    // Real calendar day in the admin's timezone, not a rolling window (M7).
    const { start: todayStart, end: todayEnd } = zonedDayBounds(user.timezone);

    const [
      todayClasses,
      liveClasses,
      todayAttendances,
      totalStudents,
      totalCoaches,
      completedClasses,
      allAttendances,
    ] = await Promise.all([
      this.prisma.coachClass.count({
        where: { startsAt: { gte: todayStart, lte: todayEnd } },
      }),
      this.prisma.liveSession.count({ where: { status: "LIVE" } }),
      this.prisma.classAttendance.findMany({
        where: {
          class: { startsAt: { gte: todayStart, lte: todayEnd } },
        },
      }),
      this.prisma.user.count({
        where: { role: UserRole.STUDENT, status: UserStatus.ACTIVE, isDeleted: false },
      }),
      this.prisma.user.count({
        where: { role: UserRole.COACH, status: UserStatus.ACTIVE, isDeleted: false },
      }),
      this.prisma.coachClass.count({
        where: { status: ClassStatus.COMPLETED },
      }),
      this.prisma.classAttendance.count({
        where: {
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
        },
      }),
    ]);

    const todayPresent = todayAttendances.filter(
      (a) =>
        a.status === AttendanceStatus.PRESENT ||
        a.status === AttendanceStatus.LATE
    ).length;
    const todayAbsent = todayAttendances.filter(
      (a) => a.status === AttendanceStatus.ABSENT
    ).length;

    // Monthly trend (last 6 months). Two range queries + in-memory bucketing
    // instead of 18 sequential COUNTs (AUDIT M5).
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

    const [trendClasses, trendAttendances] = await Promise.all([
      this.prisma.coachClass.findMany({
        where: { status: ClassStatus.COMPLETED, startsAt: { gte: trendStart } },
        select: { startsAt: true },
      }),
      this.prisma.classAttendance.findMany({
        where: { class: { startsAt: { gte: trendStart } } },
        select: { status: true, class: { select: { startsAt: true } } },
      }),
    ]);

    const classesByMonth = new Map<string, number>();
    for (const c of trendClasses) {
      classesByMonth.set(monthKey(c.startsAt), (classesByMonth.get(monthKey(c.startsAt)) ?? 0) + 1);
    }
    const attendedByMonth = new Map<string, number>();
    const totalByMonth = new Map<string, number>();
    for (const a of trendAttendances) {
      const key = monthKey(a.class.startsAt);
      totalByMonth.set(key, (totalByMonth.get(key) ?? 0) + 1);
      if (a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.LATE) {
        attendedByMonth.set(key, (attendedByMonth.get(key) ?? 0) + 1);
      }
    }

    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(monthDate);
      const monthAttended = attendedByMonth.get(key) ?? 0;
      const monthTotal = totalByMonth.get(key) ?? 0;

      monthlyTrend.push({
        month: monthDate.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }),
        classes: classesByMonth.get(key) ?? 0,
        attended: monthAttended,
        total: monthTotal,
        percent: monthTotal > 0 ? Math.round((monthAttended / monthTotal) * 100) : 0,
      });
    }

    return {
      today: {
        totalClasses: todayClasses,
        liveClasses,
        studentsPresent: todayPresent,
        studentsAbsent: todayAbsent,
        totalStudents,
        totalCoaches,
      },
      overall: {
        completedClasses,
        totalAttendanceRecords: allAttendances,
      },
      monthlyTrend,
    };
  }

  async getLiveClassMonitoring(
    accessToken: string | undefined,
    classId: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        liveSession: true,
        batch: {
          include: {
            students: {
              where: { isDeleted: false },
              include: { student: true },
            },
          },
        },
        attendances: {
          include: {
            student: true,
            logs: { orderBy: { timestamp: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!coachClass) {
      throw new NotFoundException("Class not found.");
    }

    const isCoach =
      user.role === UserRole.COACH && coachClass.coachId === user.id;
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isAdmin) {
      throw new ForbiddenException("Not authorized.");
    }

    const enrolledStudents = coachClass.batch?.students || [];
    const attendanceMap = new Map(
      coachClass.attendances.map((a) => [a.studentId, a])
    );

    const policy = await this.getActivePolicy();
    const graceMs = policy.gracePeriodMinutes * 60_000;
    const now = Date.now();

    const students = enrolledStudents.map((bs) => {
      const att = attendanceMap.get(bs.studentId);
      const lastLog = att?.logs?.[0];
      const isOnline =
        lastLog &&
        (lastLog.eventType === AttendanceEventType.JOIN ||
          lastLog.eventType === AttendanceEventType.RECONNECT);

      // presence refines isOnline using lastHeartbeatAt when it's been
      // populated (RELIABILITY_DESIGN.md §3.2/§4.2). A class/session with no
      // heartbeat data yet (predates Phase 1, or the frontend hasn't started
      // pinging) falls back to the webhook-only ONLINE/LEFT/OFFLINE split.
      let presence: ParticipantPresence;
      if (!isOnline) {
        presence = lastLog ? "LEFT" : "OFFLINE";
      } else if (!att?.lastHeartbeatAt) {
        presence = "ONLINE";
      } else {
        const ageMs = now - att.lastHeartbeatAt.getTime();
        presence =
          ageMs <= AttendanceService.HEARTBEAT_FRESH_MS
            ? "ONLINE"
            : ageMs <= graceMs
              ? "RECONNECTING"
              : "OFFLINE";
      }

      return {
        id: bs.studentId,
        name: `${bs.student.firstName} ${bs.student.lastName || ""}`.trim(),
        isOnline: !!isOnline,
        presence,
        lastHeartbeatAt: att?.lastHeartbeatAt?.toISOString() || null,
        joinedAt: att?.joinedAt?.toISOString() || null,
        lastActivity: att?.lastActivity?.toISOString() || null,
        reconnectCount: att?.reconnectCount || 0,
        status: att?.status || "NOT_JOINED",
      };
    });

    const onlineCount = students.filter((s) => s.isOnline).length;
    const offlineCount = students.length - onlineCount;

    return {
      classId: coachClass.id,
      isLive: coachClass.liveSession?.status === "LIVE",
      startedAt: coachClass.liveSession?.startedAt?.toISOString() || null,
      totalEnrolled: students.length,
      onlineCount,
      offlineCount,
      students,
    };
  }

  // ──────────────────────────────────────────────
  // POLICY MANAGEMENT
  // ──────────────────────────────────────────────

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

  // ──────────────────────────────────────────────
  // EXPORT
  // ──────────────────────────────────────────────

  async exportAttendanceReport(
    accessToken: string | undefined,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      batchId?: string;
      coachId?: string;
      status?: string;
    }
  ) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Admin access required.");
    }

    const where: any = {};

    const exportDateFrom = this.parseDateFilter(filters.dateFrom, "dateFrom");
    const exportDateTo = this.parseDateFilter(filters.dateTo, "dateTo");
    if (exportDateFrom || exportDateTo) {
      where.class = {
        startsAt: {
          ...(exportDateFrom && { gte: exportDateFrom }),
          ...(exportDateTo && { lte: exportDateTo }),
        },
      };
    }

    if (filters.batchId) {
      where.class = {
        ...(where.class || {}),
        batchId: filters.batchId,
      };
    }

    if (filters.coachId) {
      where.class = {
        ...(where.class || {}),
        coachId: filters.coachId,
      };
    }

    if (filters.status) {
      where.status = filters.status as AttendanceStatus;
    }

    const records = await this.prisma.classAttendance.findMany({
      where,
      include: {
        student: true,
        class: { include: { coach: true, batch: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10000,
    });

    // Generate CSV rows
    const headers = [
      "Student Name",
      "Student Email",
      "Class Topic",
      "Batch",
      "Coach",
      "Date",
      "Status",
      "Duration (min)",
      "Attendance %",
      "Reconnects",
    ];

    const rows = records.map((r) => [
      `${r.student.firstName} ${r.student.lastName || ""}`.trim(),
      r.student.email,
      r.class.topic || "Untitled",
      r.class.batch?.name || "N/A",
      `${r.class.coach.firstName} ${r.class.coach.lastName || ""}`.trim(),
      r.class.startsAt.toISOString().split("T")[0],
      r.status,
      r.totalDuration ? Math.round(r.totalDuration / 60) : 0,
      r.attendancePercent ?? 0,
      r.reconnectCount,
    ]);

    const csv =
      [headers, ...rows]
        .map((row) => row.map((v) => this.toCsvCell(v)).join(","))
        .join("\r\n");

    return { csv, count: records.length };
  }

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  /**
   * Parse a date query param, rejecting garbage with a 400 instead of letting
   * `new Date("junk")` → Invalid Date reach Prisma and surface as a 500
   * (AUDIT M31).
   */
  private parseDateFilter(value: string | undefined, field: string): Date | undefined {
    if (value === undefined || value === null || value === "") return undefined;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid ${field}: expected an ISO date string.`);
    }
    return d;
  }

  /**
   * One consistent attendance tally for the class-report endpoints (AUDIT M4).
   * `absentCount` was computed two different ways (`total - presentCount` vs
   * `total - attendances.length`) and could go negative when an attendee had
   * since left the batch. Here "absent" = batch students with no PRESENT/LATE/
   * PARTIAL record, clamped at 0.
   */
  private tallyAttendance(
    attendances: Array<{ status: AttendanceStatus | string }>,
    totalStudents: number
  ) {
    const has = (...statuses: AttendanceStatus[]) =>
      attendances.filter((a) => statuses.includes(a.status as AttendanceStatus)).length;

    const presentCount = has(AttendanceStatus.PRESENT, AttendanceStatus.LATE);
    const lateCount = has(AttendanceStatus.LATE);
    const partialCount = has(AttendanceStatus.PARTIAL);
    const accountedFor = has(
      AttendanceStatus.PRESENT,
      AttendanceStatus.LATE,
      AttendanceStatus.PARTIAL
    );
    const absentCount = Math.max(0, totalStudents - accountedFor);
    const overallPercent =
      totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

    return { presentCount, lateCount, partialCount, absentCount, overallPercent };
  }

  /**
   * Render one CSV cell safely (AUDIT H25):
   * - double embedded quotes and always wrap in quotes, so a value containing
   *   `"`, `,` or a newline can't corrupt the row/column structure;
   * - prefix a leading `=`, `+`, `-`, `@`, tab or CR with `'` so spreadsheet
   *   apps don't evaluate it as a formula.
   */
  private toCsvCell(value: unknown): string {
    let str = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    return `"${str.replace(/"/g, '""')}"`;
  }

  private calculateTotalDuration(
    logs: Array<{
      eventType: string | AttendanceEventType;
      sessionStart: Date | null;
      sessionEnd: Date | null;
      sessionDuration: number | null;
    }>,
    // Every session — open or already closed — is clamped to this instant, so a
    // session left open past the class (a lost `participant_left`) and a
    // `sessionEnd` corrupted by an earlier bad write both stop inflating the
    // total, and the computation is stable across re-runs (AUDIT M3).
    openSessionEnd: Date = new Date()
  ): number {
    const cap = openSessionEnd.getTime();
    let total = 0;
    for (const log of logs) {
      const isSession =
        log.eventType === AttendanceEventType.JOIN ||
        log.eventType === AttendanceEventType.RECONNECT ||
        log.eventType === "JOIN" ||
        log.eventType === "RECONNECT";
      if (!isSession) continue;

      if (log.sessionStart) {
        const end = Math.min(log.sessionEnd?.getTime() ?? cap, cap);
        total += Math.max(0, Math.floor((end - log.sessionStart.getTime()) / 1000));
      } else if (log.sessionDuration) {
        // No start to clamp against (legacy row) — trust the stored value.
        total += log.sessionDuration;
      }
    }
    return total;
  }

  /**
   * Join / leave stamps for a finalized attendance row, read from its session
   * logs and clamped to the class window. Used when the live LEAVE / DISCONNECT
   * webhooks that normally set `joinedAt` / `leftAt` were lost (routine in local
   * dev, where LiveKit can't reach localhost) — a session still open at
   * finalize means the participant was present until the class ended.
   */
  private deriveAttendanceStamps(
    row: {
      joinedAt: Date | null;
      logs: Array<{
        eventType: string | AttendanceEventType;
        sessionStart: Date | null;
        sessionEnd: Date | null;
      }>;
    },
    classEndTime: Date
  ): { joinedAt: Date | null; leftAt: Date } {
    const cap = classEndTime.getTime();
    const starts: number[] = [];
    let lastEnd = 0;
    for (const log of row.logs) {
      const isSession =
        log.eventType === AttendanceEventType.JOIN ||
        log.eventType === AttendanceEventType.RECONNECT ||
        log.eventType === "JOIN" ||
        log.eventType === "RECONNECT";
      if (!isSession || !log.sessionStart) continue;
      starts.push(log.sessionStart.getTime());
      lastEnd = Math.max(lastEnd, Math.min(log.sessionEnd?.getTime() ?? cap, cap));
    }
    return {
      joinedAt: row.joinedAt ?? (starts.length ? new Date(Math.min(...starts)) : null),
      leftAt: new Date(lastEnd || cap),
    };
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

  private determineStatus(
    percent: number,
    policy: {
      presentThreshold: number;
      lateThreshold: number;
      partialThreshold: number;
    }
  ): AttendanceStatus {
    if (percent >= policy.presentThreshold) return AttendanceStatus.PRESENT;
    if (percent >= policy.lateThreshold) return AttendanceStatus.LATE;
    if (percent >= policy.partialThreshold) return AttendanceStatus.PARTIAL;
    return AttendanceStatus.ABSENT;
  }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
      accessToken,
      { secret: this.env.JWT_ACCESS_SECRET }
    );

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    return user;
  }
}
