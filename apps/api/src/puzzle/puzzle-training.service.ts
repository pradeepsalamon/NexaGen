import { createHash } from "node:crypto";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  INITIAL_PUZZLE_RATING,
  TRAINING_SLOT_CYCLE,
  lichessThemeLabel,
  liveStreak,
  planTrainingPick,
  puzzleOpponentRating,
  trainingBandOrder,
  type PuzzleTrainingNextRequest,
  type PuzzleTrainingNextResponse,
  type PuzzleTrainingPick,
  type PuzzleTrainingSlot,
  type PuzzleTrainingStatusResponse,
  type TrainingPlan,
  type TrainingResult
} from "@nexa-chess/types";
import {
  Prisma,
  PuzzleAttemptContext,
  PuzzleStatus,
  PuzzleVisibility,
  type User
} from "@prisma/client";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import { ProgressRecorderService, dateToDay, localDay } from "../progress/progress-recorder.service";
import { PuzzleCatalogService } from "./puzzle-catalog.service";
import { assertStudent, authenticateUser } from "./puzzle-auth.helper";

// ──────────────────────────────────────────────────────────────
// Student rated puzzle training (spec §12): one puzzle at a time near the
// student's rating, a healthy mix chosen by the pure policy in
// @nexa-chess/types (puzzle-training.ts). Solving runs on the ordinary attempt
// routes — this service only picks the puzzle and opens a TRAINING attempt,
// which PuzzleAttemptService.start then resumes.
// ──────────────────────────────────────────────────────────────

/** A just-served puzzle with no moves is handed back, not skipped (double click / refresh). */
const FRESH_PICK_MS = 30_000;
const RECENT_LIMIT = 200;
const STATUS_RECENT = 10;
/** REVIEW: a failed puzzle comes back after this long, at most this many tries in all. */
const REVIEW_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const REVIEW_MAX_TRIES = 3;
/** Catalogue walk (§6/§7): rows per batch, batches per band. */
const WALK_BATCH = 30;
const WALK_BATCHES = 5;
const STATEMENT_TIMEOUT = "3s";
/** Library fallback: pick at random among this many closest-rated candidates. */
const LIBRARY_SHORTLIST = 5;

type WalkRow = { id: string; rating: number; randKey: number; contentHash: string };
type Seen = { puzzleIds: Set<string>; hashes: Set<string> };

const pickInclude = {
  puzzle: { select: { difficulty: true, rating: true, tags: true } }
} satisfies Prisma.PuzzleAttemptInclude;
type AttemptWithPuzzle = Prisma.PuzzleAttemptGetPayload<{ include: typeof pickInclude }>;

/** First 31 bits of sha1 — deterministic per request, different every request (§7). */
export function trainingStartKey(studentId: string, trainingCount: number): number {
  return parseInt(createHash("sha1").update(`${studentId}:${trainingCount}`).digest("hex").slice(0, 8), 16) >>> 1;
}

