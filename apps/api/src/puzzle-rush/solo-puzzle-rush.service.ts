import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  maxComboBonus,
  PUZZLE_RACER_CONFIG,
  PUZZLE_RUSH_GRACE_SECONDS,
  PUZZLE_STORM_CONFIG,
  puzzleRushPlayerMoves,
  type PuzzleRushMode,
  type PuzzleRushPuzzle,
  type ReportSoloRushProgressRequest,
  type ReportSoloRushProgressResponse,
  type SoloRushLeaderboard,
  type SoloRushOverview,
  type SoloRushPeriod,
  type SoloRushRun
} from "@nexa-chess/types";
import { Prisma, PuzzleRushMode as DbMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantFilter } from "../tenancy/tenant-sql";
import { assertStudent, authenticateUser, fullName } from "../puzzle/puzzle-auth.helper";
import { MIN_RUN_SIZE, selectPuzzleRushRun } from "./puzzle-rush-run";

const GRACE_MS = PUZZLE_RUSH_GRACE_SECONDS * 1000;
const LEADERBOARD_LIMIT = 50;
/** A student's runs open at once: older unfinished ones are closed when a new one starts. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type LeaderboardSqlRow = {
  studentId: string;
  firstName: string;
  lastName: string | null;
  score: number;
  moves: number;
  errors: number;
  bestCombo: number;
  achievedAt: Date;
};

/**
 * Puzzle Storm / Racer played alone from the student's practice page
 * (docs/PUZZLE_RUSH_SOLO.md). Same rules as the live-class round: the run is
 * frozen at start, moves are checked in the browser, the server clamps the
 * running totals to what the run and the clock allow and only moves them
 * forward. A batch leaderboard ranks each student's best finished run.
 */
