import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { UserRole, UserStatus } from "@prisma/client";
import { parseDurationMs } from "../auth/auth.utils";
import type { AccessTokenPayload } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import type { TrashAction } from "../prisma/soft-delete.extension";
import { UploadService } from "../upload/upload.service";
import type { TrashBulkActionDto } from "./dto/trash-bulk-action.dto";
import type { TrashQueryDto } from "./dto/trash-query.dto";
import { TrashRepository } from "./trash.repository";

type TrashListItem = {
  deletedAt: Date | string | null;
  deletedBy: unknown;
  entity: string;
  id: string;
  title: string;
};

const cleanupExpiredTrashLockId = 73002001;

// The trash list merges rows from six tables in memory, so a naive offset page
// would scan `page * pageSize` rows per table (AUDIT M9). Cap the per-table scan:
// sorting/paging stays exact within the newest MAX_TRASH_SCAN deleted rows per
// entity, which comfortably covers the retention window at realistic volume.
const MAX_TRASH_SCAN = 500;

const TRASH_SORT_FIELDS = ["deletedAt", "deletedBy", "entity", "title"] as const;
type TrashSortBy = (typeof TRASH_SORT_FIELDS)[number];

@Injectable()
export class TrashService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository,
    private readonly uploadService: UploadService
  ) {}

  async list(accessToken: string | undefined, query: TrashQueryDto) {
    await this.getSuperAdmin(accessToken);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const sortBy = this.toSortBy(query.sortBy);
    const sortOrder = query.sortOrder ?? "desc";
    const result = await this.trashRepository.list({
      deletedById: query.deletedById,
      deletedFrom: this.toDate(query.deletedFrom),
      deletedTo: this.toDate(query.deletedTo),
      entity: query.entity,
      page: 1,
      pageSize: Math.min(page * pageSize, MAX_TRASH_SCAN),
      search: query.search?.trim() || undefined,
      sortBy,
      sortOrder
    });
    const sorted = this.sortItems(result.items, sortBy, sortOrder);
    const items = sorted.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: items.map((item) => this.toResponseItem(item)),
      page,
      pageSize,
      retentionDays: this.getRetentionDays(),
      total: result.total
    };
  }

  async restore(accessToken: string | undefined, entity: string, id: string) {
    const user = await this.getSuperAdmin(accessToken);
    await this.trashRepository.restore(entity, id, user.id);

    return { ok: true };
  }

  async bulkRestore(accessToken: string | undefined, payload: TrashBulkActionDto) {
    const user = await this.getSuperAdmin(accessToken);

    for (const item of payload.items) {
      try {
        await this.trashRepository.restore(item.entity, item.id, user.id);
      } catch (error) {
        // A cascading restore (AUDIT M13) may have already brought this row back
        // as part of an earlier item's group — that's success, not an error.
        if (error instanceof NotFoundException) continue;
        throw error;
      }
    }

    return { ok: true };
  }

  async permanentDelete(
    accessToken: string | undefined,
    entity: string,
    id: string
  ) {
    const user = await this.getSuperAdmin(accessToken);
    await this.trashRepository.findDeleted(entity, id);

    await this.prisma.$transaction(async (transaction) => {
      await this.deleteExternalAssets(entity, id);
      await this.trashRepository.hardDelete(transaction, entity, id, user.id);
    });

    return { ok: true };
  }

  async bulkPermanentDelete(
    accessToken: string | undefined,
    payload: TrashBulkActionDto
  ) {
    const user = await this.getSuperAdmin(accessToken);

    // A selection can contain both a User and a row that cascades from it (e.g.
    // their StudentProfile). Delete child rows before their parents so the
    // parent's cascade doesn't yank a row out from under a later statement and
    // abort the whole transaction (AUDIT M10).
    const items = [...payload.items].sort(
      (a, b) => TrashService.deleteOrder(a.entity) - TrashService.deleteOrder(b.entity)
    );

    let deletedCount = 0;
    await this.prisma.$transaction(async (transaction) => {
      for (const item of items) {
        try {
          await this.trashRepository.findDeleted(item.entity, item.id);
        } catch (error) {
          if (error instanceof NotFoundException) continue; // already gone
          throw error;
        }
        await this.deleteExternalAssets(item.entity, item.id);
        await this.trashRepository.hardDelete(
          transaction,
          item.entity,
          item.id,
          user.id
        );
        deletedCount += 1;
      }
    });

    return { ok: true, deletedCount };
  }

  /** Lower = delete earlier. Children before the parents that cascade to them. */
  private static deleteOrder(entity: string): number {
    switch (entity) {
      case "BatchStudent":
      case "BatchCoach":
        return 0;
      case "StudentProfile":
      case "CoachProfile":
        return 1;
      case "Batch":
        return 2;
      case "User":
        return 3;
      default:
        return 2;
    }
  }

  async emptyTrash(accessToken: string | undefined) {
    const user = await this.getSuperAdmin(accessToken);
    const items = await this.trashRepository.findExpired(new Date());
    const deletedCount = await this.hardDeleteInChunks(items, user.id, "PERMANENT_DELETE");
    return { deletedCount, ok: true };
  }

  async cleanupExpiredTrash() {
    const retentionMs = parseDurationMs(`${this.getRetentionDays()}d`, 30 * 86_400_000);
    const cutoff = new Date(Date.now() - retentionMs);

    // Session-scoped advisory lock so no other instance sweeps concurrently,
    // held across all chunks (AUDIT M11 — the whole delete used to run in one
    // long transaction, risking lock contention / timeouts at volume).
    const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
      SELECT pg_try_advisory_lock(${cleanupExpiredTrashLockId}) AS locked
    `;
    if (!lock?.locked) {
      return 0;
    }

    try {
      const items = await this.trashRepository.findExpired(cutoff);
      return await this.hardDeleteInChunks(items, null, "AUTOMATIC_CLEANUP");
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${cleanupExpiredTrashLockId})`;
    }
  }

  /**
   * Permanently delete trash items in bounded transactions (~500 rows each), so
   * a large purge doesn't hold locks for the whole run (AUDIT M11). Child rows
   * are deleted before the parents that cascade to them.
   */
  private async hardDeleteInChunks(
    items: Array<{ entity: string; id: string }>,
    userId: string | null,
    action: TrashAction
  ): Promise<number> {
    const ordered = [...items].sort(
      (a, b) => TrashService.deleteOrder(a.entity) - TrashService.deleteOrder(b.entity)
    );

    const CHUNK = 500;
    let deleted = 0;
    for (let i = 0; i < ordered.length; i += CHUNK) {
      const chunk = ordered.slice(i, i + CHUNK);
      await this.prisma.$transaction(async (transaction) => {
        for (const item of chunk) {
          await this.deleteExternalAssets(item.entity, item.id);
          await this.trashRepository.hardDelete(
            transaction,
            item.entity,
            item.id,
            userId,
            action
          );
          deleted += 1;
        }
      });
    }
    return deleted;
  }

  private async getSuperAdmin(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
      accessToken,
      { secret: this.env.JWT_ACCESS_SECRET }
    );

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Super Admin can access Trash.");
    }

    return user;
  }

  /**
   * Remove external assets owned by a row about to be permanently deleted
   * (AUDIT M12 — this was a no-op stub). Currently just the Cloudinary avatar
   * of a User; recordings live on `LiveSession`, which is not trash-enabled.
   */
  private async deleteExternalAssets(entity: string, id: string) {
    if (entity !== "User") return;
    try {
      const user = await this.prisma.withDeleted.user.findUnique({
        where: { id },
        select: { avatarUrl: true }
      });
      if (user?.avatarUrl) {
        await this.uploadService.deleteImage(user.avatarUrl);
      }
    } catch (error) {
      // Best-effort: a failed asset cleanup must not block the DB delete.
      console.error(`Failed to delete external assets for User ${id}`, error);
    }
  }

  private getRetentionDays() {
    return this.env.TRASH_RETENTION_DAYS;
  }

  private toSortBy(value: string | undefined): TrashSortBy {
    return TRASH_SORT_FIELDS.includes(value as TrashSortBy)
      ? (value as TrashSortBy)
      : "deletedAt";
  }

  private toDate(value: string | undefined) {
    if (!value) {
      return undefined;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private sortItems(
    items: TrashListItem[],
    sortBy: string,
    sortOrder: "asc" | "desc"
  ) {
    const direction = sortOrder === "asc" ? 1 : -1;

    return [...items].sort((left, right) => {
      const leftValue = this.getSortValue(left, sortBy);
      const rightValue = this.getSortValue(right, sortBy);

      return leftValue.localeCompare(rightValue) * direction;
    });
  }

  private getSortValue(item: TrashListItem, sortBy: string) {
    if (sortBy === "deletedAt") {
      return item.deletedAt ? new Date(item.deletedAt).toISOString() : "";
    }

    if (sortBy === "deletedBy") {
      const deletedBy = item.deletedBy as { email?: string } | null;
      return deletedBy?.email ?? "";
    }

    return String(item[sortBy as keyof TrashListItem] ?? "");
  }

  private toResponseItem(item: TrashListItem) {
    const deletedAt = item.deletedAt ? new Date(item.deletedAt) : null;
    const daysUntilPermanentDeletion = deletedAt
      ? Math.max(
          0,
          this.getRetentionDays() -
            Math.floor((Date.now() - deletedAt.getTime()) / 86_400_000)
        )
      : null;

    return {
      ...item,
      deletedAt: deletedAt?.toISOString() ?? null,
      daysUntilPermanentDeletion
    };
  }
}
