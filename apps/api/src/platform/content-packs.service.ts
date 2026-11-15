import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  DEFAULT_TENANT_ID,
  resolveContentPackIds,
  type AddContentPackItemRequest,
  type ContentPackFolderResponse,
  type ContentPackItemSummary,
  type ContentPackRequest,
  type ContentPacksResponse,
  type ContentPackSummary,
  type CopyContentPackFolderResponse
} from "@nexa-chess/types";
import { ContentPackItemKind, Prisma, PuzzleSource, PuzzleVisibility, UserRole, type ContentPackItem } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { isUniqueViolation } from "../payments/payments.util";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import { assertPlatformOperator, writePlatformAudit } from "./platform-operator";

type PackWithItems = Prisma.ContentPackGetPayload<{ include: { items: true } }>;

/**
 * Content packs (docs/SAAS_MULTI_TENANCY.md §I "Content packs"; Phase 4f).
 * The owner publishes Nexa puzzle folders into packs; plans (and deals)
 * include packs; an academy reads a pack folder's puzzles read-only and can
 * copy the folder into its own library, after which the copy is its own.
 * *(builder's call: live reference to the published originals, read under
 * `asPlatform` only through a pack the academy is entitled to; never a
 * snapshot.)* Nexa's unpublished content is unreachable: only a published
 * pack's listed folders are ever read.
 */
