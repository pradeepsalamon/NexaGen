import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  CreatePuzzleTopicRequest,
  PuzzleTopicDto,
  PuzzleTopicListResponse,
  PuzzleTopicResponse,
  ReassignPuzzleTopicRequest,
  UpdatePuzzleTopicRequest
} from "@nexa-chess/types";
import { Prisma, type User } from "@prisma/client";
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
    await this.assertNameFree(name, slug);

    const created = await this.prisma.puzzleTopic.create({
      data: {
        name,
        slug,
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

    const data: Prisma.PuzzleTopicUpdateInput = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const slug = slugify(name);
      await this.assertNameFree(name, slug, id);
      data.name = name;
      data.slug = slug;
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

  /** Soft-delete ("archive") a topic. Blocked while it still has live puzzles. */
  async archive(accessToken: string | undefined, id: string): Promise<{ success: true }> {
    const user = assertAdmin(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const topic = await this.prisma.puzzleTopic.findUnique({
      where: { id },
      include: { _count: { select: { puzzles: { where: { isDeleted: false } } } } }
    });
    if (!topic) throw new NotFoundException("Topic not found.");
    if (topic._count.puzzles > 0) {
      throw new BadRequestException(
        "This topic still has puzzles. Reassign them to another topic first."
      );
    }

    await this.prisma.$transaction((tx) =>
      this.trash.softDelete(tx, "PuzzleTopic", id, user.id)
    );
    return { success: true };
  }

  /** Move every live puzzle to another topic, then archive the emptied topic. */
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

    const moved = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.puzzle.updateMany({
        where: { topicId: id, isDeleted: false },
        data: { topicId: dto.toTopicId }
      });
      await this.trash.softDelete(tx, "PuzzleTopic", id, user.id);
      return count;
    });
    return { success: true, moved };
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

  private async assertNameFree(name: string, slug: string, exceptId?: string) {
    // Uniqueness pre-check MUST use withDeleted so a soft-deleted row is seen —
    // the partial unique index only covers live rows, but a name collision with
    // a deleted topic would still be confusing, so we reject case-insensitively
    // against live rows only (deleted names are reusable by design).
    const clash = await this.prisma.puzzleTopic.findFirst({
      where: {
        id: exceptId ? { not: exceptId } : undefined,
        OR: [
          { name: { equals: name, mode: "insensitive" } },
          { slug: { equals: slug, mode: "insensitive" } }
        ]
      }
    });
    if (clash) throw new ConflictException("A topic with that name already exists.");
  }

  private toDto(row: TopicRow, viewer: User): PuzzleTopicDto {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      sortOrder: row.sortOrder,
      puzzleCount: row._count.puzzles,
      createdByName: fullName(row.createdBy),
      canManage: isAdminRole(viewer.role),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }
}
