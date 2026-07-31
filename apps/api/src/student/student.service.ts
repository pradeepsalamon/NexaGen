import {
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-gen/config/api";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";
import { UserStatus } from "@prisma/client";


@Injectable()
export class StudentService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) { }

  async getDashboard(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    const now = new Date();
    // Use a rolling 24h window to avoid server-timezone dependency
    const todayStart = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const todayEnd = new Date(now.getTime() + 20 * 60 * 60 * 1000);

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

    // 3. Fetch Practices
    const practices = await this.prisma.studentPractice.findMany({
      where: { studentId: user.id, status: { not: "COMPLETED" } },
      include: { practice: true },
      orderBy: { practice: { dueDate: "asc" } },
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
    let todaysClass = null;
    const upcomingClasses = [];

    for (const cls of scheduledClasses) {
      if (!todaysClass && cls.startsAt <= todayEnd) {
        todaysClass = cls;
      } else if (upcomingClasses.length < 5) {
        upcomingClasses.push(cls);
      }
    }

    // Calculate actual attendance percentage
    const completedClassesCount = await this.prisma.coachClass.count({
      where: {
        batch: { students: { some: { studentId: user.id, isDeleted: false } } },
        status: "COMPLETED"
      }
    });

    const attendedClassesCount = await this.prisma.classAttendance.count({
      where: {
        studentId: user.id,
        status: "PRESENT"
      }
    });

    const attendancePercent = completedClassesCount > 0 
      ? Math.round((attendedClassesCount / completedClassesCount) * 100) 
      : 100;

    const progressMetrics = [
      { label: "Classes Attended", value: attendedClassesCount.toString(), trend: "" },
      { label: "Lessons Completed", value: activities.filter((a: any) => a.type === 'LESSON_COMPLETED').length.toString(), trend: "" },
      { label: "Practice Hrs", value: "0", trend: "" },
      { label: "Attendance", value: `${attendancePercent}%`, trend: "" }
    ];

    return {
      todaysClass: todaysClass ? {
        id: todaysClass.id,
        topic: todaysClass.topic || "Untitled Class",
        coachName: todaysClass.coach.firstName,
        time: todaysClass.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        duration: `${Math.round((todaysClass.endsAt.getTime() - todaysClass.startsAt.getTime()) / 60000)} min`,
        status: todaysClass.status
      } : null,
      upcomingClasses: upcomingClasses.map(c => ({
        id: c.id,
        date: c.startsAt.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        time: c.startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        coach: c.coach.firstName,
        topic: c.topic || "Untitled Class",
        status: c.status
      })),
      courses: courses.map((cp: any) => ({
        id: cp.course.id,
        title: cp.course.title,
        module: cp.course.description || "In Progress",
        progressPercent: cp.progressPercent,
        lastOpened: cp.lastOpenedAt.toLocaleDateString()
      })),
      practices: practices.map((p: any) => ({
        id: p.practice.id,
        title: p.practice.title,
        difficulty: p.practice.difficulty,
        dueDate: p.practice.dueDate.toLocaleDateString(),
        status: p.status
      })),
      activities: activities.map((a: any) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        time: a.createdAt.toLocaleDateString()
      })),
      announcements: announcements.map((a: any) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.type,
        date: a.createdAt.toLocaleDateString()
      })),
      progressMetrics
    };
  }

  async getAttendance(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);

    const completedClasses = await this.prisma.coachClass.findMany({
      where: {
        batch: { students: { some: { studentId: user.id, isDeleted: false } } },
        status: "COMPLETED"
      },
      include: {
        batch: true,
        coach: true,
        attendances: {
          where: { studentId: user.id }
        }
      },
      orderBy: { startsAt: "desc" }
    });

    const attendedClassesCount = completedClasses.filter(c => c.attendances.length > 0 && c.attendances[0].status === "PRESENT").length;
    const totalClassesCount = completedClasses.length;
    const attendancePercent = totalClassesCount > 0 
      ? Math.round((attendedClassesCount / totalClassesCount) * 100) 
      : 100;

    const history = completedClasses.map(cls => {
      const isPresent = cls.attendances.length > 0 && cls.attendances[0].status === "PRESENT";
      return {
        id: cls.id,
        topic: cls.topic || "Untitled Class",
        batchName: cls.batch?.name || "Demo Class",
        coachName: `${cls.coach.firstName} ${cls.coach.lastName || ""}`.trim(),
        date: cls.startsAt.toISOString(),
        status: isPresent ? "PRESENT" : "ABSENT",
        joinedAt: isPresent ? cls.attendances[0].joinedAt?.toISOString() : null
      };
    });

    return {
      stats: {
        total: totalClassesCount,
        attended: attendedClassesCount,
        missed: totalClassesCount - attendedClassesCount,
        percentage: attendancePercent
      },
      history
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
