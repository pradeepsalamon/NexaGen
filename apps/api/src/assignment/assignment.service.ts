import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  AssignmentActivityConfig,
  AssignmentActivityType,
  AssignmentDeployment,
  AssignmentDeploymentDetail,
  AssignmentDeploymentDetailResponse,
  AssignmentDeploymentListResponse,
  AssignmentDeploymentStats,
  AssignmentDifficulty,
  AssignmentLibraryItem,
  AssignmentLibraryResponse,
  AssignmentPerformanceSummary,
  AssignmentResponse,
  AssignmentStatus as AssignmentStatusType,
  ChessColor,
  CreateAssignmentRequest,
  DeployAssignmentRequest,
  SolutionMove,
  StudentAssignmentDetailResponse,
  StudentAssignmentItem,
  StudentAssignmentListResponse,
  UpdateAssignmentRequest,
  UpdateAssignmentStatusRequest
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { Chess } from "chess.js";
import type { AccessTokenPayload } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { UploadService } from "../upload/upload.service";
import { AssignmentEvaluationService, assertValidFen } from "./assignment-evaluation.service";

/**
 * The interactive-transaction client as seen inside `prisma.$transaction(cb)`.
 * `PrismaService`'s getters expose the *extended* delegates, so a `Pick` of it
 * matches the callback argument — `Prisma.TransactionClient` does not (it is the
 * un-extended shape).
 */
type Tx = Pick<PrismaService, "assignment" | "assignmentBatch" | "batchStudent" | "studentAssignment">;

type AuthedUser = { id: string; role: UserRole };

interface ActivityData {
  activityType: AssignmentActivityType;
  pgn: string;
  startFen: string | null;
  solutionMovesJson: Prisma.InputJsonValue | typeof Prisma.DbNull;
  orientation: string | null;
  studentColor: string | null;
  engineLevel: number | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  allowHints: boolean;
  allowRetry: boolean;
  requiredCompletionPercent: number;
}

type ActivityInput = {
  activityType?: AssignmentActivityType;
  pgn?: string;
  startFen?: string;
  solutionMoves?: SolutionMove[];
  orientation?: ChessColor;
  studentColor?: ChessColor;
  engineLevel?: number;
  passThresholdPercent?: number;
  maxAttempts?: number | null;
  allowHints?: boolean;
  allowRetry?: boolean;
  requiredCompletionPercent?: number;
};

type ActivityDefaults = {
  activityType: AssignmentActivityType;
  pgn: string;
  startFen: string | null;
  solutionMovesJson: Prisma.JsonValue;
  orientation: string | null;
  studentColor: string | null;
  engineLevel: number | null;
  passThresholdPercent: number;
  maxAttempts: number | null;
  allowHints: boolean;
  allowRetry: boolean;
  requiredCompletionPercent: number;
};

const studentInclude = {
  assignmentBatch: {
    include: { assignment: { include: { createdBy: true } }, batch: true }
  }
} satisfies Prisma.StudentAssignmentInclude;

