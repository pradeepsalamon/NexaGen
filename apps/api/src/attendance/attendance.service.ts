import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  AttendanceStatus,
  AttendanceEventType,
  UserRole,
  UserStatus,
  ClassStatus,
} from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";

@Injectable()
export class AttendanceService {
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

    // Upsert the ClassAttendance record
    const attendance = await this.prisma.classAttendance.upsert({
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
        eventType: "JOIN",
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
        eventType: "RECONNECT",
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
        eventType: { in: ["JOIN", "RECONNECT"] },
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
        eventType: "LEAVE",
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
        userId: `${coachId}_board`,
        eventType: "BOARD_JOIN",
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
        eventType: "BOARD_JOIN",
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
        userId: `${coachId}_board`,
        eventType: "BOARD_LEAVE",
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

    const scheduledDuration = Math.floor(
      (coachClass.endsAt.getTime() - coachClass.startsAt.getTime()) / 1000
    );

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
      const totalDuration = this.calculateTotalDuration(attendance.logs);
      const attendancePercent =
        scheduledDuration > 0
          ? Math.min(100, (totalDuration / scheduledDuration) * 100)
          : 100;

      const status = this.determineStatus(attendancePercent, policy);

      await this.prisma.classAttendance.update({
        where: { id: attendance.id },
        data: {
          totalDuration,
          attendancePercent: Math.round(attendancePercent * 10) / 10,
          status,
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
        coachAttendance.logs.filter((l) => l.eventType === "JOIN" || l.eventType === "RECONNECT" || l.eventType === "LEAVE")
      );
      await this.prisma.coachAttendance.update({
        where: { id: coachAttendance.id },
        data: { totalDuration: coachTotalDuration },
      });
    }

    this.logger.log(
      `Class attendance finalized: classId=${classId}, attendees=${attendances.length}`
    );
  }

  // ──────────────────────────────────────────────
  // QUERY METHODS
  // ──────────────────────────────────────────────

  async getStudentAttendance(
    accessToken: string | undefined,
    targetStudentId?: string
  ) {
    const user = await this.getAuthenticatedUser(accessToken);

    // Students can only view own data; coaches/admins can view any
    let studentId = user.id;
    if (targetStudentId) {
      if (
        user.role !== UserRole.ADMIN &&
        user.role !== UserRole.SUPER_ADMIN &&
        user.role !== UserRole.COACH
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

      // Track streaks (classes ordered desc, so newest first)
      if (isPresent || isPartial) {
        if (!streakBroken) currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        streakBroken = true;
        longestStreak = Math.max(longestStreak, currentStreak);
      }

      const scheduledDuration = Math.floor(
        (cls.endsAt.getTime() - cls.startsAt.getTime()) / 1000
      );

      return {
        id: cls.id,
        topic: cls.topic || "Untitled Class",
        batchName: cls.batch?.name || "Demo Class",
        coachName: `${cls.coach.firstName} ${cls.coach.lastName || ""}`.trim(),
        date: cls.startsAt.toISOString(),
        status: att?.status || "ABSENT",
        joinedAt: att?.joinedAt?.toISOString() || null,
        leftAt: att?.leftAt?.toISOString() || null,
        scheduledDuration,
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

    // Authorization: student can view own, coach/admin can view any
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

    const presentCount = coachClass.attendances.filter(
      (a) =>
        a.status === AttendanceStatus.PRESENT ||
        a.status === AttendanceStatus.LATE
    ).length;
    const absentCount = totalStudents - presentCount;
    const lateCount = coachClass.attendances.filter(
      (a) => a.status === AttendanceStatus.LATE
    ).length;
    const partialCount = coachClass.attendances.filter(
      (a) => a.status === AttendanceStatus.PARTIAL
    ).length;

    const overallPercent =
      totalStudents > 0
        ? Math.round((presentCount / totalStudents) * 100)
        : 0;

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
      sessions,
      monthlyClasses,
    ] = await Promise.all([
      this.prisma.coachClass.count({ where: { coachId } }),
      this.prisma.coachClass.count({
        where: { coachId, status: ClassStatus.COMPLETED },
      }),
      this.prisma.coachClass.count({
        where: { coachId, status: ClassStatus.CANCELLED },
      }),
      this.prisma.liveSession.findMany({
        where: { coachId, startedAt: { not: null }, endedAt: { not: null } },
        select: {
          startedAt: true,
          endedAt: true,
          class: { select: { startsAt: true } },
        },
        orderBy: { startedAt: "desc" },
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
    const earlyExits = 0;

    for (const session of sessions) {
      if (session.startedAt && session.endedAt) {
        const duration = Math.floor(
          (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
        );
        totalTeachingSeconds += duration;

        // Late start: started more than 5 minutes after scheduled
        if (session.class?.startsAt) {
          const lateBy =
            (session.startedAt.getTime() - session.class.startsAt.getTime()) /
            60000;
          if (lateBy > 5) lateStarts++;
        }
      }
    }

    const totalTeachingHours =
      Math.round((totalTeachingSeconds / 3600) * 10) / 10;
    const avgSessionMinutes =
      sessions.length > 0
        ? Math.round(totalTeachingSeconds / sessions.length / 60)
        : 0;

    // Recent class history
    const recentClasses = await this.prisma.coachClass.findMany({
      where: { coachId, status: ClassStatus.COMPLETED },
      include: {
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true,
        attendances: { where: { status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] } } },
        coachAttendance: true,
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
    const todayStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const todayEnd = new Date(now.getTime() + 20 * 60 * 60 * 1000);

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

    // Monthly trend (last 6 months)
    const monthlyTrend = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(
        now.getFullYear(),
        now.getMonth() - i + 1,
        1
      );

      const monthClasses = await this.prisma.coachClass.count({
        where: {
          status: ClassStatus.COMPLETED,
          startsAt: { gte: monthDate, lt: nextMonth },
        },
      });

      const monthAttended = await this.prisma.classAttendance.count({
        where: {
          status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
          class: {
            startsAt: { gte: monthDate, lt: nextMonth },
          },
        },
      });

      const monthTotal = await this.prisma.classAttendance.count({
        where: {
          class: {
            startsAt: { gte: monthDate, lt: nextMonth },
          },
        },
      });

      monthlyTrend.push({
        month: monthDate.toLocaleDateString("en-US", {
          month: "short",
          year: "numeric",
        }),
        classes: monthClasses,
        attended: monthAttended,
        total: monthTotal,
        percent:
          monthTotal > 0
            ? Math.round((monthAttended / monthTotal) * 100)
            : 0,
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

    const students = enrolledStudents.map((bs) => {
      const att = attendanceMap.get(bs.studentId);
      const lastLog = att?.logs?.[0];
      const isOnline =
        lastLog &&
        (lastLog.eventType === AttendanceEventType.JOIN ||
          lastLog.eventType === AttendanceEventType.RECONNECT);

      return {
        id: bs.studentId,
        name: `${bs.student.firstName} ${bs.student.lastName || ""}`.trim(),
        isOnline: !!isOnline,
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

    if (filters.dateFrom || filters.dateTo) {
      where.class = {
        startsAt: {
          ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
          ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
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
      headers.join(",") +
      "\n" +
      rows.map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");

    return { csv, count: records.length };
  }

  // ──────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────

  private calculateTotalDuration(
    logs: Array<{
      eventType: string | AttendanceEventType;
      sessionStart: Date | null;
      sessionEnd: Date | null;
      sessionDuration: number | null;
    }>
  ): number {
    let total = 0;
    for (const log of logs) {
      if (
        (log.eventType === AttendanceEventType.JOIN ||
          log.eventType === AttendanceEventType.RECONNECT) &&
        log.sessionDuration
      ) {
        total += log.sessionDuration;
      }
    }
    return total;
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
