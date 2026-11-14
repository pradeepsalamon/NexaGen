import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  normalizeSupportKeywords,
  SUPPORT_BOT_ANSWERS_MAX,
  SUPPORT_SAVED_REPLY_LIMITS,
  type SupportSavedReplyInput,
  type SupportSavedReplyItem
} from "@nexa-chess/types";
import { UserRole, type Prisma } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";

const SAVED_REPLY_INCLUDE = {
  updatedBy: { select: { firstName: true, id: true, lastName: true } }
} satisfies Prisma.SupportSavedReplyInclude;

type SavedReplyRow = Prisma.SupportSavedReplyGetPayload<{ include: typeof SAVED_REPLY_INCLUDE }>;

const ORDER: Prisma.SupportSavedReplyOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }];

/**
 * The academy's saved answers (docs/WHATSAPP_SUPPORT.md §0): the bot sends the
 * ones marked `showInBot`, staff insert any of them into a reply. Admins and
 * super admins only; every id is loaded through a tenant-scoped query.
 */
@Injectable()
export class SupportSavedRepliesService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /** All of them, in the bot's order (the list is capped at SUPPORT_SAVED_REPLY_LIMITS.total). */
  async list(accessToken: string | undefined): Promise<SupportSavedReplyItem[]> {
    await this.getStaff(accessToken);
    const rows = await this.prisma.supportSavedReply.findMany({ include: SAVED_REPLY_INCLUDE, orderBy: ORDER });
    return toItems(rows);
  }

  async create(accessToken: string | undefined, body: SupportSavedReplyInput): Promise<SupportSavedReplyItem> {
    const user = await this.getStaff(accessToken);
    const count = await this.prisma.supportSavedReply.count();
    if (count >= SUPPORT_SAVED_REPLY_LIMITS.total) {
      throw new ConflictException(`An academy can keep up to ${SUPPORT_SAVED_REPLY_LIMITS.total} saved answers. Delete one first.`);
    }
    const row = await this.prisma.supportSavedReply.create({
      data: { ...body, keywords: normalizeSupportKeywords(body.keywords), updatedById: user.id }
    });
    return this.itemById(row.id);
  }

  async update(accessToken: string | undefined, id: string, body: SupportSavedReplyInput): Promise<SupportSavedReplyItem> {
    const user = await this.getStaff(accessToken);
    await this.findOrThrow(id);
    await this.prisma.supportSavedReply.update({
      data: { ...body, keywords: normalizeSupportKeywords(body.keywords), updatedById: user.id },
      where: { id }
    });
    return this.itemById(id);
  }

  async remove(accessToken: string | undefined, id: string): Promise<{ id: string }> {
    await this.getStaff(accessToken);
    await this.findOrThrow(id);
    await this.prisma.supportSavedReply.deleteMany({ where: { id } });
    return { id };
  }

  private async findOrThrow(id: string) {
    const row = await this.prisma.supportSavedReply.findFirst({ select: { id: true }, where: { id } });
    if (!row) throw new NotFoundException("Saved answer not found.");
    return row;
  }

  /** One item, with `inBotMenu` worked out against the whole list. */
  private async itemById(id: string): Promise<SupportSavedReplyItem> {
    const rows = await this.prisma.supportSavedReply.findMany({ include: SAVED_REPLY_INCLUDE, orderBy: ORDER });
    const item = toItems(rows).find((entry) => entry.id === id);
    if (!item) throw new NotFoundException("Saved answer not found.");
    return item;
  }

  private async getStaff(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can manage saved answers.");
    }
    return user;
  }
}

/** Rows in bot order → items; the first SUPPORT_BOT_ANSWERS_MAX bot answers are in the bot's list. */
export function toItems(rows: SavedReplyRow[]): SupportSavedReplyItem[] {
  let shown = 0;
  return rows.map((row) => {
    const inBotMenu = row.showInBot && shown < SUPPORT_BOT_ANSWERS_MAX;
    if (row.showInBot) shown += 1;
    return {
      body: row.body,
      description: row.description,
      id: row.id,
      inBotMenu,
      keywords: row.keywords,
      showInBot: row.showInBot,
      sortOrder: row.sortOrder,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy
        ? { id: row.updatedBy.id, name: [row.updatedBy.firstName, row.updatedBy.lastName].filter(Boolean).join(" ") }
        : null
    };
  });
}
