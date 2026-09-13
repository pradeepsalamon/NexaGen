import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  AssignmentActivityConfig,
  AssignmentActivityType,
  AssignmentAttempt,
  AssignmentAttemptHistoryResponse,
  AssignmentEvaluationResult,
  AttemptMove,
  AttemptProgressResponse,
  ChessColor,
  RequestEngineMoveRequest,
  RequestEngineMoveResponse,
  SaveAttemptProgressRequest,
  SolutionMove,
  SolveLineHint,
  SolveLineHintRequest,
  StartAttemptResponse,
  SubmitAttemptRequest
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { Chess } from "chess.js";
import type { AccessTokenPayload } from "../auth/types";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssignmentEvaluationService, assertValidFen } from "./assignment-evaluation.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";

type AttemptRow = Prisma.StudentAssignmentAttemptGetPayload<Record<string, never>>;

const saInclude = {
  assignmentBatch: { include: { assignment: true } },
  attempts: { orderBy: { attemptNumber: "asc" } }
} satisfies Prisma.StudentAssignmentInclude;

type StudentAssignmentRow = Prisma.StudentAssignmentGetPayload<{ include: typeof saInclude }>;
type AssignmentRow = StudentAssignmentRow["assignmentBatch"]["assignment"];

@Injectable()
export class AssignmentAttemptService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly evaluation: AssignmentEvaluationService,
    private readonly messaging: MessagingDispatchService,
    private readonly analyticsEvents: AnalyticsEventService
  ) {}

  // ────────────────────────────────────────────────────────────

  async start(accessToken: string | undefined, studentAssignmentId: string): Promise<{ attempt: StartAttemptResponse }> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    const assignment = sa.assignmentBatch.assignment;
    this.assertEvaluated(assignment.activityType);

    const config = this.toConfig(assignment);
    const startFen = assertValidFen(assignment.startFen);
    const solution = this.solution(assignment);

    let attempt = sa.attempts.find((a) => a.status === "IN_PROGRESS") ?? null;

    if (!attempt) {
      const nextNumber = sa.attempts.length + 1;
      const max = assignment.maxAttempts ?? (assignment.allowRetry ? null : 1);
      if (max !== null && sa.attempts.length >= max) {
        throw new BadRequestException("You have used all attempts for this assignment.");
      }

      try {
        attempt = await this.prisma.$transaction(async (tx) => {
          const created = await tx.studentAssignmentAttempt.create({
            data: { studentAssignmentId, attemptNumber: nextNumber }
          });
          await tx.studentAssignment.update({
            where: { id: studentAssignmentId },
            data: {
              status: sa.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
              attemptCount: nextNumber,
              lastAttemptAt: new Date()
            }
          });
          return created;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const fresh = await this.prisma.studentAssignmentAttempt.findFirst({
            where: { studentAssignmentId, status: "IN_PROGRESS" },
            orderBy: { attemptNumber: "desc" }
          });
          if (fresh) attempt = fresh;
          else throw error;
        } else {
          throw error;
        }
      }
    }

    const attemptCount = Math.max(sa.attempts.length, attempt.attemptNumber);
    return {
      attempt: {
        attempt: this.toAttempt(attempt),
        config,
        startFen,
        solutionLength: solution ? solution.length : null,
        attemptCount,
        attemptsRemaining: this.remaining(assignment, attemptCount)
      }
    };
  }

  async get(
    accessToken: string | undefined,
    studentAssignmentId: string,
    attemptId: string
  ): Promise<{ attempt: AssignmentAttempt }> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    const attempt = sa.attempts.find((a) => a.id === attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found.");
    return { attempt: this.toAttempt(attempt) };
  }

  async history(
    accessToken: string | undefined,
    studentAssignmentId: string
  ): Promise<AssignmentAttemptHistoryResponse> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    return {
      attempts: sa.attempts.map((a) => this.toAttempt(a)),
      bestScorePercent: sa.bestScorePercent,
      bestAccuracyPercent: sa.bestAccuracyPercent
    };
  }

  async saveProgress(
    accessToken: string | undefined,
    studentAssignmentId: string,
    attemptId: string,
    dto: SaveAttemptProgressRequest
  ): Promise<AttemptProgressResponse> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    const assignment = sa.assignmentBatch.assignment;
    const attempt = this.activeAttempt(sa, attemptId);

    const moves = dto.moves as AttemptMove[];
    this.evaluation.assertLegalLine(assignment.startFen ?? "", moves);

    const updated = await this.prisma.studentAssignmentAttempt.update({
      where: { id: attempt.id },
      data: {
        movesJson: moves as unknown as Prisma.InputJsonValue,
        durationSeconds: dto.durationSeconds ?? attempt.durationSeconds,
        hintsUsed: Math.max(attempt.hintsUsed, dto.hintsUsed ?? 0)
      }
    });

    let moveFeedback: AttemptProgressResponse["moveFeedback"] = null;
    if (assignment.activityType === "SOLVE_LINE") {
      const solution = this.solution(assignment);
      if (solution) {
        moveFeedback = this.evaluation.solveLineFeedback(
          assignment.startFen ?? "",
          solution,
          moves,
          this.studentColor(assignment)
        );
      }
    }

    return { attempt: this.toAttempt(updated), moveFeedback };
  }

  async submit(
    accessToken: string | undefined,
    studentAssignmentId: string,
    attemptId: string,
    dto: SubmitAttemptRequest
  ): Promise<AssignmentEvaluationResult> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    const assignment = sa.assignmentBatch.assignment;
    const attempt = this.activeAttempt(sa, attemptId);

    const moves = dto.moves as AttemptMove[];
    this.evaluation.assertLegalLine(assignment.startFen ?? "", moves);

    const { activityType } = assignment;
    const studentColor = this.studentColor(assignment);
    const threshold = assignment.passThresholdPercent;

    let scorePercent = 0;
    let accuracyPercent: number | null = null;
    let review: AssignmentEvaluationResult["review"] = [];
    let result = "SUBMITTED";
    let engineUnavailable = false;

    if (activityType === "SOLVE_LINE") {
      const solution = this.solution(assignment);
      if (!solution) throw new BadRequestException("This assignment has no solution configured.");
      const evalResult = this.evaluation.evaluateSolveLine(
        assignment.startFen ?? "",
        solution,
        moves,
        studentColor
      );
      scorePercent = evalResult.scorePercent;
      accuracyPercent = evalResult.accuracyPercent;
      review = evalResult.review;
      result = evalResult.solved ? "SOLVED" : "PARTIAL";
    } else if (activityType === "PLAY_VS_ENGINE") {
      const evalResult = this.evaluation.evaluateEngineGame(
        assignment.startFen ?? "",
        studentColor,
        moves,
        dto.resign === true
      );
      if (!evalResult.finished) {
        throw new BadRequestException("Finish the game or resign before submitting.");
      }
      scorePercent = evalResult.scorePercent;
      result = evalResult.result;
      engineUnavailable = !this.evaluation.isEngineAvailable();
      if (dto.resign !== true) {
        accuracyPercent = await this.evaluation.engineGameAccuracy(
          assignment.startFen ?? "",
          studentColor,
          moves
        );
      }
    } else if (activityType === "FREE_ANALYSIS") {
      scorePercent = 100;
      result = "SUBMITTED";
    } else {
      throw new BadRequestException("This assignment does not use attempts.");
    }

    const passed = scorePercent >= threshold;
    const attemptCount = Math.max(sa.attempts.length, attempt.attemptNumber);
    const attemptsRemaining = this.remaining(assignment, attemptCount);
    const attemptStatus = passed || activityType === "FREE_ANALYSIS" ? "COMPLETED" : "FAILED";

    const nextBestScore = Math.max(sa.bestScorePercent ?? 0, scorePercent);
    const nextBestAccuracy =
      accuracyPercent === null
        ? sa.bestAccuracyPercent
        : Math.max(sa.bestAccuracyPercent ?? 0, accuracyPercent);

    const persisted = await this.prisma.$transaction(async (tx) => {
      const savedAttempt = await tx.studentAssignmentAttempt.update({
        where: { id: attempt.id },
        data: {
          movesJson: moves as unknown as Prisma.InputJsonValue,
          status: attemptStatus,
          scorePercent,
          accuracyPercent,
          result,
          durationSeconds: dto.durationSeconds ?? attempt.durationSeconds,
          hintsUsed: Math.max(attempt.hintsUsed, dto.hintsUsed ?? 0),
          completedAt: new Date()
        }
      });

      const markComplete = passed || activityType === "FREE_ANALYSIS";
      await tx.studentAssignment.update({
        where: { id: studentAssignmentId },
        data: {
          bestScorePercent: nextBestScore,
          bestAccuracyPercent: nextBestAccuracy,
          attemptCount,
          lastAttemptAt: new Date(),
          status: markComplete ? "COMPLETED" : sa.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS",
          completedAt:
            markComplete && !sa.completedAt ? new Date() : sa.completedAt ?? undefined
        }
      });

      return savedAttempt;
    });

    const coachId = sa.assignmentBatch.assignedById;
    if (coachId) {
      // Copy, channels and audience come from the admin's ASSIGNMENT_GRADED rule.
      this.messaging.dispatchInBackground({
        event: "ASSIGNMENT_GRADED",
        studentAssignmentId: sa.id,
        coachId,
        studentName: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        scorePercent,
        outcome: result
      });
    }

    const alreadyComplete = sa.status === "COMPLETED" || sa.completedAt !== null;
    const canReview = passed || alreadyComplete || attemptsRemaining === 0;

    void this.analyticsEvents.record(student.id, "ASSIGNMENT_ATTEMPT", assignment.id);

    return {
      attempt: this.toAttempt(persisted),
      scorePercent,
      accuracyPercent,
      passed,
      status: attemptStatus,
      result,
      review,
      solutionMoves: canReview ? this.solution(assignment) : null,
      assignmentStatus: passed || activityType === "FREE_ANALYSIS" || alreadyComplete ? "COMPLETED" : "IN_PROGRESS",
      bestScorePercent: nextBestScore,
      bestAccuracyPercent: nextBestAccuracy ?? null,
      attemptCount,
      attemptsRemaining,
      engineUnavailable
    };
  }

  async engineMove(
    accessToken: string | undefined,
    studentAssignmentId: string,
    attemptId: string,
    dto: RequestEngineMoveRequest
  ): Promise<RequestEngineMoveResponse> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    const assignment = sa.assignmentBatch.assignment;
    this.activeAttempt(sa, attemptId);

    if (assignment.activityType !== "PLAY_VS_ENGINE") {
      throw new BadRequestException("This assignment is not played against the engine.");
    }

    return this.evaluation.engineReply(dto.fen, assignment.engineLevel);
  }

  async hint(
    accessToken: string | undefined,
    studentAssignmentId: string,
    attemptId: string,
    dto: SolveLineHintRequest
  ): Promise<SolveLineHint> {
    const student = await this.getStudent(accessToken);
    const sa = await this.loadOwned(studentAssignmentId, student.id);
    const assignment = sa.assignmentBatch.assignment;
    const attempt = this.activeAttempt(sa, attemptId);

    if (assignment.activityType !== "SOLVE_LINE") {
      throw new BadRequestException("Hints are only available for solve-the-line assignments.");
    }
    if (!assignment.allowHints) {
      throw new ForbiddenException("Hints are disabled for this assignment.");
    }

    const solution = this.solution(assignment);
    if (!solution) throw new BadRequestException("This assignment has no solution configured.");

    const moves = dto.moves as AttemptMove[];
    this.evaluation.assertLegalLine(assignment.startFen ?? "", moves);

    const hint = this.evaluation.solveLineHint(
      assignment.startFen ?? "",
      solution,
      moves,
      this.studentColor(assignment),
      dto.level
    );

    let hintsUsed = attempt.hintsUsed;
    if (hint.onTrack && !hint.lineComplete) {
      hintsUsed = attempt.hintsUsed + 1;
      await this.prisma.studentAssignmentAttempt.update({
        where: { id: attempt.id },
        data: { hintsUsed }
      });
    }

    return { ...hint, hintsUsed };
  }

  // ── internals ──────────────────────────────────────────────

  private activeAttempt(sa: StudentAssignmentRow, attemptId: string): AttemptRow {
    const attempt = sa.attempts.find((a) => a.id === attemptId);
    if (!attempt) throw new NotFoundException("Attempt not found.");
    if (attempt.status !== "IN_PROGRESS") {
      throw new BadRequestException("This attempt has already been submitted.");
    }
    return attempt;
  }

  private assertEvaluated(type: AssignmentActivityType) {
    if (type === "REPLAY") {
      throw new BadRequestException("This assignment is a study/replay and does not use attempts.");
    }
  }

  private remaining(assignment: AssignmentRow, attemptCount: number): number | null {
    const max = assignment.maxAttempts ?? (assignment.allowRetry ? null : 1);
    if (max === null) return null;
    return Math.max(0, max - attemptCount);
  }

  private solution(assignment: AssignmentRow): SolutionMove[] | null {
    const raw = assignment.solutionMovesJson;
    if (!Array.isArray(raw)) return null;
    return raw as unknown as SolutionMove[];
  }

  private studentColor(assignment: AssignmentRow): ChessColor {
    if (assignment.studentColor === "white" || assignment.studentColor === "black") {
      return assignment.studentColor;
    }
    try {
      return new Chess(assertValidFen(assignment.startFen)).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }

  private toConfig(assignment: AssignmentRow): AssignmentActivityConfig {
    const studentColor = this.studentColor(assignment);
    const orientation =
      assignment.orientation === "white" || assignment.orientation === "black"
        ? assignment.orientation
        : studentColor;
    return {
      activityType: assignment.activityType,
      startFen: assignment.startFen,
      orientation,
      studentColor,
      engineLevel: assignment.engineLevel,
      passThresholdPercent: assignment.passThresholdPercent,
      maxAttempts: assignment.maxAttempts,
      allowHints: assignment.allowHints,
      allowRetry: assignment.allowRetry,
      requiredCompletionPercent: assignment.requiredCompletionPercent
    };
  }

  private toAttempt(row: AttemptRow): AssignmentAttempt {
    const moves = Array.isArray(row.movesJson) ? (row.movesJson as unknown as AttemptMove[]) : [];
    return {
      id: row.id,
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

  private async loadOwned(id: string, studentId: string): Promise<StudentAssignmentRow> {
    const row = await this.prisma.studentAssignment.findUnique({ where: { id }, include: saInclude });
    if (!row || row.studentId !== studentId) {
      throw new NotFoundException("Assignment not found.");
    }
    return row;
  }

  // ── auth helpers (token-string pattern; no guards) ──

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) throw new UnauthorizedException("Access token is missing.");

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: this.env.JWT_ACCESS_SECRET
    });
    if (payload.type !== "access") throw new UnauthorizedException("Invalid token type.");

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }
    return user;
  }

  private async getStudent(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.STUDENT) {
      throw new ForbiddenException("Only students have assignments.");
    }
    return user;
  }
}
