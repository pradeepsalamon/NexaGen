import {
  addDays,
  buildWeeklyFacts,
  classRecapContentSchema,
  type WeeklyAttendance,
  type WeeklyFacts
} from "@nexa-chess/types";
import { AiPlayReviewStatus, ClassRecapStatus, PuzzleAttemptContext, PuzzleAttemptStatus } from "@prisma/client";
import { zonedDateToUtc } from "../common/time";
import { loadWeakSpotProfile } from "../play-review/weak-spot-profile";
import type { PrismaService } from "../prisma/prisma.service";

/** Puzzle of the Day days read back for the streak (more than any streak worth showing). */
const STREAK_LOOKBACK_DAYS = 400;

/** UTC instant of an academy-calendar day's midnight. */
export function academyMidnight(timeZone: string, day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return zonedDateToUtc(timeZone, y, m, d);
}

/**
 * Everything one week's facts are made of, for one student
 * (docs/WEEKLY_REPORTS.md § "The facts"), read inside the student's academy.
 * `now` decides which classes were held and which homework is still open; a
 * finished week is read as it stood at `now`.
 */
export async function loadWeeklyFacts(
  prisma: PrismaService,
  input: { studentId: string; weekStart: string; timeZone: string; now: Date }
): Promise<WeeklyFacts> {
  const { studentId, timeZone, weekStart, now } = input;
  const start = academyMidnight(timeZone, weekStart);
  const end = academyMidnight(timeZone, addDays(weekStart, 7));
  const previousStart = academyMidnight(timeZone, addDays(weekStart, -7));
  const weekEnd = addDays(weekStart, 6);
  const finishedIn = { gte: start, lt: end };

  const [classes, homework, puzzleAttempts, revisionReviews, rushRuns, dailyEntries, play, weakSpots] = await Promise.all([
    prisma.coachClass.findMany({
      orderBy: { startsAt: "asc" },
      select: {
        attendances: { select: { status: true }, where: { studentId } },
        classRecap: { select: { contentJson: true, status: true } },
        endsAt: true,
        startsAt: true,
        status: true,
        title: true,
        topic: true
      },
      where: {
        batch: { isDeleted: false, students: { some: { isDeleted: false, studentId } } },
        isDemo: false,
        startsAt: finishedIn
      }
    }),
    prisma.studentAssignment.findMany({
      select: { assignmentBatch: { select: { assignment: { select: { title: true } }, dueDate: true } }, completedAt: true },
      where: { assignmentBatch: { dueDate: finishedIn }, studentId }
    }),
    prisma.puzzleAttempt.findMany({
      select: { status: true },
      where: {
        completedAt: finishedIn,
        status: { in: [PuzzleAttemptStatus.SOLVED, PuzzleAttemptStatus.FAILED] },
        studentId
      }
    }),
    prisma.puzzleAttempt.count({
      where: { completedAt: finishedIn, context: PuzzleAttemptContext.REVISION, studentId }
    }),
    prisma.soloPuzzleRushRun.findMany({ select: { mode: true, score: true }, where: { finishedAt: finishedIn, studentId } }),
    prisma.dailyPuzzleEntry.findMany({
      distinct: ["day"],
      select: { day: true },
      where: {
        day: {
          gte: new Date(`${addDays(weekEnd, -STREAK_LOOKBACK_DAYS)}T00:00:00Z`),
          lte: new Date(`${weekEnd}T00:00:00Z`)
        },
        finishedAt: { not: null },
        studentId
      }
    }),
    prisma.aiPlayReview.findMany({
      select: { accuracy: true, playedAt: true },
      where: { playedAt: { gte: previousStart, lt: end }, status: AiPlayReviewStatus.DONE, studentId }
    }),
    // As the student would see it (only tips their academy read), on the week's last moment.
    loadWeakSpotProfile(prisma, studentId, { audience: "STUDENT", now: new Date(Math.min(now.getTime(), end.getTime())) })
  ]);

  return buildWeeklyFacts({
    classes: classes.map((c) => ({
      attendance: (c.attendances[0]?.status ?? null) as WeeklyAttendance,
      endsAt: c.endsAt.toISOString(),
      startsAt: c.startsAt.toISOString(),
      status: c.status,
      title: c.title,
      topic: c.topic
    })),
    dailyPuzzleDays: dailyEntries.map((e) => e.day.toISOString().slice(0, 10)),
    homework: homework.map((h) => ({
      completedAt: h.completedAt ? h.completedAt.toISOString() : null,
      dueDate: h.assignmentBatch.dueDate.toISOString(),
      title: h.assignmentBatch.assignment.title
    })),
    now: now.toISOString(),
    playLastWeek: play.filter((p) => p.playedAt < start).map((p) => p.accuracy),
    playThisWeek: play.filter((p) => p.playedAt >= start).map((p) => p.accuracy),
    puzzleAttempts: puzzleAttempts.map((a) => ({ solved: a.status === PuzzleAttemptStatus.SOLVED })),
    // Only what students can already read: published recaps' key points.
    recapKeyPoints: classes
      .filter((c) => c.classRecap?.status === ClassRecapStatus.PUBLISHED)
      .map((c) => {
        const parsed = classRecapContentSchema.safeParse(c.classRecap?.contentJson);
        return parsed.success ? parsed.data.keyPoints : [];
      }),
    revisionReviews,
    rushRuns: rushRuns.map((r) => ({ mode: r.mode, score: r.score })),
    timeZone,
    weakSpots,
    weekStart
  });
}
