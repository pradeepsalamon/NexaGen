import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  AttemptMove,
  PuzzleAttemptDto,
  PuzzleAttemptHistoryResponse,
  PuzzleAttemptProgressResponse,
  PuzzleAttemptResultResponse,
  PuzzleHintRequest,
  PuzzleHintResponse,
  PuzzleSummary,
  SavePuzzleAttemptRequest,
  SolutionMove,
  StartPuzzleAttemptResponse,
  StudentPuzzleDetailResponse,
  StudentPuzzleListQuery,
  StudentPuzzleListResponse,
  StudentPuzzleSummary,
  SubmitPuzzleAttemptRequest
} from "@nexa-chess/types";
import { parseScoringOverride } from "@nexa-chess/types";
import { Prisma, PuzzleStatus, PuzzleVisibility, UserRole, type User } from "@prisma/client";
import { Chess } from "chess.js";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { ANALYTICS_EVENT_TYPES } from "../analytics/analytics-events.constants";
import {
  AssignmentEvaluationService,
  assertValidFen
} from "../assignment/assignment-evaluation.service";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationMeta
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { assertStudent, authenticateUser, fullName } from "./puzzle-auth.helper";

const puzzleInclude = {
  topic: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true } }
} satisfies Prisma.PuzzleInclude;

type PuzzleRow = Prisma.PuzzleGetPayload<{ include: typeof puzzleInclude }>;
type AttemptRow = Prisma.PuzzleAttemptGetPayload<Record<string, never>>;

