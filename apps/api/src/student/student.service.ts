import {
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  StudentDashboardFeaturedClass,
  StudentDashboardLiveClass
} from "@nexa-chess/types";
import { AttendanceService } from "../attendance/attendance.service";
import { LiveKitService } from "../live-class/livekit.service";
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
    private readonly livekit: LiveKitService,
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

    // 1b. Profile + batch identity for the dashboard/sidebar chrome. The
    //     soft-delete extension already filters deleted batch enrolments.
    const [studentProfile, batchEnrolment] = await Promise.all([
      this.prisma.studentProfile.findUnique({
        where: { userId: user.id },
        select: { chessRating: true }
      }),
      this.prisma.batchStudent.findFirst({
        where: { studentId: user.id },
        orderBy: { enrolledAt: "desc" },
        include: { batch: true }
      })
    ]);

    // 2. Fetch Course Progress (+ modules, to surface the next incomplete one)
    const courses = await this.prisma.studentCourseProgress.findMany({
      where: { studentId: user.id },
      include: { course: { include: { modules: { orderBy: { order: "asc" } } } } },
      orderBy: { lastOpenedAt: "desc" },
      take: 4
    });
    const courseModuleIds = courses.flatMap((cp) => cp.course.modules.map((m) => m.id));
    const completedModuleIds = new Set(
      courseModuleIds.length > 0
        ? (
            await this.prisma.studentModuleProgress.findMany({
              where: { studentId: user.id, moduleId: { in: courseModuleIds } },
              select: { moduleId: true }
            })
          ).map((row) => row.moduleId)
        : []
    );

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
    // Only what this student is addressed by: platform-wide, students, or a
    // batch they are actually in. A coach-only notice must not leak here.
    const batchIds = (
      await this.prisma.batchStudent.findMany({
        where: { studentId: user.id },
        select: { batchId: true }
      })
    ).map((row) => row.batchId);

    const announcements = await this.prisma.announcement.findMany({
      where: {
        OR: [
          { audience: "EVERYONE" },
          { audience: "STUDENTS" },
          { audience: "BATCH", batchId: { in: batchIds } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 5
    });

    // A class that is live right now wins regardless of when it was scheduled
    // (a late class that started yesterday is still live today).
    const liveCandidate = await this.prisma.coachClass.findFirst({
      where: {
        batch: { students: { some: { studentId: user.id, isDeleted: false } } },
        OR: [
          { status: { in: ["LIVE", "IN_PROGRESS"] } },
          { liveSession: { status: "LIVE" } }
        ],
        NOT: { status: { in: ["CANCELLED", "COMPLETED"] } }
      },
      orderBy: { startsAt: "desc" },
      include: { coach: true, liveSession: true }
    });
    const liveClass = liveCandidate ? await this.toLiveClass(liveCandidate) : null;

    // Featured class: live > today's still-ahead class > next scheduled class
    // on any later day > today's already-finished class.
    const now = new Date();
    const classesToday = scheduledClasses.filter(c => c.startsAt < todayEnd);
    const pending = scheduledClasses.filter(
      c => c.status === "SCHEDULED" && c.endsAt > now
    );
    const featured =
      liveCandidate ||
      pending[0] ||
      [...classesToday].reverse().find(c => c.status === "COMPLETED") ||
      null;

    const finalUpcoming = scheduledClasses
      .filter(c => c.status === "SCHEDULED" && c.id !== featured?.id && c.endsAt > now)
      .slice(0, 5);

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
      { label: "Attendance", value: `${attendancePercent}%`, trend: "" }
    ];

    return {
      batchName: batchEnrolment?.batch.name ?? null,
      chessRating: studentProfile?.chessRating ?? null,
      // Dates are returned as ISO-8601 only. Formatting them here would use the
      // server's timezone, not the student's — the web app formats them with
      // the user's `timezone` (AUDIT H11).
      liveClass,
      todaysClass: featured ? this.toFeaturedClass(featured) : null,
      upcomingClasses: finalUpcoming.map(c => ({
        id: c.id,
        startsAt: c.startsAt.toISOString(),
        coach: c.coach.firstName,
        topic: c.topic || "Untitled Class",
        status: c.status
      })),
      courses: courses.map((cp: any) => {
        const nextModule = cp.course.modules.find(
          (m: { id: string }) => !completedModuleIds.has(m.id)
        );
        return {
          id: cp.course.id,
          title: cp.course.title,
          module: nextModule?.title || cp.course.description || "In Progress",
          progressPercent: cp.progressPercent,
          lastOpenedAt: cp.lastOpenedAt.toISOString()
        };
      }),
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

  private toFeaturedClass(c: {
    id: string;
    topic: string | null;
    coach: { firstName: string };
    startsAt: Date;
    endsAt: Date;
    status: string;
  }): StudentDashboardFeaturedClass {
    return {
      id: c.id,
      topic: c.topic || "Untitled Class",
      coachName: c.coach.firstName,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      durationMinutes: Math.round((c.endsAt.getTime() - c.startsAt.getTime()) / 60000),
      status: c.status
    };
  }

  private async toLiveClass(c: {
    id: string;
    topic: string | null;
    coachId: string;
    coach: { firstName: string };
    startsAt: Date;
    endsAt: Date;
    liveSession: { roomName: string; startedAt: Date | null } | null;
  }): Promise<StudentDashboardLiveClass> {
    let participantCount: number | null = null;
    let coachPresent: boolean | null = null;
    if (c.liveSession) {
      try {
        const participants = await this.livekit.listParticipants(c.liveSession.roomName);
        // Count people, not connections: drop the recorder, the coach's board
        // tab and extra tabs of the same user.
        const people = new Set(
          participants
            .map(p => p.identity)
            .filter(identity => !identity.startsWith("EG_") && !identity.endsWith("_board"))
            .map(identity => identity.split("_")[0])
        );
        participantCount = people.size;
        coachPresent = people.has(c.coachId);
      } catch {
        // LiveKit outage — the card still offers Join, just without the count.
      }
    }

    return {
      id: c.id,
      topic: c.topic || "Untitled Class",
      coachName: c.coach.firstName,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      startedAt: c.liveSession?.startedAt?.toISOString() ?? null,
      participantCount,
      coachPresent
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
