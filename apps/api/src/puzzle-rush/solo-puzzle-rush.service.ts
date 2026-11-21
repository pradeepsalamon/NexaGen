import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  BATCH_BATTLE_MIN_PLAYERS,
  batchTakesPartInBattles,
  type BatchBattleSettings,
  maxComboBonus,
  PUZZLE_RACER_CONFIG,
  PUZZLE_RUSH_GRACE_SECONDS,
  PUZZLE_STORM_CONFIG,
  puzzleRushPlayerMoves,
  type PuzzleRushMode,
  type PuzzleRushPuzzle,
  type ReportSoloRushProgressRequest,
  type ReportSoloRushProgressResponse,
  type SoloRushBatchBattleRow,
  type SoloRushBatchBattlesLeaderboard,
  type SoloRushMyBattleBatch,
  type SoloRushLeaderboard,
  type SoloRushOverview,
  type SoloRushPeriod,
  type SoloRushRun,
  type UpdateBatchBattleSettingsRequest
} from "@nexa-chess/types";
import { BatchType, Prisma, PuzzleRushMode as DbMode, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantFilter } from "../tenancy/tenant-sql";
import { assertStudent, authenticateUser, isAdminRole } from "../puzzle/puzzle-auth.helper";
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

/** One ACTIVE training batch of the academy and its players' best runs in the period. */
export type BatchBattleSqlRow = {
  batchId: string;
  batchName: string;
  batchType: BatchType | null;
  battlesEnabled: boolean | null;
  battlesShowNames: boolean;
  rosterSize: number;
  players: number;
  avgScore: number | null;
  topFirstName: string | null;
  topLastName: string | null;
  topScore: number | null;
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
    const [bests, weekBests] = await Promise.all([
      this.bestsSince(student.id, null),
      // The same 7-day window as the leaderboard's "this week".
      this.bestsSince(student.id, new Date(Date.now() - WEEK_MS))
    ]);
    return { batches, bests, enabled: batches.length > 0, weekBests };
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
          // Students are minors: first name and last initial only (owner's call, 2026-11-16).
          name: leaderboardName(row),
          rank,
          score: row.score,
          studentId: row.studentId
        };
      })
    };
  }

  /**
   * Batch Battles: the academy's ACTIVE training batches that take part
   * (`batchTakesPartInBattles`), ranked by the average of their players' best
   * finished runs in the period. A batch needs `BATCH_BATTLE_MIN_PLAYERS`
   * players to get a rank. A top player's name is shown only for the viewer's
   * own batch or a batch whose admin/coach turned names on (students are minors).
   */
  async batchBattles(
    accessToken: string | undefined,
    query: { mode: PuzzleRushMode; period: SoloRushPeriod }
  ): Promise<SoloRushBatchBattlesLeaderboard> {
    const student = await this.getStudent(accessToken);
    const myBatches = await this.trainingBatches(student.id);
    if (myBatches.length === 0) {
      throw new ForbiddenException("Puzzle training isn't switched on for your batch yet — ask your coach.");
    }

    const since = query.period === "WEEK" ? new Date(Date.now() - WEEK_MS) : new Date(0);
    const [rows, myBest] = await Promise.all([
      // `roster` is every enrolled student of a candidate batch; `best` is each
      // of those students' best finished run (highest score, then fewer errors,
      // then the earliest) — one run counts for every batch the student is in.
      // `tenantFilter` is the academy guard on both driving tables.
      this.prisma.$queryRaw<BatchBattleSqlRow[]>`
        WITH candidate AS (
          SELECT b."id", b."name", b."batchType", b."battlesEnabled", b."battlesShowNames"
          FROM batches b
          WHERE b."isDeleted" = false
            AND b."status" = 'ACTIVE'
            AND b."puzzleTrainingEnabled" = true
            AND ${tenantFilter("b")}
        ),
        roster AS (
          SELECT bs."batchId", bs."studentId"
          FROM batch_students bs
          JOIN candidate c ON c."id" = bs."batchId"
          WHERE bs."isDeleted" = false
        ),
        best AS (
          SELECT DISTINCT ON (r."studentId") r."studentId", r."score", r."errors", r."finishedAt"
          FROM solo_puzzle_rush_runs r
          JOIN users u ON u."id" = r."studentId" AND u."isDeleted" = false
          WHERE r."mode" = ${query.mode}::"PuzzleRushMode"
            AND r."finishedAt" IS NOT NULL
            AND r."finishedAt" >= ${since.toISOString()}::timestamp
            AND r."studentId" IN (SELECT "studentId" FROM roster)
            AND ${tenantFilter("r")}
          ORDER BY r."studentId", r."score" DESC, r."errors" ASC, r."finishedAt" ASC
        ),
        scored AS (
          SELECT ro."batchId", be."studentId", be."score", be."errors", be."finishedAt"
          FROM roster ro
          JOIN best be ON be."studentId" = ro."studentId"
        ),
        top_player AS (
          SELECT DISTINCT ON (s."batchId") s."batchId", u."firstName", u."lastName", s."score"
          FROM scored s
          JOIN users u ON u."id" = s."studentId"
          ORDER BY s."batchId", s."score" DESC, s."errors" ASC, s."finishedAt" ASC
        )
        SELECT
          c."id" AS "batchId",
          c."name" AS "batchName",
          c."batchType"::text AS "batchType",
          c."battlesEnabled",
          c."battlesShowNames",
          (SELECT COUNT(*) FROM roster ro WHERE ro."batchId" = c."id")::int AS "rosterSize",
          (SELECT COUNT(*) FROM scored s WHERE s."batchId" = c."id")::int AS "players",
          (SELECT ROUND(AVG(s."score")::numeric, 1)::float FROM scored s WHERE s."batchId" = c."id") AS "avgScore",
          tp."firstName" AS "topFirstName",
          tp."lastName" AS "topLastName",
          tp."score" AS "topScore"
        FROM candidate c
        LEFT JOIN top_player tp ON tp."batchId" = c."id"`,
      this.prisma.soloPuzzleRushRun.aggregate({
        _max: { score: true },
        where: { finishedAt: { gte: since }, mode: query.mode as DbMode, studentId: student.id }
      })
    ]);

    return {
      ...rankBatchBattles(rows, new Set(myBatches.map((b) => b.id))),
      mode: query.mode,
      myBest: myBest._max.score,
      period: query.period
    };
  }

  /**
   * A batch's Batch Battles settings: an admin for any batch of the academy, a
   * coach only for a batch they are assigned to (anything else is not found).
   */
  async updateBattleSettings(
    accessToken: string | undefined,
    batchId: string,
    dto: UpdateBatchBattleSettingsRequest
  ): Promise<BatchBattleSettings> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const admin = isAdminRole(user.role);
    if (!admin && user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only admins and the batch's coaches can change Batch Battles.");
    }
    const where: Prisma.BatchWhereInput = admin
      ? { id: batchId, isDeleted: false }
      : { coaches: { some: { coachId: user.id, isDeleted: false } }, id: batchId, isDeleted: false };
    const batch = await this.prisma.batch.findFirst({ select: { id: true }, where });
    if (!batch) throw new NotFoundException("Batch not found.");

    const updated = await this.prisma.batch.update({
      data: { battlesEnabled: dto.battlesEnabled, battlesShowNames: dto.battlesShowNames },
      select: {
        _count: { select: { students: { where: { isDeleted: false } } } },
        batchType: true,
        battlesEnabled: true,
        battlesShowNames: true,
        id: true
      },
      where: { id: batch.id }
    });
    return {
      batchId: updated.id,
      battlesEnabled: updated.battlesEnabled,
      battlesShowNames: updated.battlesShowNames,
      takesPart: batchTakesPartInBattles({
        batchType: updated.batchType,
        battlesEnabled: updated.battlesEnabled,
        studentCount: updated._count.students
      })
    };
  }

  // ── Internals ──

  /** The student's best finished score per mode (the earliest run reaching it), since `since` or ever. */
  private async bestsSince(studentId: string, since: Date | null) {
    const finishedAt = since ? { gte: since } : { not: null };
    const best = await this.prisma.soloPuzzleRushRun.groupBy({
      _max: { score: true },
      by: ["mode"],
      where: { finishedAt, studentId }
    });
    return Promise.all(
      best
        .filter((row) => row._max.score !== null)
        .map(async (row) => {
          const top = await this.prisma.soloPuzzleRushRun.findFirstOrThrow({
            orderBy: { finishedAt: "asc" },
            select: { finishedAt: true },
            where: { finishedAt, mode: row.mode, score: row._max.score!, studentId }
          });
          return {
            achievedAt: top.finishedAt!.toISOString(),
            mode: row.mode as PuzzleRushMode,
            score: row._max.score!
          };
        })
    );
  }

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