@Injectable()
export class AssignmentService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly evaluation: AssignmentEvaluationService
  ) {}

  // ────────────────────────────────────────────────────────────
  // Library (admin authors shared items, coach authors private items)
  // ────────────────────────────────────────────────────────────

  async listLibrary(accessToken: string | undefined): Promise<AssignmentLibraryResponse> {
    const user = await this.getStaffOrCoach(accessToken);

    const where: Prisma.AssignmentWhereInput = this.isAdmin(user.role)
      ? { isLibrary: true }
      : { OR: [{ isLibrary: true }, { createdById: user.id }] };

    const rows = await this.prisma.assignment.findMany({
      where,
      include: { createdBy: true, _count: { select: { deployments: true } } },
      orderBy: { createdAt: "desc" }
    });

    return { assignments: rows.map((row) => this.toLibraryItem(row, user)) };
  }

  async getLibraryItem(
    accessToken: string | undefined,
    id: string
  ): Promise<AssignmentResponse> {
    const user = await this.getStaffOrCoach(accessToken);
    const row = await this.prisma.assignment.findUnique({
      where: { id },
      include: { createdBy: true, _count: { select: { deployments: true } } }
    });

    if (!row || (!row.isLibrary && row.createdById !== user.id && !this.isAdmin(user.role))) {
      throw new NotFoundException("Assignment not found.");
    }

    const performance =
      row._count.deployments > 0
        ? await this.computePerformance(row.id, row.maxAttempts)
        : null;

    return { assignment: this.toLibraryItem(row, user, performance) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreateAssignmentRequest
  ): Promise<AssignmentResponse> {
    const user = await this.getStaffOrCoach(accessToken);
    const activity = this.buildActivityData(dto);

    const batchIds = [...new Set(dto.batchIds ?? [])];
    if (batchIds.length > 0) {
      if (this.isAdmin(user.role)) {
        throw new BadRequestException(
          "Admins create library assignments; a coach assigns them to batches."
        );
      }
      await this.assertCoachOwnsBatches(user.id, batchIds);
    }

    const pgnUrl = await this.uploadPgn(dto.title, activity.pgn);

    const created = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          createdById: user.id,
          isLibrary: this.isAdmin(user.role),
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          pgnUrl,
          difficulty: dto.difficulty,
          timeLimitMinutes: dto.timeLimitMinutes,
          ...activity
        }
      });

      if (batchIds.length > 0 && dto.dueDate) {
        await this.deployWithinTx(tx, assignment.id, user.id, batchIds, new Date(dto.dueDate));
      }

      return assignment;
    });

    return this.getLibraryItem(accessToken, created.id);
  }

  async update(
    accessToken: string | undefined,
    id: string,
    dto: UpdateAssignmentRequest
  ): Promise<AssignmentResponse> {
    const user = await this.getStaffOrCoach(accessToken);
    const existing = await this.prisma.assignment.findUnique({ where: { id } });

    if (!existing) throw new NotFoundException("Assignment not found.");
    if (!this.canManage(existing, user)) {
      throw new ForbiddenException("You cannot edit this assignment.");
    }

    const activity = this.buildActivityData(dto, {
      activityType: existing.activityType,
      pgn: existing.pgn,
      startFen: existing.startFen,
      solutionMovesJson: existing.solutionMovesJson,
      orientation: existing.orientation,
      studentColor: existing.studentColor,
      engineLevel: existing.engineLevel,
      passThresholdPercent: existing.passThresholdPercent,
      maxAttempts: existing.maxAttempts,
      allowHints: existing.allowHints,
      allowRetry: existing.allowRetry,
      requiredCompletionPercent: existing.requiredCompletionPercent
    });

    const pgnChanged = activity.pgn !== existing.pgn;
    const pgnUrl = pgnChanged
      ? await this.uploadPgn(dto.title ?? existing.title, activity.pgn)
      : undefined;

    await this.prisma.assignment.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined ? undefined : dto.description?.trim() || null,
        pgnUrl,
        difficulty: dto.difficulty,
        timeLimitMinutes: dto.timeLimitMinutes,
        ...activity
      }
    });

    return this.getLibraryItem(accessToken, id);
  }

  async remove(
    accessToken: string | undefined,
    id: string
  ): Promise<{ success: true }> {
    const user = await this.getStaffOrCoach(accessToken);
    const existing = await this.prisma.assignment.findUnique({ where: { id } });

    if (!existing) throw new NotFoundException("Assignment not found.");
    if (!this.canManage(existing, user)) {
      throw new ForbiddenException("You cannot delete this assignment.");
    }

    await this.prisma.assignment.delete({ where: { id } });
    return { success: true };
  }

  // ────────────────────────────────────────────────────────────
  // Deployments to batches (coach)
  // ────────────────────────────────────────────────────────────

  async deploy(
    accessToken: string | undefined,
    dto: DeployAssignmentRequest
  ): Promise<AssignmentDeploymentListResponse> {
    const coach = await this.getCoach(accessToken);

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: dto.assignmentId }
    });
    if (!assignment) throw new NotFoundException("Assignment not found.");
    if (!assignment.isLibrary && assignment.createdById !== coach.id) {
      throw new ForbiddenException("You cannot assign this item.");
    }

    const batchIds = [...new Set(dto.batchIds)];
    await this.assertCoachOwnsBatches(coach.id, batchIds);

    await this.prisma.$transaction((tx) =>
      this.deployWithinTx(tx, dto.assignmentId, coach.id, batchIds, new Date(dto.dueDate))
    );

    return this.listDeployments(accessToken);
  }

  async listDeployments(
    accessToken: string | undefined
  ): Promise<AssignmentDeploymentListResponse> {
    const coach = await this.getCoach(accessToken);

    const rows = await this.prisma.assignmentBatch.findMany({
      where: { batch: { coaches: { some: { coachId: coach.id, isDeleted: false } } } },
      include: { assignment: true, batch: true, students: true },
      orderBy: { createdAt: "desc" }
    });

    return { deployments: rows.map((row) => this.toDeployment(row)) };
  }

  async getDeployment(
    accessToken: string | undefined,
    id: string
  ): Promise<AssignmentDeploymentDetailResponse> {
    const coach = await this.getCoach(accessToken);

    const row = await this.prisma.assignmentBatch.findUnique({
      where: { id },
      include: {
        assignment: true,
        batch: { include: { coaches: { where: { isDeleted: false } } } },
        students: { include: { student: true } }
      }
    });

    if (!row || !row.batch.coaches.some((c) => c.coachId === coach.id)) {
      throw new NotFoundException("Assignment not found.");
    }

    return { deployment: this.toDeploymentDetail(row) };
  }

  async undeploy(
    accessToken: string | undefined,
    id: string
  ): Promise<{ success: true }> {
    const coach = await this.getCoach(accessToken);

    const row = await this.prisma.assignmentBatch.findUnique({
      where: { id },
      include: { batch: { include: { coaches: { where: { isDeleted: false } } } } }
    });

    if (!row || !row.batch.coaches.some((c) => c.coachId === coach.id)) {
      throw new NotFoundException("Assignment not found.");
    }

    await this.prisma.assignmentBatch.delete({ where: { id } });
    return { success: true };
  }

  // ────────────────────────────────────────────────────────────
  // Student
  // ────────────────────────────────────────────────────────────

  async listForStudent(
    accessToken: string | undefined
  ): Promise<StudentAssignmentListResponse> {
    const student = await this.getStudent(accessToken);

    const rows = await this.prisma.studentAssignment.findMany({
      where: { studentId: student.id },
      include: studentInclude,
      orderBy: { assignmentBatch: { dueDate: "asc" } }
    });

    return { assignments: rows.map((row) => this.toStudentItem(row)) };
  }

  async getForStudent(
    accessToken: string | undefined,
    id: string
  ): Promise<StudentAssignmentDetailResponse> {
    const student = await this.getStudent(accessToken);

    const row = await this.prisma.studentAssignment.findUnique({
      where: { id },
      include: studentInclude
    });

    if (!row || row.studentId !== student.id) {
      throw new NotFoundException("Assignment not found.");
    }

    return { assignment: this.toStudentItem(row) };
  }

  async updateStatus(
    accessToken: string | undefined,
    id: string,
    dto: UpdateAssignmentStatusRequest
  ): Promise<StudentAssignmentDetailResponse> {
    const student = await this.getStudent(accessToken);

    const row = await this.prisma.studentAssignment.findUnique({
      where: { id },
      include: { assignmentBatch: { include: { assignment: { select: { activityType: true } } } } }
    });
    if (!row || row.studentId !== student.id) {
      throw new NotFoundException("Assignment not found.");
    }

    if (
      row.assignmentBatch.assignment.activityType !== "REPLAY" &&
      dto.status === "COMPLETED"
    ) {
      throw new BadRequestException(
        "This assignment is completed by finishing an attempt, not marked manually."
      );
    }

    const updated = await this.prisma.studentAssignment.update({
      where: { id },
      data: {
        status: dto.status,
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
        completedAt: dto.status === "COMPLETED" ? new Date() : null,
        timeSpentSeconds: dto.timeSpentSeconds
      },
      include: studentInclude
    });

    return { assignment: this.toStudentItem(updated) };
  }

  // ────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────

  private async deployWithinTx(
    tx: Tx,
    assignmentId: string,
    coachId: string,
    batchIds: string[],
    dueDate: Date
  ) {
    for (const batchId of batchIds) {
      const deployment = await tx.assignmentBatch.upsert({
        where: { assignmentId_batchId: { assignmentId, batchId } },
        create: { assignmentId, batchId, assignedById: coachId, dueDate },
        update: { dueDate, assignedById: coachId }
      });

      const students = await tx.batchStudent.findMany({
        where: { batchId, isDeleted: false },
        select: { studentId: true }
      });

      if (students.length > 0) {
        await tx.studentAssignment.createMany({
          data: students.map((s) => ({
            assignmentBatchId: deployment.id,
            studentId: s.studentId
          })),
          skipDuplicates: true
        });
      }
    }
  }

  private assertValidPgn(pgn: string | undefined) {
    const trimmed = (pgn ?? "").trim();
    if (!trimmed) throw new BadRequestException("PGN is required.");

    try {
      new Chess().loadPgn(trimmed);
    } catch {
      throw new BadRequestException(
        "The PGN could not be parsed. Paste a valid game or line."
      );
    }
  }

  /**
   * Resolve the full interactive-activity column set from a create/update DTO,
   * falling back to `current` values for a partial update. Legacy callers that
   * pass only `pgn` produce a REPLAY row identical to the old behaviour.
   */
  private buildActivityData(input: ActivityInput, current?: ActivityDefaults): ActivityData {
    const type: AssignmentActivityType =
      input.activityType ?? current?.activityType ?? "REPLAY";

    const scalar = {
      passThresholdPercent:
        input.passThresholdPercent ?? current?.passThresholdPercent ?? 100,
      maxAttempts:
        input.maxAttempts !== undefined ? input.maxAttempts : current?.maxAttempts ?? null,
      allowHints: input.allowHints ?? current?.allowHints ?? false,
      allowRetry: input.allowRetry ?? current?.allowRetry ?? true,
      requiredCompletionPercent:
        input.requiredCompletionPercent ?? current?.requiredCompletionPercent ?? 100
    };

    if (type === "REPLAY") {
      const pgn = input.pgn ?? current?.pgn;
      this.assertValidPgn(pgn);
      return {
        activityType: "REPLAY",
        pgn: pgn as string,
        startFen: null,
        solutionMovesJson: Prisma.DbNull,
        orientation: null,
        studentColor: null,
        engineLevel: null,
        ...scalar,
        maxAttempts: null,
        allowHints: false,
        allowRetry: true
      };
    }

    const startFen = assertValidFen(input.startFen ?? current?.startFen ?? undefined);
    const turnColor: ChessColor = (() => {
      try {
        return new Chess(startFen).turn() === "w" ? "white" : "black";
      } catch {
        return "white";
      }
    })();
    const studentColor: ChessColor =
      input.studentColor ?? (current?.studentColor as ChessColor | undefined) ?? turnColor;
    const orientation: ChessColor =
      input.orientation ?? (current?.orientation as ChessColor | undefined) ?? studentColor;

    let pgn: string;
    let solutionMovesJson: ActivityData["solutionMovesJson"] = Prisma.DbNull;

    if (type === "SOLVE_LINE") {
      const rawMoves =
        input.solutionMoves ??
        (Array.isArray(current?.solutionMovesJson)
          ? (current?.solutionMovesJson as unknown as SolutionMove[])
          : []);
      const solution = this.evaluation.normalizeSolution(startFen, rawMoves);
      if (solution.length === 0) {
        throw new BadRequestException("Record at least one solution move.");
      }
      pgn = this.evaluation.buildLinePgn(startFen, solution);
      solutionMovesJson = solution as unknown as Prisma.InputJsonValue;
    } else {
      pgn = this.evaluation.positionPgn(startFen);
    }

    const engineLevel =
      type === "PLAY_VS_ENGINE"
        ? input.engineLevel ?? current?.engineLevel ?? 5
        : null;

    return {
      activityType: type,
      pgn,
      startFen,
      solutionMovesJson,
      orientation,
      studentColor,
      engineLevel,
      ...scalar
    };
  }

  private async uploadPgn(title: string, pgn: string): Promise<string | null> {
    const slug =
      title
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 40) || "assignment";

    try {
      const result = await this.uploadService.uploadPgn(pgn, `${slug}.pgn`);
      return result.secure_url;
    } catch (error) {
      // The raw PGN is always persisted on the row; a Cloudinary hiccup must not
      // block authoring. The URL is only used for the "download PGN" affordance.
      this.logger.warn(
        `PGN upload to Cloudinary failed for "${title}": ${(error as Error).message}`
      );
      return null;
    }
  }

  private async assertCoachOwnsBatches(coachId: string, batchIds: string[]) {
    const batches = await this.prisma.batch.findMany({
      where: { id: { in: batchIds }, isDeleted: false },
      include: { coaches: { where: { isDeleted: false } } }
    });

    if (batches.length !== batchIds.length) {
      throw new NotFoundException("One or more batches were not found.");
    }

    for (const batch of batches) {
      if (!batch.coaches.some((c) => c.coachId === coachId)) {
        throw new ForbiddenException("You are not assigned to one of the selected batches.");
      }
    }
  }

  private canManage(
    row: { isLibrary: boolean; createdById: string | null },
    viewer: AuthedUser
  ) {
    return row.isLibrary ? this.isAdmin(viewer.role) : row.createdById === viewer.id;
  }

  private isAdmin(role: UserRole) {
    return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
  }

  private toActivityConfig(row: {
    activityType: AssignmentActivityType;
    startFen: string | null;
    orientation: string | null;
    studentColor: string | null;
    engineLevel: number | null;
    passThresholdPercent: number;
    maxAttempts: number | null;
    allowHints: boolean;
    allowRetry: boolean;
    requiredCompletionPercent: number;
  }): AssignmentActivityConfig {
    const studentColor =
      row.studentColor === "white" || row.studentColor === "black" ? row.studentColor : null;
    const orientation =
      row.orientation === "white" || row.orientation === "black"
        ? row.orientation
        : studentColor;
    return {
      activityType: row.activityType,
      startFen: row.startFen,
      orientation,
      studentColor,
      engineLevel: row.engineLevel,
      passThresholdPercent: row.passThresholdPercent,
      maxAttempts: row.maxAttempts,
      allowHints: row.allowHints,
      allowRetry: row.allowRetry,
      requiredCompletionPercent: row.requiredCompletionPercent
    };
  }

  private solutionFromRow(json: Prisma.JsonValue): SolutionMove[] | null {
    return Array.isArray(json) ? (json as unknown as SolutionMove[]) : null;
  }

  private async computePerformance(
    assignmentId: string,
    maxAttempts: number | null
  ): Promise<AssignmentPerformanceSummary> {
    const rows = await this.prisma.studentAssignment.findMany({
      where: { assignmentBatch: { assignmentId } },
      select: {
        status: true,
        bestScorePercent: true,
        bestAccuracyPercent: true,
        attemptCount: true
      }
    });

    const avg = (nums: number[]) =>
      nums.length === 0 ? null : Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);

    const completed = rows.filter((r) => r.status === "COMPLETED").length;
    const inProgress = rows.filter((r) => r.status === "IN_PROGRESS").length;
    const notStarted = rows.filter((r) => r.status === "PENDING").length;
    const failed = rows.filter(
      (r) =>
        r.status !== "COMPLETED" &&
        r.attemptCount > 0 &&
        maxAttempts !== null &&
        r.attemptCount >= maxAttempts
    ).length;

    return {
      assigned: rows.length,
      completed,
      inProgress,
      notStarted,
      failed,
      averageScorePercent: avg(
        rows.map((r) => r.bestScorePercent).filter((n): n is number => n !== null)
      ),
      averageAccuracyPercent: avg(
        rows.map((r) => r.bestAccuracyPercent).filter((n): n is number => n !== null)
      ),
      averageAttempts: avg(rows.map((r) => r.attemptCount).filter((n) => n > 0))
    };
  }

  private toLibraryItem(
    row: Prisma.AssignmentGetPayload<{
      include: { createdBy: true; _count: { select: { deployments: true } } };
    }>,
    viewer: AuthedUser,
    performance: AssignmentPerformanceSummary | null = null
  ): AssignmentLibraryItem {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      pgn: row.pgn,
      pgnUrl: row.pgnUrl,
      difficulty: row.difficulty as AssignmentDifficulty,
      timeLimitMinutes: row.timeLimitMinutes,
      isLibrary: row.isLibrary,
      createdById: row.createdById,
      createdByName: this.fullName(row.createdBy),
      canManage: this.canManage(row, viewer),
      deploymentCount: row._count.deployments,
      solutionMoves: this.solutionFromRow(row.solutionMovesJson),
      performance,
      ...this.toActivityConfig(row),
      createdAt: row.createdAt.toISOString()
    };
  }

  private toDeployment(row: {
    id: string;
    assignmentId: string;
    batchId: string;
    dueDate: Date;
    createdAt: Date;
    assignment: { title: string; difficulty: string; timeLimitMinutes: number | null };
    batch: { name: string };
    students: { status: string }[];
  }): AssignmentDeployment {
    return {
      id: row.id,
      assignmentId: row.assignmentId,
      title: row.assignment.title,
      difficulty: row.assignment.difficulty as AssignmentDifficulty,
      timeLimitMinutes: row.assignment.timeLimitMinutes,
      batchId: row.batchId,
      batchName: row.batch.name,
      dueDate: row.dueDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
      stats: this.statsFrom(row.students)
    };
  }

  private toDeploymentDetail(
    row: Prisma.AssignmentBatchGetPayload<{
      include: {
        assignment: true;
        batch: { include: { coaches: true } };
        students: { include: { student: true } };
      };
    }>
  ): AssignmentDeploymentDetail {
    return {
      ...this.toDeployment(row),
      description: row.assignment.description,
      pgn: row.assignment.pgn,
      pgnUrl: row.assignment.pgnUrl,
      activityType: row.assignment.activityType,
      submissions: row.students.map((s) => ({
        studentId: s.studentId,
        studentName: this.fullName(s.student) ?? "Unknown",
        status: s.status as AssignmentStatusType,
        timeSpentSeconds: s.timeSpentSeconds,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        note: s.note,
        bestScorePercent: s.bestScorePercent,
        bestAccuracyPercent: s.bestAccuracyPercent,
        attemptCount: s.attemptCount,
        lastAttemptAt: s.lastAttemptAt ? s.lastAttemptAt.toISOString() : null
      }))
    };
  }

  private toStudentItem(
    row: Prisma.StudentAssignmentGetPayload<{ include: typeof studentInclude }>
  ): StudentAssignmentItem {
    const assignment = row.assignmentBatch.assignment;
    const solution = this.solutionFromRow(assignment.solutionMovesJson);
    const revealSolution = row.status === "COMPLETED" || row.completedAt !== null;
    return {
      id: row.id,
      assignmentId: assignment.id,
      title: assignment.title,
      description: assignment.description,
      pgn: assignment.pgn,
      pgnUrl: assignment.pgnUrl,
      difficulty: assignment.difficulty as AssignmentDifficulty,
      timeLimitMinutes: assignment.timeLimitMinutes,
      dueDate: row.assignmentBatch.dueDate.toISOString(),
      coachName: this.fullName(assignment.createdBy),
      batchName: row.assignmentBatch.batch.name,
      status: row.status as AssignmentStatusType,
      timeSpentSeconds: row.timeSpentSeconds,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      note: row.note,
      bestScorePercent: row.bestScorePercent,
      bestAccuracyPercent: row.bestAccuracyPercent,
      attemptCount: row.attemptCount,
      lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
      solutionLength: solution ? solution.length : null,
      solutionMoves: revealSolution ? solution : null,
      ...this.toActivityConfig(assignment)
    };
  }

  private statsFrom(students: { status: string }[]): AssignmentDeploymentStats {
    return {
      total: students.length,
      completed: students.filter((s) => s.status === "COMPLETED").length,
      inProgress: students.filter((s) => s.status === "IN_PROGRESS").length,
      pending: students.filter((s) => s.status === "PENDING").length
    };
  }

  private fullName(user: { firstName: string; lastName: string | null } | null) {
    if (!user) return null;
    return `${user.firstName} ${user.lastName ?? ""}`.trim();
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

  private async getStaffOrCoach(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.COACH && !this.isAdmin(user.role)) {
      throw new ForbiddenException("Only coaches and admins can manage assignments.");
    }
    return user;
  }

  private async getCoach(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only coaches can assign work to batches.");
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
