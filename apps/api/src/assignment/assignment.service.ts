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
  AssignmentDeployment,
  AssignmentDeploymentDetail,
  AssignmentDeploymentDetailResponse,
  AssignmentDeploymentListResponse,
  AssignmentDeploymentStats,
  AssignmentDifficulty,
  AssignmentLibraryItem,
  AssignmentLibraryResponse,
  AssignmentResponse,
  AssignmentStatus as AssignmentStatusType,
  CreateAssignmentRequest,
  DeployAssignmentRequest,
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

/**
 * The interactive-transaction client as seen inside `prisma.$transaction(cb)`.
 * `PrismaService`'s getters expose the *extended* delegates, so a `Pick` of it
 * matches the callback argument — `Prisma.TransactionClient` does not (it is the
 * un-extended shape).
 */
type Tx = Pick<PrismaService, "assignment" | "assignmentBatch" | "batchStudent" | "studentAssignment">;

type AuthedUser = { id: string; role: UserRole };

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
    private readonly uploadService: UploadService
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

    return { assignment: this.toLibraryItem(row, user) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreateAssignmentRequest
  ): Promise<AssignmentResponse> {
    const user = await this.getStaffOrCoach(accessToken);
    this.assertValidPgn(dto.pgn);

    const batchIds = [...new Set(dto.batchIds ?? [])];
    if (batchIds.length > 0) {
      if (this.isAdmin(user.role)) {
        throw new BadRequestException(
          "Admins create library assignments; a coach assigns them to batches."
        );
      }
      await this.assertCoachOwnsBatches(user.id, batchIds);
    }

    const pgnUrl = await this.uploadPgn(dto.title, dto.pgn);

    const created = await this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          createdById: user.id,
          isLibrary: this.isAdmin(user.role),
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          pgn: dto.pgn,
          pgnUrl,
          difficulty: dto.difficulty,
          timeLimitMinutes: dto.timeLimitMinutes
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

    if (dto.pgn !== undefined) this.assertValidPgn(dto.pgn);

    const pgnChanged = dto.pgn !== undefined && dto.pgn !== existing.pgn;
    const pgnUrl = pgnChanged
      ? await this.uploadPgn(dto.title ?? existing.title, dto.pgn as string)
      : undefined;

    await this.prisma.assignment.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description:
          dto.description === undefined ? undefined : dto.description?.trim() || null,
        pgn: dto.pgn,
        pgnUrl,
        difficulty: dto.difficulty,
        timeLimitMinutes: dto.timeLimitMinutes
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

    const row = await this.prisma.studentAssignment.findUnique({ where: { id } });
    if (!row || row.studentId !== student.id) {
      throw new NotFoundException("Assignment not found.");
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

  private assertValidPgn(pgn: string) {
    const trimmed = pgn.trim();
    if (!trimmed) throw new BadRequestException("PGN is required.");

    try {
      new Chess().loadPgn(trimmed);
    } catch {
      throw new BadRequestException(
        "The PGN could not be parsed. Paste a valid game or line."
      );
    }
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

  private toLibraryItem(
    row: Prisma.AssignmentGetPayload<{
      include: { createdBy: true; _count: { select: { deployments: true } } };
    }>,
    viewer: AuthedUser
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
      submissions: row.students.map((s) => ({
        studentId: s.studentId,
        studentName: this.fullName(s.student) ?? "Unknown",
        status: s.status as AssignmentStatusType,
        timeSpentSeconds: s.timeSpentSeconds,
        completedAt: s.completedAt ? s.completedAt.toISOString() : null,
        note: s.note
      }))
    };
  }

  private toStudentItem(
    row: Prisma.StudentAssignmentGetPayload<{ include: typeof studentInclude }>
  ): StudentAssignmentItem {
    const assignment = row.assignmentBatch.assignment;
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
      note: row.note
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