/** "Arjun K.": first name and the last name's initial, never the full surname. */
export function leaderboardName(user: { firstName: string; lastName: string | null }): string {
  const first = user.firstName.trim();
  const initial = user.lastName?.trim().charAt(0).toUpperCase();
  const name = [first, initial ? `${initial}.` : ""].filter(Boolean).join(" ");
  return name || "Student";
}

/**
 * Ranks Batch Battles rows: batches that take part and have at least
 * `BATCH_BATTLE_MIN_PLAYERS` players, by average (ties share a rank), then the
 * ones still short of players (unranked). Batches nobody played in are left
 * off the board; the viewer's own batches always come back in `myBatches`.
 */
export function rankBatchBattles(
  rows: BatchBattleSqlRow[],
  myBatchIds: Set<string>
): { minPlayers: number; myBatches: SoloRushMyBattleBatch[]; rows: SoloRushBatchBattleRow[] } {
  const competing = rows.filter((row) =>
    batchTakesPartInBattles({ batchType: row.batchType, battlesEnabled: row.battlesEnabled, studentCount: row.rosterSize })
  );
  const competingIds = new Set(competing.map((row) => row.batchId));
  const byName = (a: BatchBattleSqlRow, b: BatchBattleSqlRow) => a.batchName.localeCompare(b.batchName);
  const ranked = competing
    .filter((row) => row.players >= BATCH_BATTLE_MIN_PLAYERS)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0) || b.players - a.players || byName(a, b));
  const unranked = competing
    .filter((row) => row.players > 0 && row.players < BATCH_BATTLE_MIN_PLAYERS)
    .sort((a, b) => b.players - a.players || byName(a, b));

  const rankOf = new Map<string, number>();
  ranked.forEach((row, index) => {
    const prev = ranked[index - 1];
    rankOf.set(row.batchId, prev && prev.avgScore === row.avgScore ? rankOf.get(prev.batchId)! : index + 1);
  });

  const board = [...ranked, ...unranked].map((row): SoloRushBatchBattleRow => {
    const isMyBatch = myBatchIds.has(row.batchId);
    const showName = (isMyBatch || row.battlesShowNames) && row.topFirstName !== null;
    return {
      avgScore: row.avgScore ?? 0,
      batchId: row.batchId,
      batchName: row.batchName,
      isMyBatch,
      players: row.players,
      rank: rankOf.get(row.batchId) ?? null,
      topPlayerName: showName ? leaderboardName({ firstName: row.topFirstName!, lastName: row.topLastName }) : null,
      topPlayerScore: row.topScore
    };
  });

  const myBatches = rows
    .filter((row) => myBatchIds.has(row.batchId))
    .sort(byName)
    .map((row) => ({
      avgScore: row.players > 0 ? row.avgScore : null,
      batchId: row.batchId,
      batchName: row.batchName,
      players: row.players,
      rank: rankOf.get(row.batchId) ?? null,
      takesPart: competingIds.has(row.batchId)
    }));

  return { minPlayers: BATCH_BATTLE_MIN_PLAYERS, myBatches, rows: board.slice(0, LEADERBOARD_LIMIT) };
}
