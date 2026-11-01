import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  collectPuzzleTopicSubtreeIds,
  decidePlayoutOutcome,
  isSystemPuzzleFolder,
  mcqConfigSchema,
  playoutConfigSchema,
  SYSTEM_PUZZLE_FOLDER_SLUGS,
  type BulkLibraryActivityRequest,
  type BulkLibraryActivityResponse,
  type CreateLibraryActivityRequest,
  type LibraryActivityDto,
  type LibraryActivityKind,
  type LibraryActivityResponse,
  type LibraryItemKind,
  type LibraryListQuery,
  type LibraryListResponse,
  type McqConfig,
  type PlayoutConfig,
  type UpdateLibraryActivityRequest
} from "@nexa-chess/types";
import {
  LibraryActivityKind as DbKind,
  Prisma,
  PuzzleSource,
  PuzzleStatus,
  PuzzleVisibility,
  UserRole,
  type LibraryActivity,
  type User
} from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { PrismaService } from "../prisma/prisma.service";
import { assertAdmin, assertStaffOrCoach, authenticateUser, fullName, isAdminRole, puzzleAuthorName } from "../puzzle/puzzle-auth.helper";
import { normalizeEngineFen } from "../stockfish/stockfish.service";
import { TrashRepository } from "../trash/trash.repository";
import { isActivityImageUrl, UploadService } from "../upload/upload.service";
import { playoutFacts } from "./playout-position";

const include = {
  createdBy: { select: { firstName: true, lastName: true } },
  folder: { select: { id: true, name: true, slug: true } }
} satisfies Prisma.LibraryActivityInclude;

type Row = Prisma.LibraryActivityGetPayload<{ include: typeof include }>;

const DEFAULT_PAGE_SIZE = 25;

