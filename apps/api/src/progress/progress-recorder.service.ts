import { Injectable, Logger } from "@nestjs/common";
import {
  nextPuzzleRating,
  nextStreak,
  puzzleOpponentRating,
  puzzleResultScore,
  type PuzzleDifficulty
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { zonedYmd } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";

export type PuzzleResultInput = {
  studentId: string;
  puzzleId: string;
  attemptId: string;
  difficulty: PuzzleDifficulty;
  /** The puzzle's own rating; null ⇒ its difficulty bucket. */
  rating: number | null;
  solved: boolean;
  hintsUsed: number;
  /** Server-counted in PuzzleAttemptService.saveProgress. */
  wrongMoves: number;
};

export function localDay(timeZone: string | null | undefined, ref = new Date()): string {
  const { year, month, day } = zonedYmd(timeZone, ref);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export const dayToDate = (day: string) => new Date(`${day}T00:00:00Z`);
export const dateToDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

/**
 * Writes a student's puzzle rating and practice streak. Callers fire and
 * forget: progress is a side effect of a submit and must never fail one, so
 * every public method swallows (and logs) its own errors.
 */
@Injectable()
export class ProgressRecorderService {
  private readonly logger = new Logger(ProgressRecorderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordPuzzleResult(input: PuzzleResultInput): Promise<void> {
    try {
      await this.update(input.studentId, input);
    } catch (error) {
      this.logger.warn(`Puzzle progress not recorded for ${input.studentId}: ${String(error)}`);
    }
  }

  /** Any finished practice (an assignment attempt) keeps the streak alive. */
  async recordPractice(studentId: string): Promise<void> {
    try {
      await this.update(studentId, null);
    } catch (error) {
      this.logger.warn(`Practice streak not recorded for ${studentId}: ${String(error)}`);
    }
  }

  private async update(studentId: string, puzzle: PuzzleResultInput | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { timezone: true }
    });
    const today = localDay(user?.timezone);

    try {
      await this.prisma.studentProgress.create({ data: { studentId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }

    await this.prisma.$transaction(async (tx) => {
      // Serialise concurrent submits by the same student.
      await tx.$queryRaw`SELECT 1 FROM "student_progress" WHERE "studentId" = ${studentId} FOR UPDATE`;
      const row = await tx.studentProgress.findUniqueOrThrow({ where: { studentId } });

      let { puzzleRating, peakRating, ratedPuzzles } = row;
      if (puzzle) {
        const alreadyRated = await tx.puzzleRatingChange.findUnique({
          where: { studentId_puzzleId: { puzzleId: puzzle.puzzleId, studentId } },
          select: { id: true }
        });
        if (!alreadyRated) {
          const opponentRating = puzzleOpponentRating(puzzle);
          const after = nextPuzzleRating({
            opponentRating,
            rating: puzzleRating,
            ratedPuzzles,
            score: puzzleResultScore(puzzle.solved, puzzle.hintsUsed, puzzle.wrongMoves)
          });
          await tx.puzzleRatingChange.create({
            data: {
              after,
              attemptId: puzzle.attemptId,
              before: puzzleRating,
              puzzleId: puzzle.puzzleId,
              puzzleRating: opponentRating,
              studentId
            }
          });
          puzzleRating = after;
          peakRating = Math.max(peakRating, after);
          ratedPuzzles += 1;
        }
      }

      const currentStreak = nextStreak(row.currentStreak, dateToDay(row.lastActiveDay), today);
      await tx.studentProgress.update({
        where: { studentId },
        data: {
          currentStreak,
          lastActiveDay: dayToDate(today),
          longestStreak: Math.max(row.longestStreak, currentStreak),
          peakRating,
          puzzleRating,
          ratedPuzzles
        }
      });
    });
  }
}