@Injectable()
export class SoloPuzzleRushService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async overview(accessToken: string | undefined): Promise<SoloRushOverview> {
    const student = await this.getStudent(accessToken);
    const batches = await this.trainingBatches(student.id);
    const best = await this.prisma.soloPuzzleRushRun.groupBy({
      _max: { score: true },
      by: ["mode"],
      where: { finishedAt: { not: null }, studentId: student.id }
    });
    const bests = await Promise.all(
      best
        .filter((row) => row._max.score !== null)
        .map(async (row) => {
          const top = await this.prisma.soloPuzzleRushRun.findFirstOrThrow({
            orderBy: { finishedAt: "asc" },
            select: { finishedAt: true },
            where: { finishedAt: { not: null }, mode: row.mode, score: row._max.score!, studentId: student.id }
          });
          return {
            achievedAt: top.finishedAt!.toISOString(),
            mode: row.mode as PuzzleRushMode,
            score: row._max.score!
          };
        })
    );
    return { batches, bests, enabled: batches.length > 0 };
  }

  async start(accessToken: string | undefined, mode: PuzzleRushMode): Promise<SoloRushRun> {
    const student = await this.getStudent(accessToken);
    if ((await this.trainingBatches(student.id)).length === 0) {
      throw new ForbiddenException("Puzzle training isn't switched on for your batch yet — ask your coach.");
    }
    const puzzles = await selectPuzzleRushRun(this.prisma);
    if (puzzles.length < MIN_RUN_SIZE) {
      throw new ServiceUnavailableException(
        "The Lichess puzzle catalogue isn't loaded on this server, so there are no puzzles to play."
      );
    }

    const now = new Date();
    const racer = mode === "RACER";
    const startsAt = racer ? new Date(now.getTime() + PUZZLE_RACER_CONFIG.countdownSeconds * 1000) : now;
    const endsAt = racer ? new Date(startsAt.getTime() + PUZZLE_RACER_CONFIG.durationSeconds * 1000) : null;

    const run = await this.prisma.$transaction(async (tx) => {
      // An abandoned run never counts: it is closed where it stood.
      await tx.soloPuzzleRushRun.updateMany({
        data: { finishedAt: now, puzzles: [] },
        where: { finishedAt: null, studentId: student.id }
      });
      return tx.soloPuzzleRushRun.create({
        data: {
          endsAt,
          mode: racer ? DbMode.RACER : DbMode.STORM,
          puzzles: puzzles as unknown as Prisma.InputJsonValue,
          startsAt,
          studentId: student.id
        }
      });
    });

    return {
      endsAt: endsAt?.toISOString() ?? null,
      id: run.id,
      mode,
      puzzles,
      serverTime: now.toISOString(),
      startsAt: startsAt.toISOString()
    };
  }

  async reportProgress(
    accessToken: string | undefined,
    runId: string,
    dto: ReportSoloRushProgressRequest
  ): Promise<ReportSoloRushProgressResponse> {
    const student = await this.getStudent(accessToken);
    // Loaded through the student's own id: another student's run is a 404.
    const run = await this.prisma.soloPuzzleRushRun.findFirst({ where: { id: runId, studentId: student.id } });
    if (!run) throw new NotFoundException("Run not found.");
    if (run.finishedAt) {
      // A late duplicate of the final report is fine; anything else is a lost race.
      if (dto.finished) return { finished: true, score: run.score };
      throw new ConflictException("This run is already over.");
    }

    const now = new Date();
    if (run.endsAt && now.getTime() > run.endsAt.getTime() + GRACE_MS) {
      throw new ConflictException("The race is over.");
    }
    const puzzles = Array.isArray(run.puzzles) ? (run.puzzles as unknown as PuzzleRushPuzzle[]) : [];
    const totals = this.clamp(run.mode, puzzles, dto, run, now);

    const updated = await this.prisma.soloPuzzleRushRun.updateMany({
      data: {
        bestCombo: totals.bestCombo,
        clockEndsAt: totals.clockEndsAt,
        errors: totals.errors,
        finishedAt: totals.finishedAt,
        highestRating: totals.highestRating,
        moves: totals.moves,
        playedAt: totals.playedAt,
        puzzleIndex: totals.puzzleIndex,
        // Nothing more is read from a finished run.
        ...(totals.finishedAt ? { puzzles: [] } : {}),
        score: totals.score,
        skipsUsed: totals.skipsUsed,
        solved: totals.solved
      },
      // Forward only; a lost race (a newer report, or the run closed) changes nothing.
      where: { finishedAt: null, id: run.id, moves: { lte: totals.moves }, puzzleIndex: { lte: totals.puzzleIndex }, studentId: student.id }
    });
    if (updated.count === 0) {
      const current = await this.prisma.soloPuzzleRushRun.findFirstOrThrow({ where: { id: run.id } });
      return { finished: !!current.finishedAt, score: current.score };
    }
    return { finished: !!totals.finishedAt, score: totals.score };
  }

  async leaderboard(
    accessToken: string | undefined,
    query: { batchId: string; mode: PuzzleRushMode; period: SoloRushPeriod }
  ): Promise<SoloRushLeaderboard> {
    const student = await this.getStudent(accessToken);
    // Only a batch the student belongs to: anything else is not found.
    const batch = (await this.trainingBatches(student.id)).find((b) => b.id === query.batchId);
    if (!batch) throw new NotFoundException("Batch not found.");

    const since = query.period === "WEEK" ? new Date(Date.now() - WEEK_MS) : new Date(0);
    // `DISTINCT ON` keeps each student's best finished run (highest score, then
    // fewer errors, then the earliest). `tenantFilter` is the academy guard.
    const rows = await this.prisma.$queryRaw<LeaderboardSqlRow[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (r."studentId")
          r."studentId", u."firstName", u."lastName", r."score", r."moves", r."errors", r."bestCombo",
          r."finishedAt" AS "achievedAt"
        FROM solo_puzzle_rush_runs r
        JOIN users u ON u."id" = r."studentId"
        JOIN batch_students bs ON bs."studentId" = r."studentId" AND bs."batchId" = ${batch.id} AND bs."isDeleted" = false
        WHERE r."mode" = ${query.mode}::"PuzzleRushMode"
          AND r."finishedAt" IS NOT NULL
          AND r."finishedAt" >= ${since.toISOString()}::timestamp
          AND u."isDeleted" = false
          AND ${tenantFilter("r")}
        ORDER BY r."studentId", r."score" DESC, r."errors" ASC, r."finishedAt" ASC
      ) best
      ORDER BY best."score" DESC, best."errors" ASC, best."moves" DESC, best."achievedAt" ASC
      LIMIT ${LEADERBOARD_LIMIT}`;

    let rank = 0;
    return {
      batchId: batch.id,
      mode: query.mode,
      period: query.period,
      rows: rows.map((row, index) => {
        const prev = rows[index - 1];
        if (!prev || prev.score !== row.score || prev.errors !== row.errors) rank = index + 1;
        return {
          achievedAt: row.achievedAt.toISOString(),
          bestCombo: row.bestCombo,
          errors: row.errors,
          moves: row.moves,
          name: fullName(row) ?? "Student",
          rank,
          score: row.score,
          studentId: row.studentId
        };
      })
    };
  }

  // ── Internals ──

  private async getStudent(accessToken: string | undefined) {
    return assertStudent(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  /** Batches with training switched on (the same switch as rated puzzle training). */
  private async trainingBatches(studentId: string) {
    const rows = await this.prisma.batchStudent.findMany({
      include: { batch: { select: { id: true, name: true } } },
      orderBy: { enrolledAt: "asc" },
      where: { batch: { isDeleted: false, puzzleTrainingEnabled: true }, isDeleted: false, studentId }
    });
    return rows.map((row) => ({ id: row.batch.id, name: row.batch.name }));
  }

  /**
   * The totals as the run allows them — the same rules as the live-class
   * round: no more moves than the puzzles reached hold, a score no higher
   * than those moves could earn, a Storm clock no longer than 3:00 plus every
   * bonus those moves could have won, and nothing ever moves backwards.
   */
  private clamp(
    mode: DbMode,
    puzzles: PuzzleRushPuzzle[],
    dto: ReportSoloRushProgressRequest,
    prev: {
      bestCombo: number;
      errors: number;
      playedAt: Date | null;
      score: number;
      skipsUsed: number;
      solved: number;
    },
    now: Date
  ) {
    const puzzleIndex = Math.min(dto.puzzleIndex, puzzles.length);
    const reachable = puzzles.slice(0, Math.min(puzzles.length, puzzleIndex + 1));
    const moves = Math.min(
      dto.moves,
      reachable.reduce((sum, p) => sum + puzzleRushPlayerMoves(p), 0)
    );
    const solved = Math.min(dto.solved, puzzleIndex);
    const errors = Math.min(dto.errors, puzzleIndex - solved);
    const bestCombo = Math.min(dto.bestCombo, moves);
    const solvedRatings = puzzles.slice(0, puzzleIndex).map((p) => p.rating);
    const highestRating =
      dto.highestRating === null || solvedRatings.length === 0
        ? null
        : Math.min(dto.highestRating, Math.max(...solvedRatings));

    const playing = moves > 0 || puzzleIndex > 0;
    const playedAt = prev.playedAt ?? (playing ? now : null);
    let finished = dto.finished || (puzzles.length > 0 && puzzleIndex >= puzzles.length);

    let score: number;
    let clockEndsAt: Date | null = null;
    let skipsUsed = 0;
    if (mode === DbMode.STORM) {
      score = solved;
      if (playedAt) {
        const allowanceMs =
          (PUZZLE_STORM_CONFIG.initialSeconds + maxComboBonus(PUZZLE_STORM_CONFIG.combo, moves)) * 1000;
        const latest = playedAt.getTime() + allowanceMs + GRACE_MS;
        const reported = dto.clockEndsAt ? Date.parse(dto.clockEndsAt) : latest;
        clockEndsAt = new Date(Math.min(reported, latest));
        // A report after the clock ran out closes the run.
        if (now.getTime() > clockEndsAt.getTime() + GRACE_MS) finished = true;
      }
    } else {
      score = Math.min(dto.score, moves + maxComboBonus(PUZZLE_RACER_CONFIG.combo, moves));
      skipsUsed = Math.min(dto.skipsUsed, PUZZLE_RACER_CONFIG.skips);
    }

    return {
      bestCombo: Math.max(bestCombo, prev.bestCombo),
      clockEndsAt,
      errors: Math.max(errors, prev.errors),
      finishedAt: finished ? now : null,
      highestRating,
      moves,
      playedAt,
      puzzleIndex,
      score: Math.max(score, prev.score),
      skipsUsed: Math.max(skipsUsed, prev.skipsUsed),
      solved: Math.max(solved, prev.solved)
    };
  }
}
