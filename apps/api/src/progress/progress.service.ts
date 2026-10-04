import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  INITIAL_PUZZLE_RATING,
  liveStreak,
  type StudentProgressResponse
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { dateToDay, localDay } from "./progress-recorder.service";
import { authenticateUser } from "../auth/authenticate";

type AuthenticatedUser = { id: string; role: UserRole };

const HISTORY_POINTS = 100;
const RECENT_PUZZLES = 10;

@Injectable()
export class ProgressService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async getMine(accessToken: string | undefined): Promise<StudentProgressResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have progress.");
    return this.build(user.id);
  }

  /** Admins see any student; a coach only students in a batch they coach. */
  async getForStudent(accessToken: string | undefined, studentId: string): Promise<StudentProgressResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role === UserRole.STUDENT) {
      if (user.id !== studentId) throw new ForbiddenException("You can only view your own progress.");
    } else if (user.role === UserRole.COACH) {
      const shared = await this.prisma.batchStudent.findFirst({
        where: {
          isDeleted: false,
          studentId,
          batch: { isDeleted: false, coaches: { some: { coachId: user.id, isDeleted: false } } }
        },
        select: { id: true }
      });
      if (!shared) throw new ForbiddenException("This student isn't in any of your batches.");
    }
    return this.build(studentId);
  }

  private async build(studentId: string): Promise<StudentProgressResponse> {
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: UserRole.STUDENT },
      select: { firstName: true, lastName: true, timezone: true }
    });
    if (!student) throw new NotFoundException("Student not found.");

    const [row, history, recent, attempted, solved, assignments] = await Promise.all([
      this.prisma.studentProgress.findUnique({ where: { studentId } }),
      this.prisma.puzzleRatingChange.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: HISTORY_POINTS,
        select: { after: true, createdAt: true }
      }),
      this.prisma.puzzleAttempt.findMany({
        where: { studentId, completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        take: RECENT_PUZZLES,
        select: {
          completedAt: true,
          id: true,
          puzzle: { select: { difficulty: true, id: true, title: true } },
          status: true
        }
      }),
      this.prisma.puzzleAttempt.groupBy({
        by: ["puzzleId"],
        where: { studentId, completedAt: { not: null } }
      }),
      this.prisma.puzzleAttempt.groupBy({
        by: ["puzzleId"],
        where: { studentId, status: "SOLVED" }
      }),
      this.prisma.studentAssignment.aggregate({
        where: { studentId, status: "COMPLETED" },
        _avg: { bestScorePercent: true },
        _count: { _all: true }
      })
    ]);

    const changes = recent.length
      ? await this.prisma.puzzleRatingChange.findMany({
          where: { attemptId: { in: recent.map((a) => a.id) } },
          select: { after: true, attemptId: true, before: true }
        })
      : [];
    const changeByAttempt = new Map(changes.map((c) => [c.attemptId, c.after - c.before]));

    const lastActiveDay = dateToDay(row?.lastActiveDay ?? null);
    const avg = assignments._avg.bestScorePercent;

    return {
      progress: {
        assignmentsCompleted: assignments._count._all,
        averageAssignmentScore: avg === null ? null : Math.round(avg),
        currentStreak: liveStreak(row?.currentStreak ?? 0, lastActiveDay, localDay(student.timezone)),
        lastActiveDay,
        longestStreak: row?.longestStreak ?? 0,
        peakRating: row?.peakRating ?? INITIAL_PUZZLE_RATING,
        puzzleRating: row?.puzzleRating ?? INITIAL_PUZZLE_RATING,
        puzzlesAttempted: attempted.length,
        puzzlesSolved: solved.length,
        ratedPuzzles: row?.ratedPuzzles ?? 0,
        ratingHistory: history
          .reverse()
          .map((h) => ({ at: h.createdAt.toISOString(), rating: h.after })),
        recentPuzzles: recent.map((a) => ({
          at: (a.completedAt as Date).toISOString(),
          difficulty: a.puzzle.difficulty,
          puzzleId: a.puzzle.id,
          ratingChange: changeByAttempt.get(a.id) ?? null,
          solved: a.status === "SOLVED",
          title: a.puzzle.title
        })),
        studentId,
        studentName: `${student.firstName} ${student.lastName ?? ""}`.trim()
      }
    };
  }

  private getAuthenticatedUser(accessToken: string | undefined): Promise<AuthenticatedUser> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
