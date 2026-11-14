import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  getTrashEntity,
  trashEntities,
  type TrashAction
} from "../prisma/soft-delete.extension";

type PrismaDelegateLike = {
  count: (args: unknown) => Promise<number>;
  create: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  findFirst: (args: unknown) => Promise<TrashRecord | null>;
  findMany: (args: unknown) => Promise<TrashRecord[]>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};
type PrismaClientLike = object;
type TrashRecord = {
  deleteGroupId?: string | null;
  deletedAt: Date | string | null;
  deletedBy?: unknown;
  id: string;
} & Record<string, unknown>;
type TrashSortBy = "deletedAt" | "deletedBy" | "entity" | "title";
type TrashFindOptions = {
  deletedById?: string;
  deletedFrom?: Date;
  deletedTo?: Date;
  entity?: string;
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: TrashSortBy;
  sortOrder?: "asc" | "desc";
};

/**
 * Child rows that are retired together with their parent in one cascading
 * soft-delete (AUDIT M13/M14), keyed by the parent entity label. `foreignKey`
 * is the column on the child pointing back at the parent id.
 */
const CASCADE_CHILDREN: Record<
  string,
  ReadonlyArray<{ delegate: string; foreignKey: string; label: string }>
> = {
  Batch: [
    { delegate: "batchCoach", foreignKey: "batchId", label: "BatchCoach" },
    { delegate: "batchStudent", foreignKey: "batchId", label: "BatchStudent" }
  ],
  User: [
    { delegate: "studentProfile", foreignKey: "userId", label: "StudentProfile" },
    { delegate: "coachProfile", foreignKey: "userId", label: "CoachProfile" }
  ],
  Course: [{ delegate: "courseModule", foreignKey: "courseId", label: "CourseModule" }]
};

@Injectable()
export class TrashRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(options: TrashFindOptions) {
    const entityConfigs = options.entity
      ? trashEntities.filter((entity) => entity.label === options.entity)
      : trashEntities;

    const results = await Promise.all(
      entityConfigs.map(async (entity) => {
        const where = this.buildTrashWhere(entity, options);
        const delegate = this.getDelegate(this.prisma.withDeleted, entity.delegate);
        const [items, total] = await Promise.all([
          delegate.findMany({
            include: {
              deletedBy: {
                select: {
                  email: true,
                  firstName: true,
                  id: true,
                  lastName: true,
                  role: true
                }
              }
            },
            orderBy: this.buildOrderBy(entity, options),
            skip: (options.page - 1) * options.pageSize,
            take: options.pageSize,
            where
          }),
          delegate.count({
            where
          })
        ]);

        return {
          entity,
          items,
          total
        };
      })
    );

