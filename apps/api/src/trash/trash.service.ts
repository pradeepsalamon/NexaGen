import {
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { UserRole, UserStatus } from "@prisma/client";
import { parseDurationMs } from "../auth/auth.utils";
import type { AccessTokenPayload } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
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

@Injectable()
export class TrashService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository
  ) {}

  async list(accessToken: string | undefined, query: TrashQueryDto) {
    await this.getSuperAdmin(accessToken);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const result = await this.trashRepository.list({
      deletedById: query.deletedById,
      deletedFrom: this.toDate(query.deletedFrom),
      deletedTo: this.toDate(query.deletedTo),
      entity: query.entity,
      page: 1,
      pageSize: page * pageSize,
      search: query.search?.trim() || undefined
    });
    const sorted = this.sortItems(
      result.items,
      query.sortBy ?? "deletedAt",
      query.sortOrder ?? "desc"
    );
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
      await this.trashRepository.restore(item.entity, item.id, user.id);
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

    await this.prisma.$transaction(async (transaction) => {
      for (const item of payload.items) {
        await this.trashRepository.findDeleted(item.entity, item.id);
        await this.deleteExternalAssets(item.entity, item.id);
        await this.trashRepository.hardDelete(
          transaction,
          item.entity,
          item.id,
          user.id
        );
      }
    });

    return { ok: true };
  }

  async emptyTrash(accessToken: string | undefined) {
    const user = await this.getSuperAdmin(accessToken);
    const items = await this.trashRepository.findExpired(new Date());

    await this.prisma.$transaction(async (transaction) => {
      for (const item of items) {
        await this.deleteExternalAssets(item.entity, item.id);
        await this.trashRepository.hardDelete(
          transaction,
          item.entity,
          item.id,
          user.id
        );
      }
    });

    return { deletedCount: items.length, ok: true };
  }

  async cleanupExpiredTrash() {
    const retentionMs = parseDurationMs(`${this.getRetentionDays()}d`, 30 * 86_400_000);
    const cutoff = new Date(Date.now() - retentionMs);

    return this.prisma.$transaction(async (transaction) => {
      const [lock] = await transaction.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(${cleanupExpiredTrashLockId}) AS locked
      `;

      if (!lock?.locked) {
        return 0;
      }

      const items = await this.trashRepository.findExpired(cutoff, transaction);

      for (const item of items) {
        await this.deleteExternalAssets(item.entity, item.id);
        await this.trashRepository.hardDelete(
          transaction,
          item.entity,
          item.id,
          null,
          "AUTOMATIC_CLEANUP"
        );
      }

      return items.length;
    });
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

  private async deleteExternalAssets(entity: string, id: string) {
    await Promise.resolve({ entity, id });
  }

  private getRetentionDays() {
    return this.env.TRASH_RETENTION_DAYS;
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
