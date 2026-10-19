import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { UserRole } from "@prisma/client";
import { parseDurationMs } from "../auth/auth.utils";
import { isForeignKeyRestrictError } from "../prisma/prisma-errors";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrashAction } from "../prisma/soft-delete.extension";
import { UploadService } from "../upload/upload.service";
import type { TrashBulkActionDto } from "./dto/trash-bulk-action.dto";
import type { TrashQueryDto } from "./dto/trash-query.dto";
import { TrashRepository } from "./trash.repository";
import { authenticateUser } from "../auth/authenticate";

type TrashListItem = {
  deletedAt: Date | string | null;
  deletedBy: unknown;
  entity: string;
  id: string;
  title: string;
};

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
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly jobLocks: JobLockService,
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
    const sortOrder = query.sortOrder ?? "asc";
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
    await this.assertNoRetainedHistory([{ entity, id }]);

    try {
      const avatars = await this.prisma.$transaction(async (transaction) => {
        const avatar = await this.readAvatar(transaction, entity, id);
        const removed = await this.trashRepository.hardDelete(transaction, entity, id, user.id);
        return removed && avatar ? [avatar] : [];
      });
      await this.deleteAvatars(avatars);
    } catch (error) {
      // e.g. a soft-deleted Puzzle/Assignment still referenced by a
      // CourseModule (onDelete: Restrict) — the row itself must go first.
      if (isForeignKeyRestrictError(error)) {
        throw new BadRequestException(
          "This item is still referenced elsewhere and can't be permanently deleted yet."
        );
      }
      throw error;
    }

    return { ok: true };
  }

  async bulkPermanentDelete(
    accessToken: string | undefined,
    payload: TrashBulkActionDto
  ) {
    const user = await this.getSuperAdmin(accessToken);
    await this.assertNoRetainedHistory(payload.items);

    // A selection can contain both a User and a row that cascades from it (e.g.
    // their StudentProfile). Delete child rows before their parents so the
    // parent's cascade doesn't yank a row out from under a later statement and
    // abort the whole transaction (AUDIT M10).
    const items = [...payload.items].sort(
      (a, b) => TrashService.deleteOrder(a.entity) - TrashService.deleteOrder(b.entity)
    );

    let deletedCount = 0;
    try {
      const avatars = await this.prisma.$transaction(async (transaction) => {
        const found: string[] = [];
        for (const item of items) {
          const avatar = await this.readAvatar(transaction, item.entity, item.id);
          // hardDelete skips a row already gone or restored since it was selected.
          if (await this.trashRepository.hardDelete(transaction, item.entity, item.id, user.id)) {
            deletedCount += 1;
            if (avatar) found.push(avatar);
          }
        }
        return found;
      });
      await this.deleteAvatars(avatars);
    } catch (error) {
      // One selected item is still referenced elsewhere (e.g. a Puzzle/
      // Assignment still attached to a live CourseModule) — reject the whole
      // batch with a clear message rather than a generic 500; the admin can
      // deselect it and retry.
      if (isForeignKeyRestrictError(error)) {
        throw new BadRequestException(
          "One of the selected items is still referenced elsewhere and can't be permanently deleted yet."
        );
      }
      throw error;
    }

    return { ok: true, deletedCount };
  }

  private async assertNoRetainedHistory(items: Array<{ entity: string; id: string }>) {
    const userIds = items.filter((item) => item.entity === "User").map((item) => item.id);
    const retained = await this.trashRepository.findUserIdsWithRetainedHistory(userIds);
    if (retained.size > 0) {
      throw new BadRequestException(
        "This user has payment, invoice or payroll history, which is kept permanently. They can stay in the trash or be restored."
      );
    }
  }

  // A user with financial history stays in the trash, and so does the rest of their delete group.
  private async withoutRetainedHistory<T extends { deleteGroupId: string | null; entity: string; id: string }>(
    items: T[]
  ): Promise<T[]> {
    const retained = await this.trashRepository.findUserIdsWithRetainedHistory(
      items.filter((item) => item.entity === "User").map((item) => item.id)
    );
    if (retained.size === 0) return items;

    const keptGroups = new Set(
      items
        .filter((item) => item.entity === "User" && retained.has(item.id) && item.deleteGroupId)
        .map((item) => item.deleteGroupId)
    );
    this.logger.log(`Keeping ${retained.size} trashed user(s) with financial history.`);
    return items.filter(
      (item) =>
        !(item.entity === "User" && retained.has(item.id)) &&
        !(item.deleteGroupId && keptGroups.has(item.deleteGroupId))
    );
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
    // Shares the sweeper's lock, so the two never purge the same rows at once.
    const outcome = await this.jobLocks.runExclusive(JOB_LOCKS.trashCleanup, async () => {
      const items = await this.withoutRetainedHistory(
        await this.trashRepository.findExpired(new Date())
      );
      return this.hardDeleteInChunks(items, user.id, "PERMANENT_DELETE");
    });
    return { deletedCount: outcome.acquired ? outcome.result : 0, ok: true };
  }

  async cleanupExpiredTrash() {
    const retentionMs = parseDurationMs(`${this.getRetentionDays()}d`, 30 * 86_400_000);
    const cutoff = new Date(Date.now() - retentionMs);

    // One sweeper across instances, held across all chunks (AUDIT M11 — the
    // whole delete used to run in one long transaction).
    const outcome = await this.jobLocks.runExclusive(JOB_LOCKS.trashCleanup, async () => {
      const items = await this.withoutRetainedHistory(
        await this.trashRepository.findExpired(cutoff)
      );
      return this.hardDeleteInChunks(items, null, "AUTOMATIC_CLEANUP");
    });
    return outcome.acquired ? outcome.result : 0;
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
      try {
        const { avatars, count } = await this.prisma.$transaction(async (transaction) => {
          const found: string[] = [];
          let removed = 0;
          for (const item of chunk) {
            const avatar = await this.readAvatar(transaction, item.entity, item.id);
            if (await this.trashRepository.hardDelete(transaction, item.entity, item.id, userId, action)) {
              removed += 1;
              if (avatar) found.push(avatar);
            }
          }
          return { avatars: found, count: removed };
        });
        await this.deleteAvatars(avatars);
        deleted += count;
      } catch (error) {
        if (!isForeignKeyRestrictError(error)) throw error;
        // One row in this chunk is still referenced elsewhere (e.g. a Puzzle/
        // Assignment still attached to a live CourseModule) — Postgres aborts
        // the whole transaction on that single RESTRICT violation, so retry
        // one row at a time rather than losing the rest of an otherwise-clean
        // chunk. The blocked row is skipped and picked up on a later sweep
        // once whatever still references it is gone.
        deleted += await this.hardDeleteOneAtATime(chunk, userId, action);
      }
    }
    return deleted;
  }

  private async hardDeleteOneAtATime(
    chunk: Array<{ entity: string; id: string }>,
    userId: string | null,
    action: TrashAction
  ): Promise<number> {
    let deleted = 0;
    for (const item of chunk) {
      try {
        const removed = await this.prisma.$transaction(async (transaction) => {
          const url = await this.readAvatar(transaction, item.entity, item.id);
          const done = await this.trashRepository.hardDelete(transaction, item.entity, item.id, userId, action);
          return done ? { url } : null;
        });
        if (!removed) continue;
        await this.deleteAvatars(removed.url ? [removed.url] : []);
        deleted += 1;
      } catch (error) {
        if (!isForeignKeyRestrictError(error)) throw error;
        this.logger.warn(
          `Skipped permanent delete of ${item.entity} ${item.id}: still referenced elsewhere.`
        );
      }
    }
    return deleted;
  }

  private async getSuperAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Super Admin can access Trash.");
    }
    return user;
  }

  /**
   * External assets owned by a row about to be permanently deleted (AUDIT M12).
   * Currently just the Cloudinary avatar of a User; recordings live on
   * `LiveSession`, which is not trash-enabled. Read inside the delete's
   * transaction and removed only after it commits, so a rollback keeps the avatar.
   */
  private async readAvatar(
    client: Pick<PrismaService, "$queryRaw">,
    entity: string,
    id: string
  ): Promise<string | null> {
    if (entity !== "User") return null;
    // Raw: the soft-delete extension would hide this (trashed) user from findUnique.
    const rows = await client.$queryRaw<{ avatarUrl: string | null }[]>`
      SELECT "avatarUrl" FROM "users" WHERE id = ${id}
    `;
    return rows[0]?.avatarUrl ?? null;
  }

  private async deleteAvatars(urls: string[]) {
    for (const url of urls) {
      try {
        await this.uploadService.deleteImage(url);
      } catch (error) {
        // Best-effort: the rows are already gone.
        this.logger.warn(`Failed to delete an avatar after a permanent delete: ${(error as Error).message}`);
      }
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
