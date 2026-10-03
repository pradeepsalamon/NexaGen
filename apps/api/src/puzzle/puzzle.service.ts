import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  BulkPuzzleActionRequest,
  BulkPuzzleActionResponse,
  CreatePuzzleRequest,
  ImportPuzzlesRequest,
  ImportPuzzlesResponse,
  PuzzleDetail,
  PuzzleListQuery,
  PuzzleListResponse,
  PuzzleResponse,
  PuzzleStatsResponse,
  PuzzleSummary,
  SetPuzzleArchivedRequest,
  SetPuzzlePublishedRequest,
  SolutionMove,
  UpdatePuzzleRequest,
  ValidatePuzzleRequest,
  ValidatePuzzleResponse
} from "@nexa-chess/types";
import { compareNatural, parseScoringOverride, type PuzzleScoringOverride } from "@nexa-chess/types";
import { Prisma, PuzzleStatus, PuzzleVisibility, UserRole, type User } from "@prisma/client";
import { Chess } from "chess.js";
import {
  AssignmentEvaluationService,
  assertValidFen
} from "../assignment/assignment-evaluation.service";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginationMeta,
  resolveOrderBy
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { puzzleTopicWhere } from "./puzzle-topic-filter";
import { TrashRepository } from "../trash/trash.repository";
import {
  assertStaffOrCoach,
  authenticateUser,
  fullName,
  isAdminRole
} from "./puzzle-auth.helper";


const puzzleInclude = {
  topic: { select: { name: true } },
  createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { attempts: true } }
} satisfies Prisma.PuzzleInclude;

type PuzzleRow = Prisma.PuzzleGetPayload<{ include: typeof puzzleInclude }>;

const ORDERABLE = ["title", "difficulty", "puzzleType", "status", "createdAt", "updatedAt"] as const;

