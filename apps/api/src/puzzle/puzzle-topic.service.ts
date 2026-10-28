import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  collectPuzzleTopicSubtreeIds,
  compareNatural,
  folderHomeworkBlocker,
  isSystemPuzzleFolder,
  MAX_PUZZLE_TOPIC_DEPTH,
  puzzleTopicPath,
  SYSTEM_PUZZLE_FOLDER_SLUGS,
  type CopyPuzzleTopicRequest,
  type CopyPuzzleTopicResponse,
  type CreatePuzzleTopicRequest,
  type DeletePuzzleTopicResponse,
  type FolderHomeworkResponse,
  type PuzzleTopicDto,
  type PuzzleTopicListResponse,
  type PuzzleTopicResponse,
  type ReassignPuzzleTopicRequest,
  type UpdatePuzzleTopicRequest
} from "@nexa-chess/types";
import { Prisma, PuzzleSource, UserRole, type User } from "@prisma/client";
import { AssignmentPuzzleSetService } from "../assignment/assignment-puzzle-set.service";
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
  homeworkApprovedBy: { select: { firstName: true, lastName: true } },
  _count: {
    select: {
      children: { where: { isDeleted: false } },
      puzzles: { where: { isDeleted: false } }
    }
  }
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
    private readonly trash: TrashRepository,
    private readonly puzzleSets: AssignmentPuzzleSetService
  ) {}

  async list(accessToken: string | undefined): Promise<PuzzleTopicListResponse> {
    const user = await this.authStaffOrCoach(accessToken);
    const [rows, homework] = await Promise.all([
      this.prisma.puzzleTopic.findMany({
        include: topicInclude,
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
      }),
      this.puzzleSets.folderHomeworkCounts()
    ]);
    // Postgres orders names as text ("Set 10" before "Set 2"); re-sort naturally.
    rows.sort((x, y) => x.sortOrder - y.sortOrder || compareNatural(x.name, y.name));
    return { topics: rows.map((row) => this.toDto(row, user, homework.get(row.id) ?? 0)) };
  }

  async get(accessToken: string | undefined, id: string): Promise<PuzzleTopicResponse> {
    const user = await this.authStaffOrCoach(accessToken);
    const row = await this.prisma.puzzleTopic.findUnique({ where: { id }, include: topicInclude });
    if (!row) throw new NotFoundException("Topic not found.");
    return { topic: await this.toDtoWithCounts(row, user) };
  }

  // ── Homework approval (Super Admin, academy-wide) ──

  /**
   * Approve a folder for homework. The approval is stored on the folder itself,
   * so it covers every coach — present or future — and adding coaches never
   * resets it. Only a folder that could be assigned right now may be approved
   * (no subfolders, has published library puzzles); the same rule is re-checked
   * on every assignment, so a folder that later changes stops being assignable
   * without losing its approval. Approving twice keeps the original approval.
   */
  async approveHomework(accessToken: string | undefined, id: string): Promise<PuzzleTopicResponse> {
    const user = this.assertSuperAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const row = await this.prisma.puzzleTopic.findUnique({ where: { id }, include: topicInclude });
    if (!row) throw new NotFoundException("Topic not found.");

    const counts = await this.puzzleSets.folderHomeworkCounts([id]);
    const blocker = folderHomeworkBlocker({
      approved: true,
      isSystem: isSystemPuzzleFolder(row),
      puzzleCount: counts.get(id) ?? 0,
      subfolderCount: row._count.children
    });
    if (blocker) throw new BadRequestException(blocker);

    await this.prisma.puzzleTopic.updateMany({
      where: { id, homeworkApprovedAt: null },
      data: { homeworkApprovedAt: new Date(), homeworkApprovedById: user.id }
    });
    return this.reload(id, user);
  }

  /** Revoke academy-wide: no coach can assign the folder (or re-deploy a set made from it). */
  async revokeHomework(accessToken: string | undefined, id: string): Promise<PuzzleTopicResponse> {
    const user = this.assertSuperAdmin(
      await authenticateUser(this.jwtService, this.prisma, accessToken)
    );
    const row = await this.prisma.puzzleTopic.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw new NotFoundException("Topic not found.");

    await this.prisma.puzzleTopic.update({
      where: { id },
      data: { homeworkApprovedAt: null, homeworkApprovedById: null }
    });
    return this.reload(id, user);
  }

  /** The puzzles assigning this folder would set, in order, and whether it can be assigned. */
  async homework(accessToken: string | undefined, id: string): Promise<FolderHomeworkResponse> {
    await this.authStaffOrCoach(accessToken);
    return this.puzzleSets.folderHomework(id);
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
    return { topic: await this.toDtoWithCounts(created, user) };
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
    return { topic: await this.toDtoWithCounts(updated, user) };
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

  /**
   * Delete a folder with everything in it: its subfolders and every live puzzle
   * they hold go to Trash under one `deleteGroupId`, so restoring any of them
   * brings the whole folder back, and the trash sweep purges them after the
   * retention period (puzzles before folders — `puzzles.topicId` is RESTRICT).
   */
  async remove(accessToken: string | undefined, id: string): Promise<DeletePuzzleTopicResponse> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const topic = await this.prisma.puzzleTopic.findUnique({ where: { id } });
    if (!topic) throw new NotFoundException("Topic not found.");

    const subtree = collectPuzzleTopicSubtreeIds(await this.loadLinks(), id);
    const system = await this.prisma.puzzleTopic.count({
      where: { id: { in: subtree }, slug: { in: [...SYSTEM_PUZZLE_FOLDER_SLUGS] } }
    });
    if (system > 0) {
      throw new BadRequestException("System folders can't be deleted.");
    }

    const puzzles = await this.prisma.$transaction(async (tx) => {
      const deleteGroupId = await this.trash.softDeleteGroup(tx, "PuzzleTopic", subtree, user.id);
      return this.trash.softDeleteManyIntoGroup(
        tx,
        "Puzzle",
        { topicId: { in: subtree } },
        { cascadedFrom: "PuzzleTopic", deleteGroupId, parentId: id, userId: user.id }
      );
    });
    return { folders: subtree.length, puzzles, success: true };
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
    return {
      topic: await this.toDtoWithCounts(topic, user),
      folders: result.folders,
      puzzles: result.puzzles
    };
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

  private assertSuperAdmin(user: User): User {
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only the Super Admin can approve folders for homework.");
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

  private async reload(id: string, viewer: User): Promise<PuzzleTopicResponse> {
    const row = await this.prisma.puzzleTopic.findUniqueOrThrow({ where: { id }, include: topicInclude });
    return { topic: await this.toDtoWithCounts(row, viewer) };
  }

  private async toDtoWithCounts(row: TopicRow, viewer: User): Promise<PuzzleTopicDto> {
    const counts = await this.puzzleSets.folderHomeworkCounts([row.id]);
    return this.toDto(row, viewer, counts.get(row.id) ?? 0);
  }

  private toDto(row: TopicRow, viewer: User, homeworkPuzzleCount: number): PuzzleTopicDto {
    const approved = row.homeworkApprovedAt !== null;
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
      homeworkApprovedAt: row.homeworkApprovedAt?.toISOString() ?? null,
      homeworkApprovedByName: approved ? fullName(row.homeworkApprovedBy) : null,
      homeworkPuzzleCount,
      homeworkBlocker: folderHomeworkBlocker({
        approved,
        isSystem: isSystemPuzzleFolder(row),
        puzzleCount: homeworkPuzzleCount,
        subfolderCount: row._count.children
      }),
      canApproveHomework: viewer.role === UserRole.SUPER_ADMIN,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}

function subtreeHeight(links: TopicLink[], rootId: string): number {
  const children = links.filter((t) => t.parentId === rootId);
  return 1 + Math.max(0, ...children.map((c) => subtreeHeight(links, c.id)));
}
