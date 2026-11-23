import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  INITIAL_PUZZLE_RATING,
  liveStreak,
  type StudentPlayingProfile,
  type StudentProgressResponse
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { dateToDay, localDay } from "./progress-recorder.service";
import { authenticateUser } from "../auth/authenticate";
import { assertCanViewStudent } from "./student-access";

type AuthenticatedUser = { id: string; role: UserRole };

const HISTORY_POINTS = 100;
const RECENT_PUZZLES = 10;

const playingProfileSelect = {
  chessRating: true,
  dateOfBirth: true,
  experienceLevel: true,
  id: true
} as const;

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
    await assertCanViewStudent(this.prisma, user, studentId);
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

  /** Rating, date of birth and level, as staff see them (review F1). */
  async getPlayingProfile(accessToken: string | undefined, studentId: string): Promise<StudentPlayingProfile> {
    const user = await this.getAuthenticatedUser(accessToken);
    await this.assertStaffForStudent(user, studentId);
    return this.toPlayingProfile(await this.loadPlayingProfile(studentId));
  }

  /**
   * Tournament entry, age groups and seeding read these three, so a student
   * can't set them on their own profile (review F1): an admin, or a coach of a
   * batch the student is in, does. Who changed which field, and when, goes in
   * the audit log; the values don't (a date of birth is a minor's personal data).
   */
  async updatePlayingProfile(
    accessToken: string | undefined,
    studentId: string,
    body: StudentPlayingProfile
  ): Promise<StudentPlayingProfile> {
    const user = await this.getAuthenticatedUser(accessToken);
    await this.assertStaffForStudent(user, studentId);
    const current = await this.loadPlayingProfile(studentId);

    const dateOfBirth = body.dateOfBirth ? new Date(`${body.dateOfBirth}T00:00:00.000Z`) : null;
    if (dateOfBirth && (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth.getTime() > Date.now())) {
      throw new BadRequestException("Enter a date of birth in the past.");
    }
    const before = this.toPlayingProfile(current);
    const changed = (["chessRating", "dateOfBirth", "experienceLevel"] as const).filter(
      (field) => before[field] !== body[field]
    );
    if (changed.length === 0) return before;

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.studentProfile.update({
        data: { chessRating: body.chessRating, dateOfBirth, experienceLevel: body.experienceLevel },
        select: playingProfileSelect,
        where: { id: current.id }
      });
      await tx.trashAuditLog.create({
        data: {
          action: "STUDENT_PLAYING_PROFILE_CHANGE",
          entity: "StudentProfile",
          entityId: studentId,
          metadata: { changed },
          userId: user.id
        }
      });
      return row;
    });
    return this.toPlayingProfile(updated);
  }

  private async assertStaffForStudent(user: AuthenticatedUser, studentId: string) {
    if (user.role === UserRole.STUDENT) {
      throw new ForbiddenException("Your coach or academy sets these details.");
    }
    await assertCanViewStudent(this.prisma, user, studentId);
  }

  private async loadPlayingProfile(studentId: string) {
    const profile = await this.prisma.studentProfile.findFirst({
      select: playingProfileSelect,
      where: { userId: studentId }
    });
    if (!profile) throw new NotFoundException("Student not found.");
    return profile;
  }

  private toPlayingProfile(row: {
    chessRating: number | null;
    dateOfBirth: Date | null;
    experienceLevel: StudentPlayingProfile["experienceLevel"];
  }): StudentPlayingProfile {
    return {
      chessRating: row.chessRating,
      // A date only, stored at UTC midnight.
      dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
      experienceLevel: row.experienceLevel
    };
  }

  private getAuthenticatedUser(accessToken: string | undefined): Promise<AuthenticatedUser> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
