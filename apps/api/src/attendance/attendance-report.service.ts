import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import {
  AttendanceStatus,
  AttendanceEventType,
  Prisma,
  UserRole,
  UserStatus,
  ClassStatus,
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { queryEnum, queryString } from "../common/query-params";
import { classRunSeconds, parseDateFilter, tallyAttendance, toCsvCell } from "./attendance-calc.util";
import { zonedDateToUtc, zonedMonthBounds, zonedYmd } from "../common/time";
import { AttendanceService } from "./attendance.service";

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

/** Read side of attendance: student/class/coach reports, class summaries and CSV export. */
@Injectable()
export class AttendanceReportService {
  private readonly logger = new Logger(AttendanceReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly attendance: AttendanceService
  ) {}

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
    const [allCompletedClasses, enrolments] = await Promise.all([this.prisma.coachClass.findMany({
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
    }),
      this.prisma.batchStudent.findMany({
        where: { studentId },
        select: { batchId: true, enrolledAt: true },
      }),
    ]);

    // A class that ended before the student joined its batch is not one they
    // missed. Without this a student enrolled mid-term showed every earlier
    // class as ABSENT — rows with no attendance record behind them, whose
    // "logs" could only 404. A scored attendance row always counts.
    const enrolledAt = new Map(enrolments.map((e) => [e.batchId, e.enrolledAt]));
    const completedClasses = allCompletedClasses.filter((cls) => {
      if (cls.attendances.length > 0) return true;
      const since = cls.batchId ? enrolledAt.get(cls.batchId) : undefined;
      return !since || cls.endsAt > since;
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
      const classActualDuration = classRunSeconds(cls);

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

    // Monthly & weekly stats, on the viewer's calendar — not the server's
    // (the box runs UTC, so "this month" flipped at 05:30 IST).
    const now = new Date();
    const monthStart = zonedMonthBounds(user.timezone, now).start;
    const today = zonedYmd(user.timezone, now);
    const weekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    const weekStart = zonedDateToUtc(user.timezone, today.year, today.month, today.day - weekday);

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

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        liveSession: { select: { startedAt: true, endedAt: true } },
        batch: {
          select: { students: { where: { studentId, isDeleted: false }, select: { id: true } } },
        },
      },
    });
    if (!coachClass) {
      throw new NotFoundException("Class not found.");
    }

    // Coaches may only read logs for classes they teach
    if (user.role === UserRole.COACH && coachClass.coachId !== user.id) {
      throw new ForbiddenException("Not authorized to view this student's logs.");
    }

    const found = await this.prisma.classAttendance.findUnique({
      where: { classId_studentId: { classId, studentId } },
      include: { logs: { orderBy: { timestamp: "asc" } } },
    });

    // The history lists every completed class of the student's batch, scored
    // or not; a row with no attendance record behind it is a no-show and must
    // open as one — not as a 404. Anyone outside the batch with no record
    // still gets the 404.
    const enrolled = (coachClass.batch?.students.length ?? 0) > 0;
    if (!found && !enrolled) {
      throw new NotFoundException("Attendance record not found.");
    }
    const attendance = found ?? {
      status: AttendanceStatus.ABSENT,
      totalDuration: 0,
      attendancePercent: 0,
      reconnectCount: 0,
      joinedAt: null,
      leftAt: null,
      logs: [] as Array<{
        id: string;
        eventType: AttendanceEventType;
        timestamp: Date;
        sessionStart: Date | null;
        sessionEnd: Date | null;
        sessionDuration: number | null;
        reason: string | null;
        source: string;
      }>,
    };

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
      scheduledDuration: Math.floor(
        (coachClass.endsAt.getTime() - coachClass.startsAt.getTime()) / 1000
      ),
      classDuration: classRunSeconds(coachClass),
      // Same label and date as the student's history row for this class.
      topic: coachClass.topic || "Untitled Class",
      classStartsAt: coachClass.startsAt.toISOString(),
      actualStart: coachClass.liveSession?.startedAt?.toISOString() ?? null,
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
      tallyAttendance(coachClass.attendances, totalStudents);

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

    const dateFrom = parseDateFilter(filters.dateFrom, "dateFrom");
    const dateTo = parseDateFilter(filters.dateTo, "dateTo");
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
        orderBy: { startsAt: "asc" },
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

    const reportDateFrom = parseDateFilter(filters.dateFrom, "dateFrom");
    const reportDateTo = parseDateFilter(filters.dateTo, "dateTo");
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
      tallyAttendance(coachClass.attendances, totalStudents);

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
        await this.attendance.finalizeClassAttendance(classId);
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
    filters = {
      batchId: queryString(filters.batchId, "batchId"),
      coachId: queryString(filters.coachId, "coachId"),
      dateFrom: queryString(filters.dateFrom, "dateFrom"),
      dateTo: queryString(filters.dateTo, "dateTo"),
      status: queryEnum(filters.status, AttendanceStatus, "status")
    };

    const where: any = {};

    const exportDateFrom = parseDateFilter(filters.dateFrom, "dateFrom");
    const exportDateTo = parseDateFilter(filters.dateTo, "dateTo");
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
        .map((row) => row.map((v) => toCsvCell(v)).join(","))
        .join("\r\n");

    return { csv, count: records.length };
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