type LibraryRow = {
  kind: LibraryItemKind;
  id: string;
  title: string;
  description: string | null;
  difficulty: LibraryActivityDto["difficulty"];
  topic_id: string;
  topic_name: string;
  topic: string | null;
  tags: string[];
  status: LibraryActivityDto["status"];
  visibility: LibraryActivityDto["visibility"];
  created_at: Date;
  updated_at: Date;
  preview_fen: string | null;
  thumbnail_url: string | null;
  source: string | null;
  created_by_role: string;
  first_name: string | null;
  last_name: string | null;
  total: bigint;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Stored config → a position to draw as the thumbnail. */
export function activityPreviewFen(kind: LibraryActivityKind, config: unknown): string | null {
  const value = config as { startFen?: string; question?: { fen?: string | null } };
  return (kind === "PLAYOUT" ? value.startFen : value.question?.fen) ?? null;
}

/**
 * MCQ and Playout authoring, and the unified library list. Admins author (spec:
 * "all content is prepared before Live Classes"); coaches browse what is
 * published. Students never reach these routes: `config` holds the answer key.
 */
@Injectable()
export class LibraryActivityService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trash: TrashRepository,
    private readonly uploads: UploadService
  ) {}

  // ── The unified list ──

  /**
   * Puzzles and activities in one page. One SQL UNION so paging and sorting are
   * exact across both tables. Raw SQL skips the soft-delete extension, so each
   * branch says `isDeleted = false` itself.
   */
  async library(accessToken: string | undefined, query: LibraryListQuery): Promise<LibraryListResponse> {
    const user = assertStaffOrCoach(await this.authenticate(accessToken));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const items = await this.libraryCte(user, query);

    const sortColumn = { createdAt: "i.created_at", title: "i.title", updatedAt: "i.updated_at" }[query.sort ?? "title"];
    const direction = query.order === "desc" ? "DESC" : "ASC";

    const [rows, topics] = await Promise.all([
      this.prisma.$queryRaw<LibraryRow[]>(Prisma.sql`
        WITH items AS (${items})
        SELECT i.*, t.name AS topic_name, u."firstName" AS first_name, u."lastName" AS last_name,
               count(*) OVER () AS total
        FROM items i
        JOIN puzzle_topics t ON t.id = i.topic_id
        LEFT JOIN users u ON u.id = i.created_by_id
        ORDER BY ${Prisma.raw(sortColumn)} ${Prisma.raw(direction)}, i.id ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`),
      this.prisma.$queryRaw<{ topic: string }[]>(Prisma.sql`
        WITH items AS (${await this.libraryCte(user, { ...query, topic: undefined })})
        SELECT DISTINCT i.topic FROM items i WHERE i.topic IS NOT NULL ORDER BY i.topic LIMIT 100`)
    ]);

    const total = rows.length ? Number(rows[0].total) : 0;
    return {
      items: rows.map((row) => ({
        createdAt: row.created_at.toISOString(),
        createdByName:
          row.source === PuzzleSource.LICHESS
            ? "Lichess"
            : (fullName(row.first_name ? { firstName: row.first_name, lastName: row.last_name } : null) ??
              (row.created_by_role === UserRole.COACH ? "Coach" : "Admin")),
        description: row.description,
        difficulty: row.difficulty,
        id: row.id,
        kind: row.kind,
        previewFen: row.preview_fen,
        status: row.status,
        tags: row.tags,
        thumbnailUrl: row.thumbnail_url,
        title: row.title,
        topic: row.topic,
        topicId: row.topic_id,
        topicName: row.topic_name,
        updatedAt: row.updated_at.toISOString(),
        visibility: row.visibility
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      topics: topics.map((t) => t.topic)
    };
  }

  private async libraryCte(user: User, query: LibraryListQuery): Promise<Prisma.Sql> {
    const admin = isAdminRole(user.role);
    const search = query.search?.trim();
    const like = search ? `%${escapeLike(search)}%` : null;
    const folderIds = query.topicId ? await this.folderIds(query.topicId, query.topicScope) : null;
    // Hidden caches stay out of the library unless that folder is opened directly.
    const hidden = await this.prisma.puzzleTopic.findMany({
      where: { slug: { in: [...SYSTEM_PUZZLE_FOLDER_SLUGS] } },
      select: { id: true }
    });
    const hiddenIds = hidden.map((t) => t.id).filter((id) => id !== query.topicId);

    const shared = (alias: "p" | "a") => {
      const col = (name: string) => Prisma.raw(`${alias}."${name}"`);
      const parts: Prisma.Sql[] = [Prisma.sql`${col("isDeleted")} = false`];
      if (folderIds) parts.push(Prisma.sql`${col("topicId")} IN (${Prisma.join(folderIds)})`);
      if (hiddenIds.length) parts.push(Prisma.sql`${col("topicId")} NOT IN (${Prisma.join(hiddenIds)})`);
      if (query.difficulty) parts.push(Prisma.sql`${col("difficulty")}::text = ${query.difficulty}`);
      if (query.status) parts.push(Prisma.sql`${col("status")}::text = ${query.status}`);
      if (like) {
        parts.push(Prisma.sql`(${col("title")} ILIKE ${like} OR ${col("description")} ILIKE ${like} OR ${search} = ANY(${col("tags")}))`);
      }
      return parts;
    };

    const puzzleWhere = shared("p");
    if (!admin) {
      puzzleWhere.push(Prisma.sql`(p.visibility = 'GLOBAL' OR p."createdById" = ${user.id})`);
      puzzleWhere.push(Prisma.sql`p.source <> 'GAME'`);
    }
    if (query.topic) puzzleWhere.push(Prisma.sql`(p."puzzleType"::text = ${query.topic} OR ${query.topic} = ANY(p.tags))`);

    const activityWhere = shared("a");
    // Coaches see what is ready to use: published, shared content.
    if (!admin) activityWhere.push(Prisma.sql`a.status = 'PUBLISHED' AND a.visibility = 'GLOBAL'`);
    if (query.topic) activityWhere.push(Prisma.sql`(a.topic = ${query.topic} OR ${query.topic} = ANY(a.tags))`);
    if (query.kind === "MCQ" || query.kind === "PLAYOUT") activityWhere.push(Prisma.sql`a.kind::text = ${query.kind}`);

    const puzzles = Prisma.sql`
      SELECT 'PUZZLE'::text AS kind, p.id, p.title, p.description, p.difficulty::text AS difficulty,
             p."topicId" AS topic_id, p."puzzleType"::text AS topic, p.tags, p.status::text AS status,
             p.visibility::text AS visibility, p."createdAt" AS created_at, p."updatedAt" AS updated_at,
             p.fen AS preview_fen, NULL::text AS thumbnail_url, p.source::text AS source,
             p."createdByRole"::text AS created_by_role, p."createdById" AS created_by_id
      FROM puzzles p WHERE ${Prisma.join(puzzleWhere, " AND ")}`;
    const activities = Prisma.sql`
      SELECT a.kind::text AS kind, a.id, a.title, a.description, a.difficulty::text AS difficulty,
             a."topicId" AS topic_id, a.topic, a.tags, a.status::text AS status,
             a.visibility::text AS visibility, a."createdAt" AS created_at, a."updatedAt" AS updated_at,
             COALESCE(a."configJson"->>'startFen', a."configJson"->'question'->>'fen') AS preview_fen,
             COALESCE(a."thumbnailUrl", a."configJson"->'question'->>'imageUrl') AS thumbnail_url,
             NULL::text AS source, a."createdByRole"::text AS created_by_role, a."createdById" AS created_by_id
      FROM library_activities a WHERE ${Prisma.join(activityWhere, " AND ")}`;

    if (query.kind === "PUZZLE") return puzzles;
    if (query.kind === "MCQ" || query.kind === "PLAYOUT") return activities;
    return Prisma.sql`${puzzles} UNION ALL ${activities}`;
  }

  private async folderIds(topicId: string, scope: "direct" | "subtree" = "subtree"): Promise<string[]> {
    if (scope === "direct") return [topicId];
    const links = await this.prisma.puzzleTopic.findMany({ select: { id: true, parentId: true } });
    return collectPuzzleTopicSubtreeIds(links, topicId);
  }

  // ── Reading one ──

  async get(accessToken: string | undefined, id: string): Promise<LibraryActivityResponse> {
    const user = assertStaffOrCoach(await this.authenticate(accessToken));
    const row = await this.prisma.libraryActivity.findUnique({ where: { id }, include });
    if (!row || !this.canRead(row, user)) throw new NotFoundException("Activity not found.");
    return { activity: this.toDto(row, user) };
  }

  // ── Authoring (admin) ──

  async create(accessToken: string | undefined, body: CreateLibraryActivityRequest): Promise<LibraryActivityResponse> {
    const user = assertAdmin(await this.authenticate(accessToken));
    await this.assertFolder(body.topicId);
    const config = this.checkConfig(body.kind, body.config);
    this.assertImage(body.thumbnailUrl);
    const status = body.status ?? PuzzleStatus.DRAFT;
    const row = await this.prisma.libraryActivity.create({
      data: {
        configJson: config as unknown as Prisma.InputJsonValue,
        createdById: user.id,
        createdByRole: user.role,
        description: body.description?.trim() || null,
        difficulty: body.difficulty,
        kind: body.kind as DbKind,
        ...(status === PuzzleStatus.PUBLISHED ? { publishedAt: new Date(), publishedById: user.id } : {}),
        status,
        tags: this.cleanTags(body.tags),
        thumbnailUrl: body.thumbnailUrl ?? null,
        title: body.title.trim(),
        topic: body.topic?.trim() || null,
        topicId: body.topicId,
        updatedById: user.id,
        visibility: PuzzleVisibility.GLOBAL
      },
      include
    });
    return { activity: this.toDto(row, user) };
  }

  async update(accessToken: string | undefined, id: string, body: UpdateLibraryActivityRequest): Promise<LibraryActivityResponse> {
    const user = assertAdmin(await this.authenticate(accessToken));
    const existing = await this.prisma.libraryActivity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Activity not found.");
    if (body.topicId) await this.assertFolder(body.topicId);
    this.assertImage(body.thumbnailUrl);

    const data: Prisma.LibraryActivityUncheckedUpdateInput = { updatedById: user.id };
    if (body.config !== undefined) {
      data.configJson = this.checkConfig(existing.kind, body.config) as unknown as Prisma.InputJsonValue;
    }
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.difficulty) data.difficulty = body.difficulty;
    if (body.tags) data.tags = this.cleanTags(body.tags);
    if (body.thumbnailUrl !== undefined) data.thumbnailUrl = body.thumbnailUrl;
    if (body.title) data.title = body.title.trim();
    if (body.topic !== undefined) data.topic = body.topic?.trim() || null;
    if (body.topicId) data.topicId = body.topicId;
    if (body.status && body.status !== existing.status) Object.assign(data, this.statusChange(body.status, user));

    const row = await this.prisma.libraryActivity.update({ where: { id }, data, include });
    return { activity: this.toDto(row, user) };
  }

  async setPublished(accessToken: string | undefined, id: string, published: boolean): Promise<LibraryActivityResponse> {
    return this.setStatus(accessToken, id, published ? PuzzleStatus.PUBLISHED : PuzzleStatus.DRAFT);
  }

  async setArchived(accessToken: string | undefined, id: string, archived: boolean): Promise<LibraryActivityResponse> {
    return this.setStatus(accessToken, id, archived ? PuzzleStatus.ARCHIVED : PuzzleStatus.DRAFT);
  }

  private async setStatus(accessToken: string | undefined, id: string, status: PuzzleStatus): Promise<LibraryActivityResponse> {
    const user = assertAdmin(await this.authenticate(accessToken));
    const existing = await this.prisma.libraryActivity.findUnique({ where: { id }, select: { status: true } });
    if (!existing) throw new NotFoundException("Activity not found.");
    const row = await this.prisma.libraryActivity.update({
      where: { id },
      data: existing.status === status ? {} : { ...this.statusChange(status, user), updatedById: user.id },
      include
    });
    return { activity: this.toDto(row, user) };
  }

  /** A draft copy: the same content under a new id, in the same folder. */
  async duplicate(accessToken: string | undefined, id: string): Promise<LibraryActivityResponse> {
    const user = assertAdmin(await this.authenticate(accessToken));
    const source = await this.prisma.libraryActivity.findUnique({ where: { id } });
    if (!source) throw new NotFoundException("Activity not found.");
    const row = await this.prisma.libraryActivity.create({
      data: {
        configJson: source.configJson as Prisma.InputJsonValue,
        createdById: user.id,
        createdByRole: user.role,
        description: source.description,
        difficulty: source.difficulty,
        kind: source.kind,
        status: PuzzleStatus.DRAFT,
        tags: source.tags,
        thumbnailUrl: source.thumbnailUrl,
        title: `${source.title} (copy)`.slice(0, 200),
        topic: source.topic,
        topicId: source.topicId,
        updatedById: user.id,
        visibility: source.visibility
      },
      include
    });
    return { activity: this.toDto(row, user) };
  }

  /** To Trash; past runs keep their frozen copy, and a queued item shows as unavailable. */
  async remove(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    const user = assertAdmin(await this.authenticate(accessToken));
    const existing = await this.prisma.libraryActivity.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException("Activity not found.");
    await this.prisma.$transaction((tx) => this.trash.softDelete(tx, "LibraryActivity", id, user.id));
    return { success: true };
  }

  async bulk(accessToken: string | undefined, body: BulkLibraryActivityRequest): Promise<BulkLibraryActivityResponse> {
    const user = assertAdmin(await this.authenticate(accessToken));
    if (body.action === "MOVE") await this.assertFolder(body.topicId as string);

    const ids = [...new Set(body.ids)];
    const rows = await this.prisma.libraryActivity.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const response: BulkLibraryActivityResponse = { done: [], skipped: [] };

    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        response.skipped.push({ id, reason: "Not found." });
        continue;
      }
      switch (body.action) {
        case "DELETE":
          await this.prisma.$transaction((tx) => this.trash.softDelete(tx, "LibraryActivity", id, user.id));
          break;
        case "MOVE":
          await this.prisma.libraryActivity.update({ where: { id }, data: { topicId: body.topicId, updatedById: user.id } });
          break;
        case "PUBLISH":
          if (row.status !== PuzzleStatus.PUBLISHED) {
            await this.prisma.libraryActivity.update({
              where: { id },
              data: { ...this.statusChange(PuzzleStatus.PUBLISHED, user), updatedById: user.id }
            });
          }
          break;
        case "ARCHIVE":
          if (row.status !== PuzzleStatus.ARCHIVED) {
            await this.prisma.libraryActivity.update({
              where: { id },
              data: { ...this.statusChange(PuzzleStatus.ARCHIVED, user), updatedById: user.id }
            });
          }
          break;
      }
      response.done.push(id);
    }
    return response;
  }

  /** Admin only, type- and size-checked by the controller; files go to their own folder. */
  async uploadImage(accessToken: string | undefined, file: Express.Multer.File): Promise<{ url: string }> {
    assertAdmin(await this.authenticate(accessToken));
    const result = await this.uploads.uploadActivityImage(file);
    return { url: result.secure_url };
  }

  // ── Rules ──

  /**
   * Beyond the shape the schema checks: images must be ours, and a Playout must
   * be playable (a position the engine accepts, a game not already over, a goal
   * not already met). Returns the config as stored (a normalized start position).
   */
  private checkConfig(kind: LibraryActivityKind, raw: unknown): McqConfig | PlayoutConfig {
    if (kind === "MCQ") {
      const parsed = mcqConfigSchema.safeParse(raw);
      if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
      const config = parsed.data;
      this.assertImage(config.question.imageUrl);
      this.assertBoardFen(config.question.fen);
      for (const option of config.options) {
        this.assertImage(option.imageUrl);
        this.assertBoardFen(option.fen);
      }
      return config;
    }

    const parsed = playoutConfigSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
    const config = parsed.data;
    const fen = normalizeEngineFen(config.startFen);
    if (!fen.ok) throw new BadRequestException(fen.reason);
    const chess = new Chess(fen.fen);
    if (chess.isGameOver()) throw new BadRequestException("The game is already over in that position.");
    if (decidePlayoutOutcome(config.goal, playoutFacts(chess, config.studentColor, []))) {
      throw new BadRequestException("The goal is already met in the starting position.");
    }
    return { ...config, startFen: fen.fen };
  }

  /** A question's board is display-only, so it just has to be a readable placement. */
  private assertBoardFen(fen: string | null | undefined) {
    if (!fen) return;
    try {
      new Chess(fen, { skipValidation: true });
    } catch {
      throw new BadRequestException("One of the positions isn't a readable FEN.");
    }
  }

  private assertImage(url: string | null | undefined) {
    if (url && !isActivityImageUrl(url)) {
      throw new BadRequestException("Images must be uploaded here.");
    }
  }

  private async assertFolder(topicId: string) {
    const folder = await this.prisma.puzzleTopic.findUnique({ where: { id: topicId }, select: { slug: true } });
    if (!folder) throw new BadRequestException("That folder does not exist.");
    if (isSystemPuzzleFolder(folder)) throw new BadRequestException("System folders can't hold activities.");
  }

  private statusChange(status: PuzzleStatus, user: User): Prisma.LibraryActivityUncheckedUpdateInput {
    const now = new Date();
    if (status === PuzzleStatus.PUBLISHED) {
      return { archivedAt: null, archivedById: null, publishedAt: now, publishedById: user.id, status };
    }
    if (status === PuzzleStatus.ARCHIVED) return { archivedAt: now, archivedById: user.id, status };
    return { archivedAt: null, archivedById: null, status };
  }

  private cleanTags(tags: string[]): string[] {
    return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  }

  private canRead(row: Pick<LibraryActivity, "status" | "visibility">, user: User): boolean {
    if (isAdminRole(user.role)) return true;
    if (user.role !== UserRole.COACH) throw new ForbiddenException("Only coaches and admins can open this.");
    return row.status === PuzzleStatus.PUBLISHED && row.visibility === PuzzleVisibility.GLOBAL;
  }

  private authenticate(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private toDto(row: Row, user: User): LibraryActivityDto {
    return {
      archivedAt: row.archivedAt?.toISOString() ?? null,
      canManage: isAdminRole(user.role),
      config: row.configJson as unknown as McqConfig | PlayoutConfig,
      createdAt: row.createdAt.toISOString(),
      createdByName: puzzleAuthorName({ createdBy: row.createdBy, createdByRole: row.createdByRole, source: PuzzleSource.NEXA }),
      description: row.description,
      difficulty: row.difficulty,
      id: row.id,
      kind: row.kind,
      previewFen: activityPreviewFen(row.kind, row.configJson),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      status: row.status,
      tags: row.tags,
      thumbnailUrl: row.thumbnailUrl,
      title: row.title,
      topic: row.topic,
      topicId: row.topicId,
      topicName: row.folder.name,
      updatedAt: row.updatedAt.toISOString(),
      visibility: row.visibility
    };
  }
}
