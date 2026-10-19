import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import {
  AttendanceStatus,
  AttendanceEventType,
  UserRole,
  UserStatus,
  ClassStatus,
  LiveSessionStatus,
} from "@prisma/client";
import type { ParticipantPresence } from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { AttendanceService } from "./attendance.service";

/** Admin dashboard, live-class presence monitoring and reliability metrics. */
@Injectable()
export class AttendanceMonitoringService {
  // Presence classification for getLiveClassMonitoring (P0 reliability Phase
  // 2). A heartbeat younger than this is ONLINE; older but still inside the
  // active policy's gracePeriodMinutes is RECONNECTING; beyond that is
  // OFFLINE (sweepStaleHeartbeats will soon convert it to a real LEAVE log).
  // No AttendancePolicy field exists for the ping cadence itself, so this
  // mirrors the frontend's intended ~15s heartbeat interval (RELIABILITY_
  // DESIGN.md §4.1) rather than reading it from policy.
  private static readonly HEARTBEAT_FRESH_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly attendance: AttendanceService
  ) {}

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
        month: monthDate.toISOString(),
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

    const policy = await this.attendance.getActivePolicy();
    const graceMs = policy.gracePeriodMinutes * 60_000;
    const now = Date.now();

    const students = enrolledStudents.map((bs) => {
      const att = attendanceMap.get(bs.studentId);
      const lastLog = att?.logs?.[0];
      const { isOnline, presence } = this.derivePresence(
        lastLog?.eventType,
        att?.lastHeartbeatAt,
        graceMs,
        now
      );

      return {
        id: bs.studentId,
        name: `${bs.student.firstName} ${bs.student.lastName || ""}`.trim(),
        isOnline,
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

  /**
   * Shared ONLINE/RECONNECTING/OFFLINE/LEFT classification (RELIABILITY_
   * DESIGN.md §3.2/§4.2), used by both the per-class monitor above and the
   * cross-class reliability view below. `lastLogEventType` is whatever the
   * participant's most recent JOIN/RECONNECT/LEAVE/DISCONNECT log says, kept
   * as a plain string since `CoachAttendanceLog.eventType` isn't the same
   * enum as `AttendanceLog`'s (§4.4) and this needs to serve both.
   */
  private derivePresence(
    lastLogEventType: string | undefined,
    lastHeartbeatAt: Date | null | undefined,
    graceMs: number,
    now: number
  ): { isOnline: boolean; presence: ParticipantPresence } {
    const isOnline =
      lastLogEventType === AttendanceEventType.JOIN ||
      lastLogEventType === AttendanceEventType.RECONNECT;

    if (!isOnline) {
      return { isOnline: false, presence: lastLogEventType ? "LEFT" : "OFFLINE" };
    }
    if (!lastHeartbeatAt) {
      return { isOnline: true, presence: "ONLINE" };
    }

    const ageMs = now - lastHeartbeatAt.getTime();
    const presence: ParticipantPresence =
      ageMs <= AttendanceMonitoringService.HEARTBEAT_FRESH_MS
        ? "ONLINE"
        : ageMs <= graceMs
          ? "RECONNECTING"
          : "OFFLINE";

    return { isOnline: true, presence };
  }

  /**
   * P0 reliability Phase 5 (RELIABILITY_DESIGN.md §4.5): admin-only,
   * cross-class view of every currently-LIVE session that has at least one
   * participant (coach or student) in RECONNECTING/OFFLINE presence right
   * now. Deliberately a fresh query, not a repurposing of
   * `getLiveClassMonitoring` above (which stays per-class and lists the full
   * enrolled roster, including students who never joined) — a participant
   * who never joined is an attendance concern, not a reliability one, so
   * this only ever looks at rows that actually have a
   * ClassAttendance/CoachAttendance.
   */
  async getLiveReliabilityOverview(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Admin access required.");
    }

    const policy = await this.attendance.getActivePolicy();
    const graceMs = policy.gracePeriodMinutes * 60_000;
    const now = Date.now();

    const liveSessions = await this.prisma.liveSession.findMany({
      where: { status: LiveSessionStatus.LIVE },
      include: {
        class: {
          include: {
            coach: true,
            batch: true,
            coachAttendance: {
              include: { logs: { orderBy: { timestamp: "desc" }, take: 1 } },
            },
            attendances: {
              include: {
                student: true,
                logs: { orderBy: { timestamp: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });

    type ReliabilityParticipant = {
      id: string;
      name: string;
      role: "COACH" | "STUDENT";
      presence: ParticipantPresence;
      lastHeartbeatAt: string | null;
    };

    const classes = liveSessions.map((session) => {
      const coachClass = session.class;
      const participants: ReliabilityParticipant[] = [];

      if (coachClass.coachAttendance) {
        const lastLog = coachClass.coachAttendance.logs[0];
        const { presence } = this.derivePresence(
          lastLog?.eventType,
          coachClass.coachAttendance.lastHeartbeatAt,
          graceMs,
          now
        );
        participants.push({
          id: coachClass.coachId,
          name: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
          role: "COACH",
          presence,
          lastHeartbeatAt: coachClass.coachAttendance.lastHeartbeatAt?.toISOString() || null,
        });
      }

      for (const att of coachClass.attendances) {
        const lastLog = att.logs[0];
        const { presence } = this.derivePresence(
          lastLog?.eventType,
          att.lastHeartbeatAt,
          graceMs,
          now
        );
        participants.push({
          id: att.studentId,
          name: `${att.student.firstName} ${att.student.lastName || ""}`.trim(),
          role: "STUDENT",
          presence,
          lastHeartbeatAt: att.lastHeartbeatAt?.toISOString() || null,
        });
      }

      const affectedParticipants = participants.filter(
        (p) => p.presence === "RECONNECTING" || p.presence === "OFFLINE"
      );

      return {
        classId: coachClass.id,
        title: coachClass.title || coachClass.topic || "Untitled class",
        coachName: `${coachClass.coach.firstName} ${coachClass.coach.lastName || ""}`.trim(),
        batchName: coachClass.batch?.name || null,
        startedAt: session.startedAt?.toISOString() || null,
        reconnectingCount: affectedParticipants.filter((p) => p.presence === "RECONNECTING").length,
        offlineCount: affectedParticipants.filter((p) => p.presence === "OFFLINE").length,
        affectedParticipants,
      };
    });

    const affectedClasses = classes.filter((c) => c.affectedParticipants.length > 0);

    return {
      generatedAt: new Date().toISOString(),
      liveClassCount: classes.length,
      affectedClassCount: affectedClasses.length,
      totalReconnecting: affectedClasses.reduce((sum, c) => sum + c.reconnectingCount, 0),
      totalOffline: affectedClasses.reduce((sum, c) => sum + c.offlineCount, 0),
      classes: affectedClasses,
    };
  }

  /**
   * P0 reliability Phase 6 (RELIABILITY_DESIGN.md §6): admin-only, how often
   * the LiveKit webhook path actually worked over a trailing window.
   *
   * `recordDisconnectEvent`/`recordCoachDisconnectEvent` are called from
   * `sweepStaleHeartbeats` (§4.1) with `reason: "heartbeat_timeout"` and
   * `AttendanceRoomPresenceService.sweep` with `reason: "not_in_room"` —
   * so counting DISCONNECT logs with either of those reasons *is* counting
   * fallback triggers, no separate bookkeeping needed. "Webhook loss" is broader:
   * a participant session with no LEAVE log anywhere in its history never got a
   * clean webhook leave at all — either the fallback caught it (a DISCONNECT log
   * exists), or it didn't and `closeOpenAttendanceLogs` silently force-closed it
   * at finalize with no marker row of its own. The two counts aren't a strict subset
   * of one another (a session can fall back once, reconnect, then leave cleanly —
   * that has both a DISCONNECT and a LEAVE log) so both are computed
   * independently from the same per-row log set.
   */
  async getReliabilityMetrics(accessToken: string | undefined, days = 30) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Admin access required.");
    }

    const windowDays = Math.min(Math.max(Math.trunc(days) || 30, 1), 365);
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60_000);

    const endedSessions = await this.prisma.liveSession.findMany({
      where: { status: LiveSessionStatus.ENDED, endedAt: { gte: since } },
      select: { classId: true },
    });
    const classIds = endedSessions.map((s) => s.classId);

    if (classIds.length === 0) {
      return {
        windowDays,
        sampledClasses: 0,
        totalParticipantSessions: 0,
        webhookLossCount: 0,
        webhookLossRate: 0,
        heartbeatFallbackCount: 0,
        heartbeatFallbackRate: 0,
      };
    }

    const logSelect = { eventType: true, reason: true } as const;
    const [studentRows, coachRows] = await Promise.all([
      this.prisma.classAttendance.findMany({
        where: { classId: { in: classIds } },
        select: { logs: { select: logSelect } },
      }),
      this.prisma.coachAttendance.findMany({
        where: { classId: { in: classIds } },
        select: { logs: { select: logSelect } },
      }),
    ]);

    let totalParticipantSessions = 0;
    let webhookLossCount = 0;
    let heartbeatFallbackCount = 0;

    for (const row of [...studentRows, ...coachRows]) {
      const hasJoined = row.logs.some(
        (l) => l.eventType === "JOIN" || l.eventType === "RECONNECT"
      );
      if (!hasJoined) continue; // never actually joined — not a session for this metric

      totalParticipantSessions += 1;

      if (!row.logs.some((l) => l.eventType === "LEAVE")) {
        webhookLossCount += 1;
      }
      if (
        row.logs.some(
          (l) =>
            l.eventType === "DISCONNECT" &&
            (l.reason === "heartbeat_timeout" || l.reason === "not_in_room")
        )
      ) {
        heartbeatFallbackCount += 1;
      }
    }

    return {
      windowDays,
      sampledClasses: classIds.length,
      totalParticipantSessions,
      webhookLossCount,
      webhookLossRate: totalParticipantSessions ? webhookLossCount / totalParticipantSessions : 0,
      heartbeatFallbackCount,
      heartbeatFallbackRate: totalParticipantSessions
        ? heartbeatFallbackCount / totalParticipantSessions
        : 0,
    };
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