@Injectable()
export class PuzzleTrainingService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly catalog: PuzzleCatalogService,
    private readonly progress: ProgressRecorderService
  ) {}

  async status(accessToken: string | undefined): Promise<PuzzleTrainingStatusResponse> {
    const student = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const { start } = zonedDayBounds(student.timezone);

    const [enabled, row, open, recent, trainedToday, trainedTotal] = await Promise.all([
      this.trainingAllowed(student.id),
      this.prisma.studentProgress.findUnique({ where: { studentId: student.id } }),
      this.openAttempt(student.id),
      this.prisma.puzzleAttempt.findMany({
        where: { context: PuzzleAttemptContext.TRAINING, completedAt: { not: null }, studentId: student.id },
        include: pickInclude,
        orderBy: { completedAt: "desc" },
        take: STATUS_RECENT
      }),
      this.prisma.puzzleAttempt.count({
        where: { context: PuzzleAttemptContext.TRAINING, completedAt: { gte: start }, studentId: student.id }
      }),
      this.prisma.puzzleAttempt.count({
        where: { context: PuzzleAttemptContext.TRAINING, completedAt: { not: null }, studentId: student.id }
      })
    ]);

    const changes = await this.prisma.puzzleRatingChange.findMany({
      where: { attemptId: { in: recent.map((a) => a.id) } },
      select: { after: true, attemptId: true, before: true }
    });
    const changeByAttempt = new Map(changes.map((c) => [c.attemptId, c.after - c.before]));

    return {
      currentStreak: row
        ? liveStreak(row.currentStreak, dateToDay(row.lastActiveDay), localDay(student.timezone))
        : 0,
      current: open ? this.toPick(open, null, null) : null,
      enabled,
      peakRating: row?.peakRating ?? INITIAL_PUZZLE_RATING,
      ratedPuzzles: row?.ratedPuzzles ?? 0,
      rating: row?.puzzleRating ?? INITIAL_PUZZLE_RATING,
      recent: recent.map((a) => ({
        attemptId: a.id,
        completedAt: (a.completedAt as Date).toISOString(),
        puzzleId: a.puzzleId,
        puzzleRating: puzzleOpponentRating(a.puzzle),
        ratingChange: changeByAttempt.get(a.id) ?? null,
        solved: a.status === "SOLVED"
      })),
      trainedToday,
      trainedTotal
    };
  }

  async next(accessToken: string | undefined, dto: PuzzleTrainingNextRequest): Promise<PuzzleTrainingNextResponse> {
    const student = assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));
    if (!(await this.trainingAllowed(student.id))) {
      throw new ForbiddenException("Puzzle training isn't switched on for your batch yet — ask your coach.");
    }

    const open = await this.openAttempt(student.id);
    if (open) {
      const untouched = !Array.isArray(open.movesJson) || open.movesJson.length === 0;
      if (untouched && open.wrongMoves === 0 && Date.now() - open.startedAt.getTime() < FRESH_PICK_MS) {
        return { pick: this.toPick(open, null, null) };
      }
      await this.closeAsMiss(open);
    }

    const [row, trainingCount, recentRows] = await Promise.all([
      this.prisma.studentProgress.findUnique({ where: { studentId: student.id }, select: { puzzleRating: true } }),
      this.prisma.puzzleAttempt.count({ where: { context: PuzzleAttemptContext.TRAINING, studentId: student.id } }),
      this.prisma.puzzleAttempt.findMany({
        where: { completedAt: { not: null }, status: { in: ["SOLVED", "FAILED"] }, studentId: student.id },
        include: pickInclude,
        orderBy: { completedAt: "desc" },
        take: RECENT_LIMIT
      })
    ]);
    const recentAll: TrainingResult[] = recentRows.map((a) => ({
      completedAt: (a.completedAt as Date).toISOString(),
      hintsUsed: a.hintsUsed,
      solved: a.status === "SOLVED",
      themes: a.puzzle.tags,
      wrongMoves: a.wrongMoves
    }));
    const recentTraining = recentAll.filter((_, i) => recentRows[i].context === PuzzleAttemptContext.TRAINING);

    const reviewPuzzleId =
      !dto.theme && TRAINING_SLOT_CYCLE[trainingCount % 10] === "REVIEW"
        ? await this.findReviewPuzzle(student)
        : null;

    const plan = planTrainingPick({
      rating: row?.puzzleRating ?? INITIAL_PUZZLE_RATING,
      recentAll,
      recentTraining,
      requestedTheme: dto.theme ?? null,
      reviewDue: !!reviewPuzzleId,
      trainingCount
    });

    const startKey = trainingStartKey(student.id, trainingCount);
    let picked: { puzzleId: string; plan: TrainingPlan } | null = null;
    if (plan.slot === "REVIEW" && reviewPuzzleId) {
      picked = { plan, puzzleId: reviewPuzzleId };
    } else {
      const seen = await this.seenSet(student.id);
      // A themed pick that finds nothing becomes a mixed one (§7).
      const attempts: TrainingPlan[] = plan.theme ? [plan, { ...plan, slot: "MIXED", theme: null }] : [plan];
      for (const attemptPlan of attempts) {
        const puzzleId =
          (await this.pickFromCatalogue(student, attemptPlan, seen, startKey)) ??
          (await this.pickFromLibrary(student, attemptPlan, seen, startKey));
        if (puzzleId) {
          picked = { plan: attemptPlan, puzzleId };
          break;
        }
      }
    }
    if (!picked) {
      throw new NotFoundException("There are no new puzzles for you right now — check back soon.");
    }

    const attempt = await this.openTrainingAttempt(student.id, picked.puzzleId);
    return { pick: this.toPick(attempt, picked.plan.slot, picked.plan.theme) };
  }

  // ── internals ──

  /** D0: at least one of the student's live batches allows training. */
  private async trainingAllowed(studentId: string): Promise<boolean> {
    const membership = await this.prisma.batchStudent.findFirst({
      where: { batch: { isDeleted: false, puzzleTrainingEnabled: true }, isDeleted: false, studentId },
      select: { id: true }
    });
    return !!membership;
  }

  private openAttempt(studentId: string): Promise<AttemptWithPuzzle | null> {
    return this.prisma.puzzleAttempt.findFirst({
      where: { context: PuzzleAttemptContext.TRAINING, status: "IN_PROGRESS", studentId },
      include: pickInclude,
      orderBy: { startedAt: "desc" }
    });
  }

  /** Skipping (or abandoning) a training puzzle counts as a miss, like Lichess. */
  private async closeAsMiss(attempt: AttemptWithPuzzle): Promise<void> {
    const claimed = await this.prisma.puzzleAttempt.updateMany({
      where: { id: attempt.id, status: "IN_PROGRESS" },
      data: {
        accuracyPercent: 0,
        completedAt: new Date(),
        result: "FAILED",
        scorePercent: 0,
        status: "FAILED"
      }
    });
    if (claimed.count === 0) return;
    // Awaited (it never throws), so the next pick already sees the new rating.
    await this.progress.recordPuzzleResult({
      attemptId: attempt.id,
      difficulty: attempt.puzzle.difficulty,
      hintsUsed: attempt.hintsUsed,
      puzzleId: attempt.puzzleId,
      rating: attempt.puzzle.rating,
      solved: false,
      studentId: attempt.studentId,
      wrongMoves: attempt.wrongMoves
    });
  }

  /** Everything the student has ever opened, by id and by content (§7). */
  private async seenSet(studentId: string): Promise<Seen> {
    const rows = await this.prisma.puzzleAttempt.findMany({
      where: { studentId },
      distinct: ["puzzleId"],
      select: { puzzle: { select: { contentHash: true } }, puzzleId: true }
    });
    return {
      hashes: new Set(rows.map((r) => r.puzzle.contentHash).filter((h): h is string => !!h)),
      puzzleIds: new Set(rows.map((r) => r.puzzleId))
    };
  }

  /**
   * §7 selection loop over the Lichess catalogue: the target band first, then
   * its neighbours, each walked from a per-request random start. Null when the
   * catalogue isn't loaded or has nothing new here.
   */
  private async pickFromCatalogue(student: User, plan: TrainingPlan, seen: Seen, startKey: number): Promise<string | null> {
    for (const band of trainingBandOrder(plan.targetRating)) {
      let cursor = { id: "", randKey: startKey };
      let wrapped = false;
      for (let batch = 0; batch < WALK_BATCHES; batch += 1) {
        const rows = await this.walk(band, cursor, plan.theme);
        if (rows.length === 0) {
          if (wrapped) break;
          wrapped = true;
          cursor = { id: "", randKey: 0 };
          continue;
        }
        for (const row of rows) {
          if (seen.hashes.has(row.contentHash)) continue;
          const result = await this.catalog.materialise(row.id, {
            createdBy: null,
            topicId: () => this.catalog.ensureLichessFolder(student.id)
          });
          // A copy an admin archived, unpublished or trashed is skipped (§7).
          if (result.outcome !== "CREATED" && result.outcome !== "EXISTING") continue;
          if (result.puzzle.status !== PuzzleStatus.PUBLISHED || seen.puzzleIds.has(result.puzzle.id)) continue;
          return result.puzzle.id;
        }
        const last = rows[rows.length - 1];
        cursor = { id: last.id, randKey: last.randKey };
        // Back past where this request started: the band is exhausted.
        if (wrapped && cursor.randKey >= startKey) break;
      }
    }
    return null;
  }

  private async walk(band: number, cursor: { randKey: number; id: string }, theme: string | null): Promise<WalkRow[]> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
        // Same reason as the browse (puzzle-catalog.service.ts): keep the band bounds visible to the planner.
        await tx.$executeRawUnsafe(`SET LOCAL plan_cache_mode = force_custom_plan`);
        // Two fixed statements: a `($theme IS NULL OR …)` would hide the theme from the planner.
        return theme
          ? tx.$queryRaw<WalkRow[]>`
              SELECT id, rating, "randKey", "contentHash" FROM lichess_puzzles
              WHERE "ratingBand" = ${band}::smallint
                AND ("ratingBand", "randKey", id) > (${band}::smallint, ${cursor.randKey}::int, ${cursor.id}::text)
                AND "passesQualityGate"
                AND themes @> ARRAY[${theme}]::text[]
              ORDER BY "ratingBand", "randKey", id
              LIMIT ${WALK_BATCH}`
          : tx.$queryRaw<WalkRow[]>`
              SELECT id, rating, "randKey", "contentHash" FROM lichess_puzzles
              WHERE "ratingBand" = ${band}::smallint
                AND ("ratingBand", "randKey", id) > (${band}::smallint, ${cursor.randKey}::int, ${cursor.id}::text)
                AND "passesQualityGate"
              ORDER BY "ratingBand", "randKey", id
              LIMIT ${WALK_BATCH}`;
      });
    } catch {
      // A slow walk is "nothing here" — the next band or the library still answers.
      return [];
    }
  }

  /**
   * The academy's own published puzzles the student may open, closest to the
   * target rating first. Covers a box with no catalogue loaded, and keeps
   * curated puzzles in the mix.
   */
  private async pickFromLibrary(student: User, plan: TrainingPlan, seen: Seen, startKey: number): Promise<string | null> {
    const candidates = await this.prisma.puzzle.findMany({
      where: {
        ...(await this.visibleTo(student)),
        id: { notIn: [...seen.puzzleIds] },
        ...(plan.theme ? { tags: { has: plan.theme } } : {})
      },
      select: { contentHash: true, difficulty: true, id: true, rating: true, solutionMovesJson: true },
      take: 500
    });
    const usable = candidates
      .filter((p) => !(p.contentHash && seen.hashes.has(p.contentHash)))
      .filter((p) => Array.isArray(p.solutionMovesJson) && p.solutionMovesJson.length > 0)
      .map((p) => ({ distance: Math.abs(puzzleOpponentRating(p) - plan.targetRating), id: p.id }))
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
      .slice(0, LIBRARY_SHORTLIST);
    if (usable.length === 0) return null;
    return usable[startKey % usable.length].id;
  }

  /** Same rule as the student library (PuzzleAttemptService): published GLOBAL, or PRIVATE by one of their coaches. */
  private async visibleTo(student: User): Promise<Prisma.PuzzleWhereInput> {
    const rows = await this.prisma.batchStudent.findMany({
      where: { isDeleted: false, studentId: student.id },
      select: { batch: { select: { coaches: { where: { isDeleted: false }, select: { coachId: true } } } } }
    });
    const coachIds = [...new Set(rows.flatMap((r) => r.batch.coaches.map((c) => c.coachId)))];
    return {
      status: PuzzleStatus.PUBLISHED,
      OR: [
        { visibility: PuzzleVisibility.GLOBAL },
        ...(coachIds.length ? [{ createdById: { in: coachIds }, visibility: PuzzleVisibility.PRIVATE }] : [])
      ]
    };
  }

  /**
   * REVIEW: the oldest puzzle the student failed at least three days ago,
   * never solved, tried fewer than three times, and still open to them.
   */
  private async findReviewPuzzle(student: User): Promise<string | null> {
    const failed = await this.prisma.puzzleAttempt.findMany({
      where: {
        completedAt: { lte: new Date(Date.now() - REVIEW_AFTER_MS) },
        status: "FAILED",
        studentAssignmentId: null,
        studentId: student.id
      },
      distinct: ["puzzleId"],
      orderBy: { completedAt: "asc" },
      select: { puzzleId: true },
      take: 50
    });
    if (failed.length === 0) return null;
    const ids = failed.map((f) => f.puzzleId);
    const [solved, tries, open] = await Promise.all([
      this.prisma.puzzleAttempt.findMany({
        where: { puzzleId: { in: ids }, status: "SOLVED", studentId: student.id },
        distinct: ["puzzleId"],
        select: { puzzleId: true }
      }),
      this.prisma.puzzleAttempt.groupBy({
        by: ["puzzleId"],
        where: { puzzleId: { in: ids }, studentId: student.id },
        _count: { _all: true }
      }),
      this.prisma.puzzle.findMany({
        where: { ...(await this.visibleTo(student)), id: { in: ids } },
        select: { id: true }
      })
    ]);
    const solvedIds = new Set(solved.map((s) => s.puzzleId));
    const triesById = new Map(tries.map((t) => [t.puzzleId, t._count._all]));
    const openIds = new Set(open.map((p) => p.id));
    return (
      ids.find((id) => !solvedIds.has(id) && (triesById.get(id) ?? 0) < REVIEW_MAX_TRIES && openIds.has(id)) ?? null
    );
  }

  private async openTrainingAttempt(studentId: string, puzzleId: string, retried = false): Promise<AttemptWithPuzzle> {
    const count = await this.prisma.puzzleAttempt.count({ where: { puzzleId, studentId } });
    try {
      return await this.prisma.puzzleAttempt.create({
        data: {
          attemptNumber: count + 1,
          context: PuzzleAttemptContext.TRAINING,
          puzzleId,
          studentId
        },
        include: pickInclude
      });
    } catch (error) {
      // A concurrent start took this attempt number: count again.
      if (!retried && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.openTrainingAttempt(studentId, puzzleId, true);
      }
      throw error;
    }
  }

  private toPick(attempt: AttemptWithPuzzle, slot: PuzzleTrainingSlot | null, theme: string | null): PuzzleTrainingPick {
    return {
      attemptId: attempt.id,
      puzzleId: attempt.puzzleId,
      puzzleRating: puzzleOpponentRating(attempt.puzzle),
      slot,
      theme,
      themeLabel: theme ? lichessThemeLabel(theme) : null,
      themes: attempt.puzzle.tags
    };
  }
}