@Injectable()
export class PuzzleAttemptService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly evaluation: AssignmentEvaluationService,
    private readonly analyticsEvents: AnalyticsEventService
  ) {}

  async listForStudent(
    accessToken: string | undefined,
    query: StudentPuzzleListQuery
  ): Promise<StudentPuzzleListResponse> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );

    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE))
    );
    const search = (query.search ?? "").trim();

    const where = await this.studentVisibilityWhere(student);
    const and: Prisma.PuzzleWhereInput[] = [];
    if (query.topicId) and.push({ topicId: query.topicId });
    if (query.puzzleType) and.push({ puzzleType: query.puzzleType });
    if (query.difficulty) and.push({ difficulty: query.difficulty });
    if (search) {
      and.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { tags: { has: search } }
        ]
      });
    }
    if (and.length > 0) where.AND = and;

    const [rows, total] = await Promise.all([
      this.prisma.puzzle.findMany({
        where,
        include: puzzleInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.puzzle.count({ where })
    ]);

    const attempts = await this.prisma.puzzleAttempt.groupBy({
      by: ["puzzleId"],
      where: { studentId: student.id, puzzleId: { in: rows.map((r) => r.id) } },
      _max: { scorePercent: true },
      _count: { _all: true }
    });
    const solved = await this.prisma.puzzleAttempt.findMany({
      where: {
        studentId: student.id,
        status: "SOLVED",
        puzzleId: { in: rows.map((r) => r.id) }
      },
      select: { puzzleId: true },
      distinct: ["puzzleId"]
    });
    const solvedIds = new Set(solved.map((s) => s.puzzleId));
    const byPuzzle = new Map(attempts.map((a) => [a.puzzleId, a]));

    let list = rows.map<StudentPuzzleSummary>((row) => {
      const agg = byPuzzle.get(row.id);
      return {
        ...this.toSummary(row, student),
        solved: solvedIds.has(row.id),
        bestScorePercent: agg?._max.scorePercent ?? null,
        attemptedCount: agg?._count._all ?? 0
      };
    });

    if (query.solved === "yes") list = list.filter((p) => p.solved);
    if (query.solved === "no") list = list.filter((p) => !p.solved);

    return { puzzles: list, pagination: paginationMeta(total, page, pageSize) };
  }

  async getForStudent(
    accessToken: string | undefined,
    puzzleId: string
  ): Promise<StudentPuzzleDetailResponse> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const row = await this.loadSolvable(puzzleId, student);
    const hasSolved = await this.prisma.puzzleAttempt.findFirst({
      where: { puzzleId, studentId: student.id, status: "SOLVED" },
      select: { id: true }
    });

    const solution = this.solutionFromRow(row.solutionMovesJson);
    return {
      puzzle: {
        ...this.toSummary(row, student),
        fen: row.fen,
        orientation: this.sideToMove(row.fen),
        solutionMoves: hasSolved ? solution : null,
        explanation: hasSolved ? row.explanation : null,
        hints: Array.isArray(row.hintsJson) ? (row.hintsJson as unknown as string[]) : []
      }
    };
  }

  async start(
    accessToken: string | undefined,
    puzzleId: string,
    context: { liveClassId?: string } = {}
  ): Promise<{ attempt: StartPuzzleAttemptResponse }> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const puzzle = await this.loadSolvable(puzzleId, student);
    const fen = assertValidFen(puzzle.fen);
    const solution = this.solutionFromRow(puzzle.solutionMovesJson);
    const hints = Array.isArray(puzzle.hintsJson)
      ? (puzzle.hintsJson as unknown as string[])
      : [];

    const liveClassId = context.liveClassId ?? null;
    const existing = await this.prisma.puzzleAttempt.findFirst({
      where: { puzzleId, studentId: student.id, status: "IN_PROGRESS", liveClassId },
      orderBy: { attemptNumber: "desc" }
    });

    let attempt = existing;
    if (!attempt) {
      const count = await this.prisma.puzzleAttempt.count({
        where: { puzzleId, studentId: student.id }
      });
      try {
        attempt = await this.prisma.puzzleAttempt.create({
          data: { puzzleId, studentId: student.id, attemptNumber: count + 1, liveClassId }
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          attempt = await this.prisma.puzzleAttempt.findFirst({
            where: { puzzleId, studentId: student.id, status: "IN_PROGRESS", liveClassId },
            orderBy: { attemptNumber: "desc" }
          });
        }
        if (!attempt) throw error;
      }
    }

    return {
      attempt: {
        attempt: this.toAttempt(attempt),
        fen,
        orientation: this.sideToMove(fen),
        studentColor: this.sideToMove(fen),
        solutionLength: solution.length,
        allowHints: true,
        hintCount: hints.length
      }
    };
  }

  async get(
    accessToken: string | undefined,
    puzzleId: string,
    attemptId: string
  ): Promise<{ attempt: PuzzleAttemptDto }> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const attempt = await this.loadOwnedAttempt(puzzleId, attemptId, student.id);
    return { attempt: this.toAttempt(attempt) };
  }

  async history(
    accessToken: string | undefined,
    puzzleId: string
  ): Promise<PuzzleAttemptHistoryResponse> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const attempts = await this.prisma.puzzleAttempt.findMany({
      where: { puzzleId, studentId: student.id },
      orderBy: { attemptNumber: "asc" }
    });
    const best = attempts.reduce<number | null>(
      (acc, a) => (a.scorePercent === null ? acc : Math.max(acc ?? 0, a.scorePercent)),
      null
    );
    return { attempts: attempts.map((a) => this.toAttempt(a)), bestScorePercent: best };
  }

  async saveProgress(
    accessToken: string | undefined,
    puzzleId: string,
    attemptId: string,
    dto: SavePuzzleAttemptRequest
  ): Promise<PuzzleAttemptProgressResponse> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const puzzle = await this.loadSolvable(puzzleId, student);
    const attempt = this.assertActive(
      await this.loadOwnedAttempt(puzzleId, attemptId, student.id)
    );
    await this.assertLiveAssignmentOpen(attempt, 15_000);

    const moves = dto.moves as AttemptMove[];
    this.evaluation.assertLegalLine(puzzle.fen, moves);

    const solution = this.solutionFromRow(puzzle.solutionMovesJson);
    const moveFeedback = solution.length
      ? this.evaluation.solveLineFeedback(
          puzzle.fen,
          solution,
          moves,
          this.sideToMove(puzzle.fen)
        )
      : null;

    // A wrong move is a negative mark: counted here, server-side, where the
    // client cannot skip it (it only learns a move was wrong from this call).
    // The wrong line is not persisted — the client resets to the last good
    // position, and the coach's live board shouldn't show a move that was undone.
    const wrong = !!moveFeedback && !moveFeedback.correct;
    const updated = await this.prisma.puzzleAttempt.update({
      where: { id: attempt.id },
      data: wrong
        ? {
            durationSeconds: dto.durationSeconds ?? attempt.durationSeconds,
            wrongMoves: { increment: 1 }
          }
        : {
            movesJson: moves as unknown as Prisma.InputJsonValue,
            durationSeconds: dto.durationSeconds ?? attempt.durationSeconds,
            hintsUsed: Math.max(attempt.hintsUsed, dto.hintsUsed ?? 0)
          }
    });

    return { attempt: this.toAttempt(updated), moveFeedback };
  }

  async submit(
    accessToken: string | undefined,
    puzzleId: string,
    attemptId: string,
    dto: SubmitPuzzleAttemptRequest
  ): Promise<PuzzleAttemptResultResponse> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const puzzle = await this.loadSolvable(puzzleId, student);
    const attempt = this.assertActive(
      await this.loadOwnedAttempt(puzzleId, attemptId, student.id)
    );
    await this.assertLiveAssignmentOpen(attempt, 15_000);

    const moves = dto.moves as AttemptMove[];
    this.evaluation.assertLegalLine(puzzle.fen, moves);

    const solution = this.solutionFromRow(puzzle.solutionMovesJson);
    if (solution.length === 0) {
      throw new BadRequestException("This puzzle has no solution configured.");
    }

    const evalResult = this.evaluation.evaluateSolveLine(
      puzzle.fen,
      solution,
      moves,
      this.sideToMove(puzzle.fen)
    );

    const priorBest = await this.prisma.puzzleAttempt.aggregate({
      where: { puzzleId, studentId: student.id },
      _max: { scorePercent: true }
    });
    const bestScorePercent = Math.max(
      priorBest._max.scorePercent ?? 0,
      evalResult.scorePercent
    );

    const persisted = await this.prisma.puzzleAttempt.update({
      where: { id: attempt.id },
      data: {
        movesJson: moves as unknown as Prisma.InputJsonValue,
        status: evalResult.solved ? "SOLVED" : "FAILED",
        scorePercent: evalResult.scorePercent,
        accuracyPercent: evalResult.accuracyPercent,
        result: evalResult.solved ? "SOLVED" : "FAILED",
        durationSeconds: dto.durationSeconds ?? attempt.durationSeconds,
        hintsUsed: Math.max(attempt.hintsUsed, dto.hintsUsed ?? 0),
        completedAt: new Date()
      }
    });

    void this.analyticsEvents.record(
      student.id,
      ANALYTICS_EVENT_TYPES.PUZZLE_ATTEMPT,
      puzzle.id
    );

    return {
      attempt: this.toAttempt(persisted),
      scorePercent: evalResult.scorePercent,
      accuracyPercent: evalResult.accuracyPercent,
      solved: evalResult.solved,
      review: evalResult.review,
      solutionMoves: solution,
      bestScorePercent
    };
  }

  async hint(
    accessToken: string | undefined,
    puzzleId: string,
    attemptId: string,
    dto: PuzzleHintRequest
  ): Promise<PuzzleHintResponse> {
    const student = assertStudent(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const puzzle = await this.loadSolvable(puzzleId, student);
    const attempt = this.assertActive(
      await this.loadOwnedAttempt(puzzleId, attemptId, student.id)
    );
    await this.assertLiveAssignmentOpen(attempt);

    const solution = this.solutionFromRow(puzzle.solutionMovesJson);
    if (solution.length === 0) {
      throw new BadRequestException("This puzzle has no solution configured.");
    }

    const moves = dto.moves as AttemptMove[];
    this.evaluation.assertLegalLine(puzzle.fen, moves);

    const hint = this.evaluation.solveLineHint(
      puzzle.fen,
      solution,
      moves,
      this.sideToMove(puzzle.fen),
      dto.level
    );

    let hintsUsed = attempt.hintsUsed;
    if (hint.onTrack && !hint.lineComplete) {
      hintsUsed = attempt.hintsUsed + 1;
      await this.prisma.puzzleAttempt.update({
        where: { id: attempt.id },
        data: { hintsUsed }
      });
    }
    return { ...hint, hintsUsed };
  }

  // ── internals ──

  private async studentVisibilityWhere(student: User): Promise<Prisma.PuzzleWhereInput> {
    const coachRows = await this.prisma.batchStudent.findMany({
      where: { studentId: student.id, isDeleted: false },
      select: { batch: { select: { coaches: { where: { isDeleted: false }, select: { coachId: true } } } } }
    });
    const coachIds = Array.from(
      new Set(coachRows.flatMap((r) => r.batch.coaches.map((c) => c.coachId)))
    );
    return {
      status: PuzzleStatus.PUBLISHED,
      OR: [
        { visibility: PuzzleVisibility.GLOBAL },
        ...(coachIds.length
          ? [{ visibility: PuzzleVisibility.PRIVATE, createdById: { in: coachIds } }]
          : [])
      ]
    };
  }

  private async loadSolvable(puzzleId: string, student: User): Promise<PuzzleRow> {
    const row = await this.prisma.puzzle.findUnique({
      where: { id: puzzleId },
      include: puzzleInclude
    });
    if (!row || row.status !== PuzzleStatus.PUBLISHED) {
      throw new NotFoundException("Puzzle not found.");
    }
    if (row.visibility === PuzzleVisibility.PRIVATE) {
      const where = await this.studentVisibilityWhere(student);
      const visible = await this.prisma.puzzle.findFirst({
        where: { id: puzzleId, ...where },
        select: { id: true }
      });
      if (!visible) throw new NotFoundException("Puzzle not found.");
    }
    return row;
  }

  private async loadOwnedAttempt(
    puzzleId: string,
    attemptId: string,
    studentId: string
  ): Promise<AttemptRow> {
    const attempt = await this.prisma.puzzleAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.puzzleId !== puzzleId || attempt.studentId !== studentId) {
      throw new NotFoundException("Attempt not found.");
    }
    return attempt;
  }

  private assertActive(attempt: AttemptRow): AttemptRow {
    if (attempt.status !== "IN_PROGRESS") {
      throw new BadRequestException("This attempt has already been submitted.");
    }
    return attempt;
  }

  /**
   * For an in-class attempt (`liveClassId` set), reject work once the coach has
   * ended the puzzle or its timer has run out. `graceMs` lets a move already in
   * flight at the buzzer still land (the client auto-submits on expiry).
   */
  private async assertLiveAssignmentOpen(attempt: AttemptRow, graceMs = 0): Promise<void> {
    if (!attempt.liveClassId) return;
    const assignment = await this.prisma.liveClassPuzzleAssignment.findFirst({
      where: { liveClassId: attempt.liveClassId, puzzleId: attempt.puzzleId },
      orderBy: { startedAt: "desc" }
    });
    if (!assignment) return;
    if (assignment.status === "ENDED") {
      throw new BadRequestException("Your coach has ended this puzzle.");
    }
    if (
      assignment.durationSeconds &&
      Date.now() > assignment.startedAt.getTime() + assignment.durationSeconds * 1000 + graceMs
    ) {
      throw new BadRequestException("Time is up for this puzzle.");
    }
  }

  private solutionFromRow(raw: Prisma.JsonValue | null): SolutionMove[] {
    if (!Array.isArray(raw)) return [];
    return raw as unknown as SolutionMove[];
  }

  private sideToMove(fen: string): "white" | "black" {
    try {
      return new Chess(assertValidFen(fen)).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }

  private toSummary(row: PuzzleRow, _viewer: User): PuzzleSummary {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      topicId: row.topicId,
      topicName: row.topic.name,
      puzzleType: row.puzzleType,
      difficulty: row.difficulty,
      status: row.status,
      visibility: row.visibility,
      tags: row.tags,
      estimatedSeconds: row.estimatedSeconds,
      scoring: parseScoringOverride(row.scoringJson),
      sideToMove: this.sideToMove(row.fen),
      solutionLength: this.solutionFromRow(row.solutionMovesJson).length,
      createdById: row.createdById,
      createdByName:
        fullName(row.createdBy) ?? (row.createdByRole === UserRole.COACH ? "Coach" : "Admin"),
      createdByRole: row.createdByRole as UserRole,
      attemptCount: 0,
      canManage: false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null
    };
  }

  private toAttempt(row: AttemptRow): PuzzleAttemptDto {
    const moves = Array.isArray(row.movesJson)
      ? (row.movesJson as unknown as AttemptMove[])
      : [];
    return {
      id: row.id,
      puzzleId: row.puzzleId,
      attemptNumber: row.attemptNumber,
      status: row.status,
      moves,
      scorePercent: row.scorePercent,
      accuracyPercent: row.accuracyPercent,
      hintsUsed: row.hintsUsed,
      durationSeconds: row.durationSeconds,
      result: row.result,
      startedAt: row.startedAt.toISOString(),
      completedAt: row.completedAt ? row.completedAt.toISOString() : null
    };
  }
}
