import { Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  CompleteCourseModuleResponse,
  StudentCourseDetailResponse,
  StudentCourseListResponse,
  StudentCourseModuleSummary,
  StudentCourseSummary
} from "@nexa-chess/types";
import { CourseStatus, Prisma, PuzzleAttemptStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertStudent, authenticateUser } from "./course-auth.helper";

const courseModuleInclude = {
  assignment: { select: { id: true, title: true, activityType: true, pgn: true } },
  puzzle: { select: { id: true, title: true, puzzleType: true } }
} satisfies Prisma.CourseModuleInclude;

type CourseModuleRow = Prisma.CourseModuleGetPayload<{ include: typeof courseModuleInclude }>;

@Injectable()
export class CourseProgressService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async listForStudent(accessToken: string | undefined): Promise<StudentCourseListResponse> {
    const user = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));

    const courses = await this.prisma.course.findMany({
      where: { status: CourseStatus.PUBLISHED },
      include: { _count: { select: { modules: true } } },
      orderBy: { createdAt: "desc" }
    });
    if (courses.length === 0) return { courses: [] };

    const courseIds = courses.map((c) => c.id);
    const [progressRows, completedRows] = await Promise.all([
      this.prisma.studentCourseProgress.findMany({
        where: { studentId: user.id, courseId: { in: courseIds } }
      }),
      this.prisma.studentModuleProgress.findMany({
        where: { studentId: user.id, module: { courseId: { in: courseIds } } },
        select: { module: { select: { courseId: true } } }
      })
    ]);
    const progressByCourse = new Map(progressRows.map((p) => [p.courseId, p]));
    const completedByCourse = new Map<string, number>();
    for (const row of completedRows) {
      const courseId = row.module.courseId;
      completedByCourse.set(courseId, (completedByCourse.get(courseId) ?? 0) + 1);
    }

    return {
      courses: courses.map((course) => {
        const progress = progressByCourse.get(course.id);
        const completedModuleCount = completedByCourse.get(course.id) ?? 0;
        return {
          id: course.id,
          title: course.title,
          description: course.description,
          moduleCount: course._count.modules,
          completedModuleCount,
          progressPercent: progress?.progressPercent ?? 0,
          lastOpenedAt: progress?.lastOpenedAt ? progress.lastOpenedAt.toISOString() : null
        } satisfies StudentCourseSummary;
      })
    };
  }

  async getForStudent(
    accessToken: string | undefined,
    courseId: string
  ): Promise<StudentCourseDetailResponse> {
    const user = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: { modules: { include: courseModuleInclude, orderBy: { order: "asc" } } }
    });
    if (!course || course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException("Course not found.");
    }

    const moduleIds = course.modules.map((m) => m.id);
    const completedRows =
      moduleIds.length > 0
        ? await this.prisma.studentModuleProgress.findMany({
            where: { studentId: user.id, moduleId: { in: moduleIds } },
            select: { moduleId: true }
          })
        : [];
    const completedSet = new Set(completedRows.map((r) => r.moduleId));

    // Self-healing auto-complete: a puzzle module solved directly at
    // /student/puzzles/:id (outside this course UI) has no StudentModuleProgress
    // row yet. Detect it here and persist the row so listForStudent and
    // completeModule (which only read StudentModuleProgress) stay consistent
    // from this point on.
    const uncompletedPuzzleModules = course.modules.filter(
      (m) => m.contentType === "PUZZLE" && m.puzzleId && !completedSet.has(m.id)
    );
    if (uncompletedPuzzleModules.length > 0) {
      const solvedPuzzleIds = new Set(
        (
          await this.prisma.puzzleAttempt.findMany({
            where: {
              studentId: user.id,
              puzzleId: { in: uncompletedPuzzleModules.map((m) => m.puzzleId as string) },
              status: PuzzleAttemptStatus.SOLVED
            },
            select: { puzzleId: true }
          })
        ).map((r) => r.puzzleId)
      );
      const newlyCompleted = uncompletedPuzzleModules.filter(
        (m) => m.puzzleId && solvedPuzzleIds.has(m.puzzleId)
      );
      if (newlyCompleted.length > 0) {
        await this.prisma.$transaction(
          newlyCompleted.map((m) =>
            this.prisma.studentModuleProgress.upsert({
              where: { studentId_moduleId: { studentId: user.id, moduleId: m.id } },
              create: { studentId: user.id, moduleId: m.id },
              update: {}
            })
          )
        );
        for (const m of newlyCompleted) completedSet.add(m.id);
      }
    }

    const progressPercent =
      moduleIds.length > 0 ? Math.round((100 * completedSet.size) / moduleIds.length) : 0;

    await this.prisma.studentCourseProgress.upsert({
      where: { studentId_courseId: { studentId: user.id, courseId } },
      create: { studentId: user.id, courseId, progressPercent, lastOpenedAt: new Date() },
      update: { progressPercent, lastOpenedAt: new Date() }
    });

    return {
      course: {
        id: course.id,
        title: course.title,
        description: course.description,
        moduleCount: moduleIds.length,
        completedModuleCount: completedSet.size,
        progressPercent,
        lastOpenedAt: new Date().toISOString(),
        modules: course.modules.map((m) => this.toModuleSummary(m, completedSet.has(m.id)))
      }
    };
  }

  async completeModule(
    accessToken: string | undefined,
    courseId: string,
    moduleId: string
  ): Promise<CompleteCourseModuleResponse> {
    const user = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));

    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.status !== CourseStatus.PUBLISHED) {
      throw new NotFoundException("Course not found.");
    }
    const courseModule = await this.prisma.courseModule.findUnique({ where: { id: moduleId } });
    if (!courseModule || courseModule.courseId !== courseId) {
      throw new NotFoundException("Module not found.");
    }

    const progressPercent = await this.prisma.$transaction(async (tx) => {
      await tx.studentModuleProgress.upsert({
        where: { studentId_moduleId: { studentId: user.id, moduleId } },
        create: { studentId: user.id, moduleId },
        update: {}
      });

      const [totalModules, completedModules] = await Promise.all([
        tx.courseModule.count({ where: { courseId } }),
        tx.studentModuleProgress.count({
          where: { studentId: user.id, module: { courseId } }
        })
      ]);
      const percent = totalModules > 0 ? Math.round((100 * completedModules) / totalModules) : 0;

      await tx.studentCourseProgress.upsert({
        where: { studentId_courseId: { studentId: user.id, courseId } },
        create: { studentId: user.id, courseId, progressPercent: percent, lastOpenedAt: new Date() },
        update: { progressPercent: percent }
      });

      return percent;
    });

    return { completed: true, progressPercent };
  }

  private toModuleSummary(row: CourseModuleRow, completed: boolean): StudentCourseModuleSummary {
    const contentRef =
      row.contentType === "ASSIGNMENT" && row.assignment
        ? {
            assignment: {
              id: row.assignment.id,
              title: row.assignment.title,
              activityType: row.assignment.activityType,
              pgn: row.assignment.pgn
            },
            puzzle: null
          }
        : row.contentType === "PUZZLE" && row.puzzle
          ? {
              assignment: null,
              puzzle: {
                id: row.puzzle.id,
                title: row.puzzle.title,
                puzzleType: row.puzzle.puzzleType
              }
            }
          : null;
    if (!contentRef) {
      throw new NotFoundException("The content referenced by this module is no longer available.");
    }

    return {
      id: row.id,
      title: row.title,
      order: row.order,
      contentType: row.contentType,
      completed,
      ...contentRef
    };
  }
}