@Injectable()
export class PuzzleService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trash: TrashRepository,
    private readonly evaluation: AssignmentEvaluationService
  ) {}

  async list(
    accessToken: string | undefined,
    query: PuzzleListQuery
  ): Promise<PuzzleListResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );

    const page = Math.max(1, Math.floor(Number(query.page) || 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(query.pageSize) || DEFAULT_PAGE_SIZE))
    );
    const search = (query.search ?? "").trim();

    const where: Prisma.PuzzleWhereInput = { ...this.visibilityWhere(user) };
    const and: Prisma.PuzzleWhereInput[] = [];

    if (query.topicId) {
      and.push(await puzzleTopicWhere(this.prisma, query.topicId, query.topicScope));
    }
    if (query.puzzleType) and.push({ puzzleType: query.puzzleType });
    if (query.difficulty) and.push({ difficulty: query.difficulty });
    if (query.status) and.push({ status: query.status });
    if (query.visibility) and.push({ visibility: query.visibility });
    if (query.creatorId) and.push({ createdById: query.creatorId });
    if (query.scope === "mine") and.push({ createdById: user.id });
    if (query.scope === "admin") and.push({ visibility: PuzzleVisibility.GLOBAL });
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

    const orderBy = resolveOrderBy(query, ORDERABLE, { title: "asc" });

    // Postgres sorts titles as text ("Puzzle 10" before "Puzzle 2"), so a title
    // sort ranks the matching ids naturally here and loads just the page.
    const titleOrder = !Array.isArray(orderBy) ? orderBy.title : undefined;
    if (titleOrder) {
      const keys = await this.prisma.puzzle.findMany({ where, select: { id: true, title: true } });
      const sign = titleOrder === "desc" ? -1 : 1;
      keys.sort((a, b) => sign * compareNatural(a.title, b.title) || a.id.localeCompare(b.id));
      const pageIds = keys.slice((page - 1) * pageSize, page * pageSize).map((k) => k.id);
      const pageRows = await this.prisma.puzzle.findMany({
        where: { id: { in: pageIds } },
        include: puzzleInclude
      });
      const byId = new Map(pageRows.map((row) => [row.id, row]));
      return {
        puzzles: pageIds.flatMap((id) => {
          const row = byId.get(id);
          return row ? [this.toSummary(row, user)] : [];
        }),
        pagination: paginationMeta(keys.length, page, pageSize)
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.puzzle.findMany({
        where,
        include: puzzleInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.puzzle.count({ where })
    ]);

    return {
      puzzles: rows.map((row) => this.toSummary(row, user)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  async get(accessToken: string | undefined, id: string): Promise<PuzzleResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const row = await this.loadVisible(id, user);
    return { puzzle: this.toDetail(row, user, true) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreatePuzzleRequest
  ): Promise<PuzzleResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    await this.assertTopicExists(dto.topicId);
    const created = await this.createOne(user, dto);
    return { puzzle: this.toDetail(created, user, true) };
  }

  // One bad game in a PGN must not sink the rest, so failures are per item.
  async importMany(
    accessToken: string | undefined,
    dto: ImportPuzzlesRequest
  ): Promise<ImportPuzzlesResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const topicIds = [...new Set(dto.puzzles.map((p) => p.topicId))];
    for (const topicId of topicIds) await this.assertTopicExists(topicId);

    let created = 0;
    const failed: ImportPuzzlesResponse["failed"] = [];
    for (const [index, item] of dto.puzzles.entries()) {
      try {
        await this.createOne(user, item);
        created += 1;
      } catch (error) {
        failed.push({
          index,
          title: item.title,
          error: error instanceof Error ? error.message : "Could not create puzzle."
        });
      }
    }
    return { created, failed };
  }

  private async createOne(user: User, dto: CreatePuzzleRequest) {
    const fen = assertValidFen(dto.fen);
    const solution = this.evaluation.normalizeSolution(fen, dto.solutionMoves ?? []);

    const visibility = isAdminRole(user.role)
      ? dto.visibility ?? PuzzleVisibility.GLOBAL
      : PuzzleVisibility.PRIVATE;

    const publish = dto.status === "PUBLISHED";
    if (publish && solution.length === 0) {
      throw new BadRequestException("A published puzzle needs at least one solution move.");
    }

    return this.prisma.puzzle.create({
      data: {
        topicId: dto.topicId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        puzzleType: dto.puzzleType,
        difficulty: dto.difficulty,
        fen,
        solutionMovesJson: solution as unknown as Prisma.InputJsonValue,
        explanation: dto.explanation?.trim() || null,
        hintsJson: (dto.hints ?? []) as unknown as Prisma.InputJsonValue,
        tags: dto.tags ?? [],
        estimatedSeconds: dto.estimatedSeconds ?? null,
        scoringJson: this.scoringJsonInput(dto.scoring),
        status: publish ? PuzzleStatus.PUBLISHED : PuzzleStatus.DRAFT,
        visibility,
        createdById: user.id,
        createdByRole: user.role,
        updatedById: user.id,
        publishedById: publish ? user.id : null,
        publishedAt: publish ? new Date() : null
      },
      include: puzzleInclude
    });
  }

  async update(
    accessToken: string | undefined,
    id: string,
    dto: UpdatePuzzleRequest
  ): Promise<PuzzleResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const existing = await this.loadManageable(id, user);

    if (dto.topicId && dto.topicId !== existing.topicId) {
      await this.assertTopicExists(dto.topicId);
    }

    const nextFen = dto.fen !== undefined ? assertValidFen(dto.fen) : existing.fen;
    const rawSolution =
      dto.solutionMoves !== undefined
        ? dto.solutionMoves
        : this.solutionFromRow(existing.solutionMovesJson);
    const solution =
      dto.fen !== undefined || dto.solutionMoves !== undefined
        ? this.evaluation.normalizeSolution(nextFen, rawSolution)
        : rawSolution;

    if (existing.status === PuzzleStatus.PUBLISHED && solution.length === 0) {
      throw new BadRequestException("A published puzzle needs at least one solution move.");
    }

    const data: Prisma.PuzzleUncheckedUpdateInput = { updatedById: user.id };
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.topicId !== undefined) data.topicId = dto.topicId;
    if (dto.puzzleType !== undefined) data.puzzleType = dto.puzzleType;
    if (dto.difficulty !== undefined) data.difficulty = dto.difficulty;
    if (dto.fen !== undefined || dto.solutionMoves !== undefined) {
      data.fen = nextFen;
      data.solutionMovesJson = solution as unknown as Prisma.InputJsonValue;
    }
    if (dto.explanation !== undefined) data.explanation = dto.explanation?.trim() || null;
    if (dto.hints !== undefined) {
      data.hintsJson = dto.hints as unknown as Prisma.InputJsonValue;
    }
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.estimatedSeconds !== undefined) data.estimatedSeconds = dto.estimatedSeconds;
    if (dto.scoring !== undefined) data.scoringJson = this.scoringJsonInput(dto.scoring);

    const updated = await this.prisma.puzzle.update({
      where: { id },
      data,
      include: puzzleInclude
    });
    return { puzzle: this.toDetail(updated, user, true) };
  }

  async setPublished(
    accessToken: string | undefined,
    id: string,
    dto: SetPuzzlePublishedRequest
  ): Promise<PuzzleResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const existing = await this.loadManageable(id, user);

    if (dto.published && this.solutionFromRow(existing.solutionMovesJson).length === 0) {
      throw new BadRequestException("Add a solution line before publishing this puzzle.");
    }

    const updated = await this.prisma.puzzle.update({
      where: { id },
      data: dto.published
        ? {
            status: PuzzleStatus.PUBLISHED,
            publishedAt: existing.publishedAt ?? new Date(),
            publishedById: existing.publishedById ?? user.id,
            archivedAt: null,
            archivedById: null,
            updatedById: user.id
          }
        : { status: PuzzleStatus.DRAFT, updatedById: user.id },
      include: puzzleInclude
    });
    return { puzzle: this.toDetail(updated, user, true) };
  }

  async setArchived(
    accessToken: string | undefined,
    id: string,
    dto: SetPuzzleArchivedRequest
  ): Promise<PuzzleResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const existing = await this.loadManageable(id, user);

    const updated = await this.prisma.puzzle.update({
      where: { id },
      data: dto.archived
        ? {
            status: PuzzleStatus.ARCHIVED,
            archivedAt: new Date(),
            archivedById: user.id,
            updatedById: user.id
          }
        : {
            status: existing.publishedAt ? PuzzleStatus.PUBLISHED : PuzzleStatus.DRAFT,
            archivedAt: null,
            archivedById: null,
            updatedById: user.id
          },
      include: puzzleInclude
    });
    return { puzzle: this.toDetail(updated, user, true) };
  }

  async duplicate(accessToken: string | undefined, id: string): Promise<PuzzleResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const source = await this.loadVisible(id, user);

    const created = await this.prisma.puzzle.create({
      data: {
        topicId: source.topicId,
        title: `${source.title} (copy)`.slice(0, 200),
        description: source.description,
        puzzleType: source.puzzleType,
        difficulty: source.difficulty,
        fen: source.fen,
        solutionMovesJson: source.solutionMovesJson ?? [],
        explanation: source.explanation,
        hintsJson: source.hintsJson ?? [],
        tags: source.tags,
        estimatedSeconds: source.estimatedSeconds,
        scoringJson: source.scoringJson ?? Prisma.DbNull,
        status: PuzzleStatus.DRAFT,
        visibility: isAdminRole(user.role)
          ? PuzzleVisibility.GLOBAL
          : PuzzleVisibility.PRIVATE,
        createdById: user.id,
        createdByRole: user.role,
        updatedById: user.id
      },
      include: puzzleInclude
    });
    return { puzzle: this.toDetail(created, user, true) };
  }

  async remove(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    await this.loadManageable(id, user);
    await this.prisma.$transaction((tx) =>
      this.trash.softDelete(tx, "Puzzle", id, user.id)
    );
    return { success: true };
  }

  async bulk(
    accessToken: string | undefined,
    dto: BulkPuzzleActionRequest
  ): Promise<BulkPuzzleActionResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );

    const rows = await this.prisma.puzzle.findMany({
      where: { id: { in: dto.ids }, ...this.visibilityWhere(user) },
      select: { id: true, createdById: true, visibility: true, solutionMovesJson: true }
    });
    const manageable = rows.filter((row) => this.canManage(row, user));

    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const row of manageable) {
        if (dto.action === "delete") {
          await this.trash.softDelete(tx, "Puzzle", row.id, user.id);
          updated += 1;
          continue;
        }
        if (dto.action === "publish") {
          if (this.solutionFromRow(row.solutionMovesJson).length === 0) continue;
          await tx.puzzle.update({
            where: { id: row.id },
            data: {
              status: PuzzleStatus.PUBLISHED,
              publishedAt: new Date(),
              publishedById: user.id,
              archivedAt: null,
              archivedById: null,
              updatedById: user.id
            }
          });
        } else if (dto.action === "unpublish") {
          await tx.puzzle.update({
            where: { id: row.id },
            data: { status: PuzzleStatus.DRAFT, updatedById: user.id }
          });
        } else if (dto.action === "archive") {
          await tx.puzzle.update({
            where: { id: row.id },
            data: {
              status: PuzzleStatus.ARCHIVED,
              archivedAt: new Date(),
              archivedById: user.id,
              updatedById: user.id
            }
          });
        } else if (dto.action === "unarchive") {
          await tx.puzzle.update({
            where: { id: row.id },
            data: {
              status: PuzzleStatus.DRAFT,
              archivedAt: null,
              archivedById: null,
              updatedById: user.id
            }
          });
        }
        updated += 1;
      }
    });
    return { updated };
  }

  async stats(accessToken: string | undefined): Promise<PuzzleStatsResponse> {
    const user = assertStaffOrCoach(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const where = this.visibilityWhere(user);

    const [total, published, draft, archived, global, priv, topics] = await Promise.all([
      this.prisma.puzzle.count({ where }),
      this.prisma.puzzle.count({ where: { ...where, status: PuzzleStatus.PUBLISHED } }),
      this.prisma.puzzle.count({ where: { ...where, status: PuzzleStatus.DRAFT } }),
      this.prisma.puzzle.count({ where: { ...where, status: PuzzleStatus.ARCHIVED } }),
      this.prisma.puzzle.count({ where: { ...where, visibility: PuzzleVisibility.GLOBAL } }),
      this.prisma.puzzle.count({ where: { ...where, visibility: PuzzleVisibility.PRIVATE } }),
      this.prisma.puzzleTopic.count()
    ]);

    return { total, published, draft, archived, global, private: priv, topics };
  }

  async validate(
    accessToken: string | undefined,
    dto: ValidatePuzzleRequest
  ): Promise<ValidatePuzzleResponse> {
    assertStaffOrCoach(await authenticateUser(this.jwtService, this.prisma, accessToken));
    try {
      const fen = assertValidFen(dto.fen);
      const normalizedSolution = this.evaluation.normalizeSolution(fen, dto.solutionMoves);
      return {
        valid: true,
        normalizedSolution,
        sideToMove: this.sideToMove(fen)
      };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  // ── internals ──

  private visibilityWhere(user: User): Prisma.PuzzleWhereInput {
    if (isAdminRole(user.role)) return {};
    return { OR: [{ visibility: PuzzleVisibility.GLOBAL }, { createdById: user.id }] };
  }

  private canManage(
    row: { visibility: PuzzleVisibility; createdById: string | null },
    user: User
  ): boolean {
    if (isAdminRole(user.role)) return true;
    return row.createdById === user.id;
  }

  private async loadVisible(id: string, user: User): Promise<PuzzleRow> {
    const row = await this.prisma.puzzle.findUnique({ where: { id }, include: puzzleInclude });
    if (!row) throw new NotFoundException("Puzzle not found.");
    if (!isAdminRole(user.role)) {
      const visible = row.visibility === PuzzleVisibility.GLOBAL || row.createdById === user.id;
      if (!visible) throw new NotFoundException("Puzzle not found.");
    }
    return row;
  }

  private async loadManageable(id: string, user: User): Promise<PuzzleRow> {
    const row = await this.loadVisible(id, user);
    if (!this.canManage(row, user)) {
      throw new ForbiddenException("You cannot modify this puzzle.");
    }
    return row;
  }

  private async assertTopicExists(topicId: string) {
    const topic = await this.prisma.puzzleTopic.findUnique({ where: { id: topicId } });
    if (!topic) throw new BadRequestException("The selected topic does not exist.");
  }

  private solutionFromRow(raw: Prisma.JsonValue | null): SolutionMove[] {
    if (!Array.isArray(raw)) return [];
    return raw as unknown as SolutionMove[];
  }

  private sideToMove(fen: string): "white" | "black" {
    try {
      return new Chess(fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  }

  private toSummary(row: PuzzleRow, viewer: User): PuzzleSummary {
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
      createdByName: fullName(row.createdBy) ?? this.roleLabel(row.createdByRole),
      createdByRole: row.createdByRole as UserRole,
      attemptCount: row._count.attempts,
      canManage: this.canManage(row, viewer),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null
    };
  }

  private toDetail(row: PuzzleRow, viewer: User, revealSolution: boolean): PuzzleDetail {
    const solution = this.solutionFromRow(row.solutionMovesJson);
    const hints = Array.isArray(row.hintsJson) ? (row.hintsJson as unknown as string[]) : [];
    return {
      ...this.toSummary(row, viewer),
      fen: row.fen,
      orientation: this.sideToMove(row.fen),
      solutionMoves: revealSolution ? solution : null,
      explanation: row.explanation,
      hints
    };
  }

  private roleLabel(role: UserRole): string {
    return role === UserRole.COACH ? "Coach" : "Admin";
  }

  /** An empty override is stored as NULL so the admin default visibly applies. */
  private scoringJsonInput(
    scoring: PuzzleScoringOverride | null | undefined
  ): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (!scoring) return Prisma.DbNull;
    const cleaned = Object.fromEntries(
      Object.entries(scoring).filter(([, value]) => value !== undefined)
    );
    return Object.keys(cleaned).length ? (cleaned as Prisma.InputJsonValue) : Prisma.DbNull;
  }
}
