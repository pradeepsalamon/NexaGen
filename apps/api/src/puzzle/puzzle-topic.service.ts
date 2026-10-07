import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  collectPuzzleTopicSubtreeIds,
  compareNatural,
  isSystemPuzzleFolder,
  MAX_PUZZLE_TOPIC_DEPTH,
  puzzleTopicPath,
  type CopyPuzzleTopicRequest,
  type CopyPuzzleTopicResponse,
  type CreatePuzzleTopicRequest,
  type PuzzleTopicDto,
  type PuzzleTopicListResponse,
  type PuzzleTopicResponse,
  type ReassignPuzzleTopicRequest,
  type UpdatePuzzleTopicRequest
} from "@nexa-chess/types";
import { Prisma, PuzzleSource, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import {
  assertAdmin,
  authenticateUser,
  fullName,
  isAdminRole
} from "./puzzle-auth.helper";


const topicInclude = {
  createdBy: { select: { firstName: true, lastName: true } },
  _count: { select: { puzzles: { where: { isDeleted: false } } } }
} satisfies Prisma.PuzzleTopicInclude;

type TopicRow = Prisma.PuzzleTopicGetPayload<{ include: typeof topicInclude }>;
type TopicLink = { id: string; parentId: string | null };
type TrashClient = Parameters<TrashRepository["softDelete"]>[0];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "topic"
  );
}

