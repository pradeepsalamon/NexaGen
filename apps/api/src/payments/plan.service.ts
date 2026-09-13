import {
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import type {
  CreatePlanRequest,
  PlanItem,
  PlanListResponse,
  UpdatePlanRequest
} from "@nexa-chess/types";
import { Prisma, SubscriptionStatus, type User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueViolation, toPlanItem } from "./payments.util";

type PlanRow = Prisma.PlanGetPayload<{
  include: {
    batch: { select: { name: true } };
    _count: { select: { subscriptions: true } };
  };
}>;

const PLAN_INCLUDE = {
  batch: { select: { name: true } },
  _count: { select: { subscriptions: true } }
} satisfies Prisma.PlanInclude;

/**
 * The sellable catalogue. Plans are not soft-deletable — archiving one
 * (`isActive: false`) hides it from checkout while leaving every past order,
 * invoice and entitlement that points at it intact.
 */
@Injectable()
export class PlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** Students see only what they can buy; admins see everything. */
  async list(user: User | null): Promise<PlanListResponse> {
    const adminView =
      user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

    const rows = await this.prisma.plan.findMany({
      where: adminView ? {} : { isActive: true },
      include: PLAN_INCLUDE,
      orderBy: [{ sortOrder: "asc" }, { amount: "asc" }]
    });

    return { plans: rows.map((row) => this.toItem(row)) };
  }

  async create(dto: CreatePlanRequest): Promise<PlanItem> {
    await this.assertBatchExists(dto.batchId ?? null);

    try {
      const plan = await this.prisma.plan.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          amount: dto.amount,
          currency: dto.currency,
          interval: dto.interval,
          accessDays: dto.accessDays ?? null,
          taxPercent: dto.taxPercent,
          batchId: dto.batchId ?? null,
          features: dto.features,
          isActive: dto.isActive,
          sortOrder: dto.sortOrder
        },
        include: PLAN_INCLUDE
      });
      return this.toItem(plan);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`A plan with code "${dto.code}" already exists.`);
      }
      throw error;
    }
  }

  /**
   * Editing a plan never re-prices anything already sold: orders freeze their
   * own amounts and subscriptions freeze theirs at subscribe time.
   */
  async update(planId: string, dto: UpdatePlanRequest): Promise<PlanItem> {
    const existing = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!existing) throw new NotFoundException("Plan not found.");

    if (dto.batchId !== undefined) {
      await this.assertBatchExists(dto.batchId);
    }

    const plan = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ?? null }
          : {}),
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.interval !== undefined ? { interval: dto.interval } : {}),
        ...(dto.accessDays !== undefined
          ? { accessDays: dto.accessDays ?? null }
          : {}),
        ...(dto.taxPercent !== undefined ? { taxPercent: dto.taxPercent } : {}),
        ...(dto.batchId !== undefined ? { batchId: dto.batchId ?? null } : {}),
        ...(dto.features !== undefined ? { features: dto.features } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {})
      },
      include: PLAN_INCLUDE
    });

    return this.toItem(plan);
  }

  /**
   * Archives rather than deletes. A plan with money attached to it is part of
   * the financial record; removing the row would orphan invoices.
   */
  async archive(planId: string): Promise<PlanItem> {
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: {
        _count: {
          select: {
            subscriptions: {
              where: {
                status: {
                  in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]
                }
              }
            }
          }
        }
      }
    });
    if (!plan) throw new NotFoundException("Plan not found.");

    if (plan._count.subscriptions > 0) {
      throw new ConflictException(
        `${plan._count.subscriptions} active subscription(s) still bill against this plan. Cancel them first.`
      );
    }

    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: { isActive: false },
      include: PLAN_INCLUDE
    });
    return this.toItem(updated);
  }

  private async assertBatchExists(batchId: string | null): Promise<void> {
    if (!batchId) return;
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new NotFoundException("That batch does not exist.");
    }
  }

  private toItem(row: PlanRow): PlanItem {
    return toPlanItem(row);
  }
}