@Injectable()
export class ContentPacksService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── platform console ────────────────────────────────────

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  async list(accessToken: string | undefined): Promise<ContentPacksResponse> {
    await this.operator(accessToken);
    const packs = await this.prisma.contentPack.findMany({ include: { items: true }, orderBy: { name: "asc" } });
    return { packs: await Promise.all(packs.map((pack) => this.summary(pack))) };
  }

  async create(accessToken: string | undefined, body: ContentPackRequest): Promise<{ pack: ContentPackSummary }> {
    const actor = await this.operator(accessToken);
    const pack = await this.prisma.$transaction(async (tx) => {
      const created = await tx.contentPack.create({ data: body, include: { items: true } });
      await writePlatformAudit(tx, { action: "pack.create", actorUserId: actor.id, details: { name: body.name, packId: created.id } });
      return created;
    });
    return { pack: await this.summary(pack) };
  }

  async update(accessToken: string | undefined, id: string, body: ContentPackRequest): Promise<{ pack: ContentPackSummary }> {
    const actor = await this.operator(accessToken);
    await this.packOrThrow(id);
    const pack = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.contentPack.update({ data: body, include: { items: true }, where: { id } });
      await writePlatformAudit(tx, { action: "pack.update", actorUserId: actor.id, details: { ...body, packId: id } });
      return updated;
    });
    return { pack: await this.summary(pack) };
  }

  /** Adds one of Nexa's own puzzle folders to the pack. */
  async addItem(accessToken: string | undefined, id: string, body: AddContentPackItemRequest): Promise<{ pack: ContentPackSummary }> {
    const actor = await this.operator(accessToken);
    await this.packOrThrow(id);
    const folder = await this.nexaFolder(body.sourceId);
    if (!folder) throw new NotFoundException("That puzzle folder isn't in Nexa's library.");
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.contentPackItem.create({
          data: { kind: ContentPackItemKind.PUZZLE_FOLDER, packId: id, sourceId: folder.id, title: folder.name }
        });
        await writePlatformAudit(tx, { action: "pack.item.add", actorUserId: actor.id, details: { folderId: folder.id, packId: id } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("That folder is already in the pack.");
      throw error;
    }
    return { pack: await this.summary(await this.packOrThrow(id)) };
  }

  async removeItem(accessToken: string | undefined, id: string, itemId: string): Promise<{ pack: ContentPackSummary }> {
    const actor = await this.operator(accessToken);
    const item = await this.prisma.contentPackItem.findFirst({ where: { id: itemId, packId: id } });
    if (!item) throw new NotFoundException("Item not found.");
    await this.prisma.$transaction(async (tx) => {
      await tx.contentPackItem.delete({ where: { id: item.id } });
      await writePlatformAudit(tx, { action: "pack.item.remove", actorUserId: actor.id, details: { itemId, packId: id } });
    });
    return { pack: await this.summary(await this.packOrThrow(id)) };
  }

  // ── academy side ────────────────────────────────────────

  private async academyStaff(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only staff can browse content packs.");
    }
    return user;
  }

  /** Published packs the academy's plan (and deal) includes. Nexa's own academy needs none. */
  async listForAcademy(accessToken: string | undefined): Promise<ContentPacksResponse> {
    await this.academyStaff(accessToken);
    const ids = await this.entitledPackIds();
    const packs = ids.length
      ? await this.prisma.contentPack.findMany({ include: { items: true }, orderBy: { name: "asc" }, where: { id: { in: ids }, isPublished: true } })
      : [];
    return { packs: await Promise.all(packs.map((pack) => this.summary(pack))) };
  }

  async folder(accessToken: string | undefined, packId: string, itemId: string): Promise<ContentPackFolderResponse> {
    await this.academyStaff(accessToken);
    const { item, pack } = await this.entitledItem(packId, itemId);
    const puzzles = await this.nexaPuzzles(item.sourceId);
    return {
      item: await this.itemSummary(item),
      pack: { id: pack.id, name: pack.name },
      puzzles: puzzles.map((puzzle) => ({
        difficulty: puzzle.difficulty,
        fen: puzzle.fen,
        id: puzzle.id,
        puzzleType: puzzle.puzzleType,
        title: puzzle.title
      }))
    };
  }

  /**
   * Copies a pack folder into the academy's own library (a new academy-wide
   * folder). The copy is the academy's from then on: its edits never reach
   * the original, and later changes to the original never overwrite it.
   */
  async copyFolder(accessToken: string | undefined, packId: string, itemId: string): Promise<CopyContentPackFolderResponse> {
    const user = await this.academyStaff(accessToken);
    if (user.role === UserRole.COACH) throw new ForbiddenException("Only an admin can copy a pack into the library.");
    const tenantId = requireTenantId("contentPackCopy");
    if (tenantId === DEFAULT_TENANT_ID) throw new BadRequestException("Nexa's own folders are already in its library.");
    const { item } = await this.entitledItem(packId, itemId);
    const source = await this.nexaFolder(item.sourceId);
    if (!source) throw new NotFoundException("That folder is no longer published.");
    const puzzles = await this.nexaPuzzles(source.id);
    const suffix = Date.now().toString(36);
    return this.prisma.$transaction(async (tx) => {
      const topic = await tx.puzzleTopic.create({
        data: {
          createdById: user.id,
          description: source.description,
          icon: source.icon,
          name: `${source.name} (copy ${suffix})`,
          slug: `${source.slug}-copy-${suffix}`
        }
      });
      for (const puzzle of puzzles) {
        await tx.puzzle.create({
          data: {
            createdById: user.id,
            createdByRole: user.role,
            description: puzzle.description,
            difficulty: puzzle.difficulty,
            estimatedSeconds: puzzle.estimatedSeconds,
            explanation: puzzle.explanation,
            fen: puzzle.fen,
            hintsJson: puzzle.hintsJson ?? Prisma.JsonNull,
            puzzleType: puzzle.puzzleType,
            rating: puzzle.rating,
            scoringJson: puzzle.scoringJson ?? Prisma.JsonNull,
            setupMoveUci: puzzle.setupMoveUci,
            solutionMovesJson: puzzle.solutionMovesJson as Prisma.InputJsonValue,
            // The copy is the academy's own row; its catalogue origin stays with the original.
            source: PuzzleSource.NEXA,
            status: puzzle.status,
            tags: puzzle.tags,
            title: puzzle.title,
            topicId: topic.id,
            visibility: PuzzleVisibility.GLOBAL
          }
        });
      }
      return { copied: puzzles.length, topicId: topic.id };
    });
  }

  // ── helpers ─────────────────────────────────────────────

  private async entitledPackIds(): Promise<string[]> {
    const tenantId = requireTenantId("contentPacks");
    const sub = await this.prisma.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId } });
    return sub ? resolveContentPackIds(sub.plan.contentPackIds, sub.overrides) : [];
  }

  /** The item, only through a published pack this academy is entitled to (else 404). */
  private async entitledItem(packId: string, itemId: string) {
    const ids = await this.entitledPackIds();
    if (!ids.includes(packId)) throw new NotFoundException("Content pack not found.");
    const pack = await this.prisma.contentPack.findFirst({ where: { id: packId, isPublished: true } });
    const item = pack ? await this.prisma.contentPackItem.findFirst({ where: { id: itemId, packId } }) : null;
    if (!pack || !item) throw new NotFoundException("Content pack not found.");
    return { item, pack };
  }

  /** A folder in Nexa's own library (read as platform: it belongs to another academy). */
  private nexaFolder(folderId: string) {
    return asPlatform("content pack: Nexa's published folder", () =>
      this.prisma.puzzleTopic.findFirst({ where: { id: folderId, isDeleted: false, tenantId: DEFAULT_TENANT_ID } })
    );
  }

  /** The folder's academy-wide, published puzzles; never a coach's private ones. */
  private nexaPuzzles(folderId: string) {
    return asPlatform("content pack: Nexa's published puzzles", () =>
      this.prisma.puzzle.findMany({
        orderBy: { createdAt: "asc" },
        where: {
          isDeleted: false,
          status: "PUBLISHED",
          tenantId: DEFAULT_TENANT_ID,
          topicId: folderId,
          visibility: PuzzleVisibility.GLOBAL
        }
      })
    );
  }

  private async packOrThrow(id: string): Promise<PackWithItems> {
    const pack = await this.prisma.contentPack.findUnique({ include: { items: true }, where: { id } });
    if (!pack) throw new NotFoundException("Content pack not found.");
    return pack;
  }

  private async itemSummary(item: ContentPackItem): Promise<ContentPackItemSummary> {
    const puzzleCount = await asPlatform("content pack: count", () =>
      this.prisma.puzzle.count({
        where: { isDeleted: false, status: "PUBLISHED", tenantId: DEFAULT_TENANT_ID, topicId: item.sourceId, visibility: PuzzleVisibility.GLOBAL }
      })
    );
    return { id: item.id, kind: item.kind, puzzleCount, sourceId: item.sourceId, title: item.title };
  }

  private async summary(pack: PackWithItems): Promise<ContentPackSummary> {
    return {
      description: pack.description,
      id: pack.id,
      isPublished: pack.isPublished,
      items: await Promise.all(pack.items.map((item) => this.itemSummary(item))),
      name: pack.name
    };
  }
}
