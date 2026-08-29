import {
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { AttendanceService } from "../attendance/attendance.service";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";
import { UserStatus } from "@prisma/client";


@Injectable()
export class StudentService {
  private readonly env = getApiEnv();

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) { }

  async getDashboard(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    // Real calendar day in the student's timezone, not a rolling window (M7).
    const { start: todayStart, end: todayEnd } = zonedDayBounds(user.timezone);

    // 1. Fetch upcoming classes for batches the student is enrolled in
    const scheduledClasses = await this.prisma.coachClass.findMany({
      where: {
        batch: { students: { some: { studentId: user.id, isDeleted: false } } },
        startsAt: { gte: todayStart },
        status: { not: "CANCELLED" }
      },
      orderBy: { startsAt: "asc" },
      include: { coach: true, liveSession: true }
    });

    // 2. Fetch Course Progress
    const courses = await this.prisma.studentCourseProgress.findMany({
      where: { studentId: user.id },
      include: { course: true },
      orderBy: { lastOpenedAt: "desc" },
      take: 4
    });

    // 3. Fetch Practices + coach-assigned PGN assignments (both feed the
    //    "Assignments & Practice" card).
    const practices = await this.prisma.studentPractice.findMany({
      where: { studentId: user.id, status: { not: "COMPLETED" } },
      include: { practice: true },
      orderBy: { practice: { dueDate: "asc" } },
      take: 5
    });

    const assignments = await this.prisma.studentAssignment.findMany({
      where: { studentId: user.id, status: { not: "COMPLETED" } },
      include: { assignmentBatch: { include: { assignment: true } } },
      orderBy: { assignmentBatch: { dueDate: "asc" } },
      take: 5
    });

    // 4. Fetch Activities
    const activities = await this.prisma.studentActivity.findMany({
      where: { studentId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    // 5. Fetch Announcements
    const announcements = await this.prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 5
    });

    // Determine Today's class vs Upcoming
    let todaysClass: typeof scheduledClasses[0] | null = null;
    const upcomingClasses = [];

    const classesToday = scheduledClasses.filter(c => c.startsAt < todayEnd);
    const classesFuture = scheduledClasses.filter(c => c.startsAt >= todayEnd);

    if (classesToday.length > 0) {
      const liveClass = classesToday.find(c => c.status === "LIVE");
      const scheduledClass = classesToday.find(c => c.status === "SCHEDULED");
      const completedClass = [...classesToday].reverse().find(c => c.status === "COMPLETED");

      todaysClass = liveClass || scheduledClass || completedClass || classesToday[0];

      // Put the rest of today's scheduled classes in upcoming
      if (todaysClass) {
        const remainingToday = classesToday.filter(
          c => c.id !== todaysClass!.id && c.status === "SCHEDULED"
        );
        upcomingClasses.push(...remainingToday);
      }
    }

    // Only include SCHEDULED future classes in the upcoming list
    upcomingClasses.push(...classesFuture.filter(c => c.status === "SCHEDULED"));
    const finalUpcoming = upcomingClasses.slice(0, 5);

    // Fetch past classes for the dashboard
    const pastClasses = await this.prisma.coachClass.findMany({
      where: {
        batch: { students: { some: { studentId: user.id, isDeleted: false } } },
        status: { in: ["COMPLETED", "CANCELLED"] },
      },
      orderBy: { startsAt: "desc" },
      take: 10,
      include: { coach: true, liveSession: true }
    });

    // Attendance is owned by AttendanceService — the dashboard must not compute
    // its own percentage, or /student and /student/attendance disagree (AUDIT H10).
    const { stats: attendanceStats } = await this.attendanceService.getStudentAttendance(
      accessToken
    );
    const attendedClassesCount = attendanceStats.attended;
    const attendancePercent = attendanceStats.percentage;

    const progressMetrics = [
      { label: "Classes Attended", value: attendedClassesCount.toString(), trend: "" },
      { label: "Lessons Completed", value: activities.filter((a: any) => a.type === 'LESSON_COMPLETED').length.toString(), trend: "" },
      { label: "Practice Hrs", value: "0", trend: "" },
      { label: "Attendance", value: `${attendancePercent}%`, trend: "" }
    ];

    return {
      // Dates are returned as ISO-8601 only. Formatting them here would use the
      // server's timezone, not the student's — the web app formats them with
      // the user's `timezone` (AUDIT H11).
      todaysClass: todaysClass ? {
        id: todaysClass.id,
        topic: todaysClass.topic || "Untitled Class",
        coachName: todaysClass.coach.firstName,
        startsAt: todaysClass.startsAt.toISOString(),
        durationMinutes: Math.round(
          (todaysClass.endsAt.getTime() - todaysClass.startsAt.getTime()) / 60000
        ),
        status: todaysClass.status
      } : null,
      upcomingClasses: finalUpcoming.map(c => ({
        id: c.id,
        startsAt: c.startsAt.toISOString(),
        coach: c.coach.firstName,
        topic: c.topic || "Untitled Class",
        status: c.status
      })),
      courses: courses.map((cp: any) => ({
        id: cp.course.id,
        title: cp.course.title,
        module: cp.course.description || "In Progress",
        progressPercent: cp.progressPercent,
        lastOpenedAt: cp.lastOpenedAt.toISOString()
      })),
      practices: [
        ...assignments.map((a: any) => ({
          id: a.id,
          title: a.assignmentBatch.assignment.title,
          difficulty: a.assignmentBatch.assignment.difficulty,
          dueDate: a.assignmentBatch.dueDate.toISOString(),
          status: a.status
        })),
        ...practices.map((p: any) => ({
          id: p.practice.id,
          title: p.practice.title,
          difficulty: p.practice.difficulty,
          dueDate: p.practice.dueDate.toISOString(),
          status: p.status
        }))
      ]
        .sort((x, y) => x.dueDate.localeCompare(y.dueDate))
        .slice(0, 5),
      activities: activities.map((a: any) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        createdAt: a.createdAt.toISOString()
      })),
      announcements: announcements.map((a: any) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.type,
        createdAt: a.createdAt.toISOString()
      })),
      pastClasses: pastClasses.map((c: any) => ({
        id: c.id,
        topic: c.topic || "Untitled Class",
        coachName: c.coach.firstName,
        startsAt: c.startsAt.toISOString(),
        status: c.status,
        hasRecording: !!c.liveSession?.recordingUrl,
      })),
      progressMetrics
    };
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
      where: { id: payload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE || user.role !== "STUDENT") {
      throw new UnauthorizedException("Invalid session or unauthorized.");
    }

    return user;
  }
}