    return {
      items: results.flatMap((result) =>
        result.items.map((item) =>
          this.toTrashItem(result.entity, item)
        )
      ),
      total: results.reduce((sum, result) => sum + result.total, 0)
    };
  }

  async findDeleted(entityName: string, id: string) {
    const entity = this.getEntityOrThrow(entityName);
    const item = await this.getDelegate(this.prisma.withDeleted, entity.delegate).findFirst({
      include: {
        deletedBy: {
          select: {
            email: true,
            firstName: true,
            id: true,
            lastName: true,
            role: true
          }
        }
      },
      where: {
        id,
        isDeleted: true
      }
    });

    if (!item) {
      throw new NotFoundException("Trash item not found.");
    }

    return { entity, item };
  }

  async restore(entityName: string, id: string, userId: string) {
    const { entity, item } = await this.findDeleted(entityName, id);
    const deleteGroupId = item.deleteGroupId ?? null;

    return this.prisma.$transaction(async (transaction) => {
      const restored = await this.getDelegate(transaction, entity.delegate).update({
        data: {
          deleteGroupId: null,
          deletedAt: null,
          deletedById: null,
          isDeleted: false
        },
        where: { id }
      });

      await this.log(transaction, {
        action: "RESTORE",
        entity: entity.label,
        entityId: id,
        userId
      });

      // Bring back every row retired in the same cascading delete (AUDIT M13).
      // The parent was just cleared above, so it no longer matches the group.
      if (deleteGroupId) {
        for (const groupEntity of trashEntities) {
          const { count } = await this.getDelegate(
            transaction,
            groupEntity.delegate
          ).updateMany({
            data: {
              deleteGroupId: null,
              deletedAt: null,
              deletedById: null,
              isDeleted: false
            },
            where: { deleteGroupId, isDeleted: true }
          });

          if (count > 0) {
            await this.log(transaction, {
              action: "RESTORE",
              entity: groupEntity.label,
              entityId: id,
              metadata: { cascadedFrom: entity.label, count, deleteGroupId },
              userId
            });
          }
        }
      }

      return restored;
    });
  }

  async softDelete(
    client: PrismaClientLike,
    entityName: string,
    id: string,
    userId: string
  ) {
    const entity = this.getEntityOrThrow(entityName);
    const item = await this.getDelegate(client, entity.delegate).update({
      data: {
        deletedAt: new Date(),
        deletedById: userId,
        isDeleted: true
      },
      where: { id }
    });

    await this.log(client, {
      action: "SOFT_DELETE",
      entity: entity.label,
      entityId: id,
      userId
    });

    return item;
  }

  /**
   * Soft-delete several rows of one model under a single `deleteGroupId`, so
   * restoring any of them brings the whole set back (e.g. a folder subtree).
   */
  async softDeleteGroup(
    client: PrismaClientLike,
    entityName: string,
    ids: string[],
    userId: string,
    deleteGroupId: string = randomUUID()
  ): Promise<string> {
    const entity = this.getEntityOrThrow(entityName);
    const deletedAt = new Date();

    for (const id of ids) {
      await this.getDelegate(client, entity.delegate).update({
        data: { deleteGroupId, deletedAt, deletedById: userId, isDeleted: true },
        where: { id }
      });
      await this.log(client, {
        action: "SOFT_DELETE",
        entity: entity.label,
        entityId: id,
        metadata: { deleteGroupId },
        userId
      });
    }
    return deleteGroupId;
  }

  /**
   * Soft-delete every live row of one model matching `where` into an existing
   * `deleteGroupId` (one `updateMany`, one audit row), so the rows go and come
   * back with the group — e.g. the puzzles inside a deleted folder subtree.
   * `parentId` is the group's root row, logged as the entity id.
   */
  async softDeleteManyIntoGroup(
    client: PrismaClientLike,
    entityName: string,
    where: Record<string, unknown>,
    options: { cascadedFrom: string; deleteGroupId: string; parentId: string; userId: string }
  ): Promise<number> {
    const entity = this.getEntityOrThrow(entityName);
    const { cascadedFrom, deleteGroupId, parentId, userId } = options;
    const { count } = await this.getDelegate(client, entity.delegate).updateMany({
      data: { deleteGroupId, deletedAt: new Date(), deletedById: userId, isDeleted: true },
      where: { ...where, isDeleted: false }
    });

    if (count > 0) {
      await this.log(client, {
        action: "SOFT_DELETE",
        entity: entity.label,
        entityId: parentId,
        metadata: { cascadedFrom, count, deleteGroupId },
        userId
      });
    }
    return count;
  }

  /**
   * Soft-delete a parent row and every child row that belongs with it (a User's
   * profiles, a Batch's coach/student assignments), tagging them all with one
   * `deleteGroupId` so {@link restore} can bring the group back together
   * (AUDIT M13/M14). Children that are already deleted are left untouched.
   */
  async cascadeSoftDelete(
    client: PrismaClientLike,
    entityName: string,
    id: string,
    userId: string,
    options?: { metadata?: Prisma.InputJsonValue }
  ) {
    const entity = this.getEntityOrThrow(entityName);
    const deleteGroupId = randomUUID();
    const deletedAt = new Date();

    const item = await this.getDelegate(client, entity.delegate).update({
      data: { deleteGroupId, deletedAt, deletedById: userId, isDeleted: true },
      where: { id }
    });

    await this.log(client, {
      action: "SOFT_DELETE",
      entity: entity.label,
      entityId: id,
      metadata: options?.metadata,
      userId
    });

    for (const child of CASCADE_CHILDREN[entity.label] ?? []) {
      const { count } = await this.getDelegate(client, child.delegate).updateMany({
        data: { deleteGroupId, deletedAt, deletedById: userId, isDeleted: true },
        where: { [child.foreignKey]: id, isDeleted: false }
      });

      if (count > 0) {
        await this.log(client, {
          action: "SOFT_DELETE",
          entity: child.label,
          entityId: id,
          metadata: { cascadedFrom: entity.label, count, deleteGroupId },
          userId
        });
      }
    }

    return item;
  }

  async hardDelete(
    client: PrismaClientLike,
    entityName: string,
    id: string,
    userId: string | null,
    action: TrashAction = "PERMANENT_DELETE"
  ): Promise<boolean> {
    const entity = this.getEntityOrThrow(entityName);
    // Only a row that is still in the trash: the caller listed it before this
    // ran, and it may have been restored since.
    const { count } = await this.getDelegate(client, entity.delegate).deleteMany({
      where: { id, isDeleted: true }
    });
    if (count === 0) return false;

    await this.log(client, {
      action,
      entity: entity.label,
      entityId: id,
      userId
    });
    return true;
  }

  async findExpired(cutoff: Date, client: PrismaClientLike = this.prisma.withDeleted) {
    const results = await Promise.all(
      trashEntities.map(async (entity) => {
        const items = await this.getDelegate(
          client,
          entity.delegate
        ).findMany({
          select: { deleteGroupId: true, id: true },
          where: {
            deletedAt: { lt: cutoff },
            isDeleted: true
          }
        });

        return items.map((item) => ({
          deleteGroupId: item.deleteGroupId ?? null,
          entity: entity.label,
          id: item.id
        }));
      })
    );

    return results.flat();
  }

  /** Users whose payment, invoice or payroll history must be kept, so they are never hard-deleted. */
  async findUserIdsWithRetainedHistory(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const byUser = { userId: { in: userIds } };
    const byCoach = { coachId: { in: userIds } };
    const [orders, subscriptions, invoices, creditNotes, entitlements, redemptions, manualRecords, profiles, rates, payrollRecords] =
      await Promise.all([
        this.prisma.order.findMany({ distinct: ["userId"], select: { userId: true }, where: byUser }),
        this.prisma.subscription.findMany({ distinct: ["userId"], select: { userId: true }, where: byUser }),
        this.prisma.invoice.findMany({ distinct: ["userId"], select: { userId: true }, where: byUser }),
        this.prisma.creditNote.findMany({ distinct: ["userId"], select: { userId: true }, where: byUser }),
        this.prisma.entitlement.findMany({ distinct: ["userId"], select: { userId: true }, where: byUser }),
        this.prisma.discountRedemption.findMany({ distinct: ["userId"], select: { userId: true }, where: byUser }),
        this.prisma.manualPaymentRecord.findMany({
          distinct: ["recordedByUserId"],
          select: { recordedByUserId: true },
          where: { recordedByUserId: { in: userIds } }
        }),
        this.prisma.coachCompensationProfile.findMany({ distinct: ["coachId"], select: { coachId: true }, where: byCoach }),
        this.prisma.coachCompensationRate.findMany({ distinct: ["coachId"], select: { coachId: true }, where: byCoach }),
        this.prisma.coachPayrollRecord.findMany({ distinct: ["coachId"], select: { coachId: true }, where: byCoach })
      ]);

    return new Set([
      ...[orders, subscriptions, invoices, creditNotes, entitlements, redemptions].flat().map((row) => row.userId),
      ...manualRecords.map((row) => row.recordedByUserId),
      ...[profiles, rates, payrollRecords].flat().map((row) => row.coachId)
    ]);
  }

  async log(
    client: PrismaClientLike,
    data: {
      action: TrashAction;
      entity: string;
      entityId: string;
      metadata?: Prisma.InputJsonValue;
      userId?: string | null;
    }
  ) {
    await this.getDelegate(client, "trashAuditLog").create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        metadata: data.metadata ?? undefined,
        userId: data.userId ?? undefined
      }
    });
  }

  getEntityOrThrow(entityName: string) {
    const entity = getTrashEntity(entityName);

    if (!entity) {
      throw new NotFoundException("Trash entity not found.");
    }

    return entity;
  }

  /**
   * Per-entity `orderBy` for the requested sort column. Each entity query must
   * be ordered by the *same* key the service then merges on, otherwise the
   * per-entity page is the top-N by `deletedAt` and the merged result is not
   * the true global top-N (AUDIT M8).
   */
  private buildOrderBy(
    entity: (typeof trashEntities)[number],
    options: TrashFindOptions
  ) {
    const direction = options.sortOrder ?? "asc";

    switch (options.sortBy) {
      case "title":
        return { [entity.titleField]: direction };
      case "deletedBy":
        return { deletedBy: { email: direction } };
      case "entity":
      case "deletedAt":
      default:
        return { deletedAt: direction };
    }
  }

  private buildTrashWhere(
    entity: (typeof trashEntities)[number],
    options: TrashFindOptions
  ) {
    const where: Record<string, unknown> = {
      isDeleted: true
    };

    if (options.deletedById) {
      where.deletedById = options.deletedById;
    }

    if (options.deletedFrom || options.deletedTo) {
      where.deletedAt = {
        gte: options.deletedFrom,
        lte: options.deletedTo
      };
    }

    if (options.search && entity.searchFields.length > 0) {
      where.OR = entity.searchFields.map((field) => ({
        [field]: {
          contains: options.search,
          mode: "insensitive"
        }
      }));
    }

    return where;
  }

  private toTrashItem(
    entity: (typeof trashEntities)[number],
    item: TrashRecord
  ) {
    return {
      deletedAt: item.deletedAt,
      deletedBy: item.deletedBy ?? null,
      entity: entity.label,
      id: item.id,
      title: this.getTitle(entity.titleField, item)
    };
  }

  private getTitle(titleField: string, item: TrashRecord) {
    const title = item[titleField];

    if (typeof title === "string" && title.trim()) {
      return title;
    }

    return String(item.id);
  }

  private getDelegate(client: PrismaClientLike, delegate: string) {
    return (client as Record<string, PrismaDelegateLike>)[delegate];
  }
}
