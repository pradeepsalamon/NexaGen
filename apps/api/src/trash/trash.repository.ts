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
  findFirst: (args: unknown) => Promise<TrashRecord | null>;
  findMany: (args: unknown) => Promise<TrashRecord[]>;
  update: (args: unknown) => Promise<unknown>;
};
type PrismaClientLike = Record<string, unknown>;
type TrashRecord = {
  deletedAt: Date | string | null;
  deletedBy?: unknown;
  id: string;
} & Record<string, unknown>;
type TrashFindOptions = {
  deletedById?: string;
  deletedFrom?: Date;
  deletedTo?: Date;
  entity?: string;
  page: number;
  pageSize: number;
  search?: string;
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
            orderBy: { deletedAt: "desc" },
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
    const { entity } = await this.findDeleted(entityName, id);

    return this.prisma.$transaction(async (transaction) => {
      const restored = await this.getDelegate(transaction, entity.delegate).update({
        data: {
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

  async hardDelete(
    client: PrismaClientLike,
    entityName: string,
    id: string,
    userId: string | null,
    action: TrashAction = "PERMANENT_DELETE"
  ) {
    const entity = this.getEntityOrThrow(entityName);
    await this.getDelegate(client, entity.delegate).delete({
      where: { id }
    });

    await this.log(client, {
      action,
      entity: entity.label,
      entityId: id,
      userId
    });
  }

  async findExpired(cutoff: Date, client: PrismaClientLike = this.prisma.withDeleted) {
    const results = await Promise.all(
      trashEntities.map(async (entity) => {
        const items = await this.getDelegate(
          client,
          entity.delegate
        ).findMany({
          select: { id: true },
          where: {
            deletedAt: { lt: cutoff },
            isDeleted: true
          }
        });

        return items.map((item) => ({
          entity: entity.label,
          id: item.id
        }));
      })
    );

    return results.flat();
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