@Injectable()
export class PuzzleTopicService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trash: TrashRepository
  ) {}

  async list(accessToken: string | undefined): Promise<PuzzleTopicListResponse> {
    const user = await this.authStaffOrCoach(accessToken);
    const rows = await this.prisma.puzzleTopic.findMany({
      include: topicInclude,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    });
    // Postgres orders names as text ("Set 10" before "Set 2"); re-sort naturally.
    rows.sort((x, y) => x.sortOrder - y.sortOrder || compareNatural(x.name, y.name));
    return { topics: rows.map((row) => this.toDto(row, user)) };
  }

  async get(accessToken: string | undefined, id: string): Promise<PuzzleTopicResponse> {
    const user = await this.authStaffOrCoach(accessToken);
    const row = await this.prisma.puzzleTopic.findUnique({ where: { id }, include: topicInclude });
    if (!row) throw new NotFoundException("Topic not found.");
    return { topic: this.toDto(row, user) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreatePuzzleTopicRequest
  ): Promise<PuzzleTopicResponse> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const name = dto.name.trim();
    const slug = slugify(name);
    const parentId = dto.parentId ?? null;
    if (parentId) this.assertPlacement(await this.loadLinks(), null, parentId);
    await this.assertNameFree(name, slug, parentId);

    const created = await this.prisma.puzzleTopic.create({
      data: {
        name,
        slug,
        parentId,
        description: dto.description?.trim() || null,
        icon: dto.icon?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        createdById: user.id
      },
      include: topicInclude
    });
    return { topic: this.toDto(created, user) };
  }

  async update(
    accessToken: string | undefined,
    id: string,
    dto: UpdatePuzzleTopicRequest
  ): Promise<PuzzleTopicResponse> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const existing = await this.prisma.puzzleTopic.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Topic not found.");

    const data: Prisma.PuzzleTopicUncheckedUpdateInput = {};
    const parentId = dto.parentId !== undefined ? dto.parentId : existing.parentId;
    if (parentId !== existing.parentId) {
      if (parentId) this.assertPlacement(await this.loadLinks(), id, parentId);
      data.parentId = parentId;
    }
    if (dto.name !== undefined || data.parentId !== undefined) {
      const name = (dto.name ?? existing.name).trim();
      const slug = slugify(name);
      await this.assertNameFree(name, slug, parentId, id);
      data.name = name;
      // System folders are found by their slug, so a rename keeps it.
      data.slug = isSystemPuzzleFolder(existing) ? existing.slug : slug;
    }
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.icon !== undefined) data.icon = dto.icon?.trim() || null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const updated = await this.prisma.puzzleTopic.update({
      where: { id },
      data,
      include: topicInclude
    });
    return { topic: this.toDto(updated, user) };
  }

  /**
   * Soft-delete ("archive") a folder together with its subfolders. Blocked while
   * any folder in the subtree still has live puzzles.
   */
  async archive(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const topic = await this.prisma.puzzleTopic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException("Topic not found.");

    const subtree = collectPuzzleTopicSubtreeIds(await this.loadLinks(), id);
    const puzzles = await this.prisma.puzzle.count({
      where: { topicId: { in: subtree }, isDeleted: false }
    });
    if (puzzles > 0) {
      throw new BadRequestException(
        "This folder or one of its subfolders still has puzzles. Move them to another folder first."
      );
    }

    await this.prisma.$transaction((tx) => this.archiveSubtree(tx, subtree, user.id));
    return { success: true };
  }

  /** Move every live puzzle in the folder's subtree elsewhere, then archive the subtree. */
  async reassign(
    accessToken: string | undefined,
    id: string,
    dto: ReassignPuzzleTopicRequest
  ): Promise<{ success: true; moved: number }> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    if (dto.toTopicId === id) {
      throw new BadRequestException("Pick a different destination topic.");
    }

    const [source, destination] = await Promise.all([
      this.prisma.puzzleTopic.findUnique({ where: { id } }),
      this.prisma.puzzleTopic.findUnique({ where: { id: dto.toTopicId } })
    ]);
    if (!source) throw new NotFoundException("Topic not found.");
    if (!destination) throw new NotFoundException("Destination topic not found.");

    const subtree = collectPuzzleTopicSubtreeIds(await this.loadLinks(), id);
    if (subtree.includes(dto.toTopicId)) {
      throw new BadRequestException("The destination can't be inside the folder being archived.");
    }

    const moved = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.puzzle.updateMany({
        where: { topicId: { in: subtree }, isDeleted: false },
        data: { topicId: dto.toTopicId }
      });
      await this.archiveSubtree(tx, subtree, user.id);
      return count;
    });
    return { success: true, moved };
  }

  /**
   * Copy a folder with its subfolders and live puzzles under `parentId`. Puzzles
   * keep their author, visibility and status; a Lichess copy becomes a plain
   * NEXA puzzle, since (source, sourceId) may exist only once.
   */
  async copy(
    accessToken: string | undefined,
    id: string,
    dto: CopyPuzzleTopicRequest
  ): Promise<CopyPuzzleTopicResponse> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const source = await this.prisma.puzzleTopic.findUnique({ where: { id } });
    if (!source) throw new NotFoundException("Topic not found.");
    if (isSystemPuzzleFolder(source)) {
      throw new BadRequestException("System folders can't be copied.");
    }

    const links = await this.loadLinks();
    const parentId = dto.parentId ?? null;
    if (parentId) {
      if (collectPuzzleTopicSubtreeIds(links, id).includes(parentId)) {
        throw new BadRequestException("A folder can't be copied into itself or its own subfolder.");
      }
      this.assertPlacement(links, id, parentId);
    }

    const subtree = await this.prisma.puzzleTopic.findMany({
      where: { id: { in: collectPuzzleTopicSubtreeIds(links, id) } }
    });
    const rootName = await this.freeCopyName(source.name, parentId);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const newIds = new Map<string, string>();
        let puzzles = 0;
        // Parents before children, so every new parentId already exists.
        const queue = [source];
        while (queue.length) {
          const topic = queue.shift()!;
          const name = topic.id === source.id ? rootName : topic.name;
          const created = await tx.puzzleTopic.create({
            data: {
              name,
              slug: slugify(name),
              parentId: topic.id === source.id ? parentId : newIds.get(topic.parentId!)!,
              description: topic.description,
              icon: topic.icon,
              sortOrder: topic.sortOrder,
              createdById: user.id
            }
          });
          newIds.set(topic.id, created.id);
          queue.push(...subtree.filter((t) => t.parentId === topic.id));

          const rows = await tx.puzzle.findMany({ where: { topicId: topic.id } });
          if (rows.length) {
            const { count } = await tx.puzzle.createMany({
              data: rows.map((row) => ({
                topicId: created.id,
                title: row.title,
                description: row.description,
                puzzleType: row.puzzleType,
                difficulty: row.difficulty,
                fen: row.fen,
                solutionMovesJson: row.solutionMovesJson ?? [],
                explanation: row.explanation,
                hintsJson: row.hintsJson ?? Prisma.DbNull,
                tags: row.tags,
                estimatedSeconds: row.estimatedSeconds,
                scoringJson: row.scoringJson ?? Prisma.DbNull,
                source: PuzzleSource.NEXA,
                rating: row.rating,
                setupMoveUci: row.setupMoveUci,
                contentHash: row.contentHash,
                status: row.status,
                visibility: row.visibility,
                createdById: row.createdById,
                createdByRole: row.createdByRole,
                updatedById: user.id,
                publishedById: row.publishedById,
                publishedAt: row.publishedAt,
                archivedById: row.archivedById,
                archivedAt: row.archivedAt
              }))
            });
            puzzles += count;
          }
        }
        return { rootId: newIds.get(source.id)!, folders: newIds.size, puzzles };
      },
      { timeout: 60_000 }
    );

    const topic = await this.prisma.puzzleTopic.findUniqueOrThrow({
      where: { id: result.rootId },
      include: topicInclude
    });
    return { topic: this.toDto(topic, user), folders: result.folders, puzzles: result.puzzles };
  }

  // ── internals ──

  private async authStaffOrCoach(accessToken: string | undefined): Promise<User> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (!isAdminRole(user.role) && user.role !== "COACH") {
      // students never see the topic manager, but the list is harmless — still gate.
      throw new NotFoundException("Topic not found.");
    }
    return user;
  }

  private loadLinks(): Promise<TopicLink[]> {
    return this.prisma.puzzleTopic.findMany({ select: { id: true, parentId: true } });
  }

  private async archiveSubtree(tx: TrashClient, ids: string[], userId: string) {
    if (ids.length === 1) {
      await this.trash.softDelete(tx, "PuzzleTopic", ids[0], userId);
    } else {
      await this.trash.softDeleteGroup(tx, "PuzzleTopic", ids, userId);
    }
  }

  /**
   * `movingId` (null when creating) may go under `parentId`: the parent exists,
   * isn't the folder itself or inside it, and the result stays within the depth cap.
   */
  private assertPlacement(links: TopicLink[], movingId: string | null, parentId: string) {
    if (!links.some((t) => t.id === parentId)) {
      throw new BadRequestException("The parent folder does not exist.");
    }
    let height = 1;
    if (movingId) {
      if (collectPuzzleTopicSubtreeIds(links, movingId).includes(parentId)) {
        throw new BadRequestException("A folder can't be moved into itself or its own subfolder.");
      }
      height = subtreeHeight(links, movingId);
    }
    if (puzzleTopicPath(links, parentId).length + height > MAX_PUZZLE_TOPIC_DEPTH) {
      throw new BadRequestException(
        `Folders can be nested at most ${MAX_PUZZLE_TOPIC_DEPTH} levels deep.`
      );
    }
  }

  private async assertNameFree(
    name: string,
    slug: string,
    parentId: string | null,
    exceptId?: string
  ) {
    // Names are unique among siblings, case-insensitively, against live rows
    // only (deleted names are reusable by design; there is no DB index).
    const clash = await this.prisma.puzzleTopic.findFirst({
      where: {
        id: exceptId ? { not: exceptId } : undefined,
        parentId,
        OR: [
          { name: { equals: name, mode: "insensitive" } },
          { slug: { equals: slug, mode: "insensitive" } }
        ]
      }
    });
    if (clash) throw new ConflictException("A folder with that name already exists here.");
  }

  /** "Tactics", else "Tactics (copy)", "Tactics (copy 2)", … — whichever is free among the siblings. */
  private async freeCopyName(name: string, parentId: string | null): Promise<string> {
    const siblings = await this.prisma.puzzleTopic.findMany({
      where: { parentId },
      select: { name: true, slug: true }
    });
    const taken = (candidate: string) =>
      siblings.some(
        (s) =>
          s.name.toLowerCase() === candidate.toLowerCase() ||
          s.slug.toLowerCase() === slugify(candidate)
      );
    if (!taken(name)) return name;
    for (let n = 1; ; n += 1) {
      const suffix = ` (copy${n > 1 ? ` ${n}` : ""})`;
      const candidate = `${name.slice(0, 80 - suffix.length)}${suffix}`;
      if (!taken(candidate)) return candidate;
    }
  }

  private toDto(row: TopicRow, viewer: User): PuzzleTopicDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sortOrder,
      parentId: row.parentId,
      puzzleCount: row._count.puzzles,
      createdByName: fullName(row.createdBy),
      canManage: isAdminRole(viewer.role),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}

function subtreeHeight(links: TopicLink[], rootId: string): number {
  const children = links.filter((t) => t.parentId === rootId);
  return 1 + Math.max(0, ...children.map((c) => subtreeHeight(links, c.id)));
}
