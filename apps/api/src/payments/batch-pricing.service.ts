import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  BatchPricingResponse,
  CreateBatchPlanRequest,
  PlanItem,
  UpdatePlanRequest
} from "@nexa-chess/types";
import { Prisma, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { isUniqueViolation, toPlanItem } from "./payments.util";

const PLAN_INCLUDE = {
  batch: { select: { name: true } },
  _count: { select: { subscriptions: true } }
} satisfies Prisma.PlanInclude;

/**
 * What a batch costs.
 *
 * A batch's price options ARE `Plan` rows carrying that `batchId` — there is
 * deliberately no second pricing model, so the checkout, the invoice, the
 * entitlement and the admin's "cost of this batch" are all the same object.
 *
 * A batch can hold several at once: a monthly subscription beside a one-time
 * fee, each with its own allowed payment methods.
 */
@Injectable()
export class BatchPricingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(batchId: string): Promise<BatchPricingResponse> {
    const batch = await this.requireBatch(batchId);

    const plans = await this.prisma.plan.findMany({
      where: { batchId },
      include: PLAN_INCLUDE,
      orderBy: [{ sortOrder: "asc" }, { amount: "asc" }]
    });

    return {
      batchId: batch.id,
      batchName: batch.name,
      plans: plans.map(toPlanItem)
    };
  }

  /**
   * Adds a price option to a batch. The plan `code` is derived from the batch
   * and interval so an admin pricing a batch never has to invent one, with a
   * numeric suffix if that name is taken.
   */
  async create(
    batchId: string,
    dto: CreateBatchPlanRequest
  ): Promise<PlanItem> {
    const batch = await this.requireBatch(batchId);
    const code = await this.uniqueCode(batch.name, dto.interval);

    try {
      const plan = await this.prisma.plan.create({
        data: {
          code,
          name: dto.name,
          description: dto.description ?? null,
          amount: dto.amount,
          currency: dto.currency,
          interval: dto.interval,
          accessDays: dto.accessDays ?? null,
          taxPercent: dto.taxPercent,
          batchId: batch.id,
          allowedMethods: dto.allowedMethods,
          features: dto.features,
          isActive: dto.isActive,
          sortOrder: dto.sortOrder
        },
        include: PLAN_INCLUDE
      });
      return toPlanItem(plan);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          "A price option with that generated code already exists. Rename the option and try again."
        );
      }
      throw error;
    }
  }

  /**
   * Edits one of a batch's price options.
   *
   * Changing the price never re-prices anything already sold: an order freezes
   * its amounts at checkout and a subscription freezes its amount at subscribe
   * time, so existing members keep what they agreed to.
   */
  async update(
    batchId: string,
    planId: string,
    dto: UpdatePlanRequest
  ): Promise<PlanItem> {
    await this.requirePlanInBatch(batchId, planId);

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
        ...(dto.allowedMethods !== undefined
          ? { allowedMethods: dto.allowedMethods }
          : {}),
        ...(dto.features !== undefined ? { features: dto.features } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {})
      },
      include: PLAN_INCLUDE
    });

    return toPlanItem(plan);
  }

  /**
   * Archives a price option. Never deletes: invoices and entitlements point at
   * it, and a receipt has to keep making sense.
   */
  async archive(batchId: string, planId: string): Promise<PlanItem> {
    await this.requirePlanInBatch(batchId, planId);

    const active = await this.prisma.subscription.count({
      where: {
        planId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] }
      }
    });
    if (active > 0) {
      throw new ConflictException(
        `${active} active subscription(s) still bill against this option. Cancel them first.`
      );
    }

    const plan = await this.prisma.plan.update({
      where: { id: planId },
      data: { isActive: false },
      include: PLAN_INCLUDE
    });
    return toPlanItem(plan);
  }

  private async requireBatch(batchId: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException("Batch not found.");
    return batch;
  }

  private async requirePlanInBatch(batchId: string, planId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.batchId !== batchId) {
      throw new NotFoundException("That price option does not belong to this batch.");
    }
    return plan;
  }

  /** "beginner-batch-monthly", then "-2", "-3" … if that is taken. */
  private async uniqueCode(batchName: string, interval: string): Promise<string> {
    const base = `${slugify(batchName)}-${interval.toLowerCase().replace(/_/g, "-")}`
      .replace(/-+/g, "-")
      .slice(0, 52);

    for (let suffix = 0; suffix < 50; suffix += 1) {
      const code = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const taken = await this.prisma.plan.findUnique({ where: { code } });
      if (!taken) return code;
    }

    // Vanishingly unlikely; a timestamp is still a valid, readable code.
    return `${base}-${Date.now().toString(36)}`.slice(0, 60);
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "batch"
  );
}
