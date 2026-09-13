import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import {
  computeDiscount,
  DISCOUNT_REJECTION_MESSAGES,
  discountValueIssue,
  type AppliedDiscount,
  type CreateDiscountRequest,
  type DiscountItem,
  type DiscountRejection,
  type PaymentMethodKind,
  type UpdateDiscountRequest
} from "@nexa-chess/types";
import { Prisma, type Discount, type User } from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { isUniqueViolation } from "./payments.util";

/** A code either applies, with a computed amount, or it does not, with a reason. */
export type DiscountResolution =
  | { valid: true; discount: Discount; amount: number }
  | { valid: false; reason: DiscountRejection; message: string };

/**
 * Discounts — the single mechanism that changes what someone pays.
 *
 * The arithmetic lives in `computeDiscount` in `@nexa-chess/types`, shared with
 * the checkout preview, so the figure a buyer is shown and the figure written
 * onto the order come from the same function.
 *
 * Redemption is recorded at CAPTURE, not at checkout: an abandoned cart must
 * never burn a limited code. The trade-off is that a handful of people can pass
 * validation simultaneously on the last use of a code — which is the right way
 * round, because the alternative silently eats inventory.
 */
@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a code against a specific plan, method and currency, and returns
   * what it would take off. Called from the checkout preview AND from
   * `createCheckout` — the client's figures are never trusted.
   */
  async resolve(input: {
    code: string;
    userId: string;
    plan: {
      id: string;
      batchId: string | null;
      amount: number;
      currency: string;
    };
    method?: PaymentMethodKind;
  }): Promise<DiscountResolution> {
    const code = input.code.trim().toUpperCase();
    if (!code) return this.reject("NOT_FOUND");

    const discount = await this.prisma.discount.findUnique({ where: { code } });
    if (!discount) return this.reject("NOT_FOUND");
    if (!discount.isActive) return this.reject("INACTIVE");

    const now = new Date();
    if (discount.startsAt && discount.startsAt > now) {
      return this.reject("NOT_STARTED");
    }
    if (discount.endsAt && discount.endsAt <= now) {
      return this.reject("EXPIRED");
    }

    if (
      discount.maxRedemptions !== null &&
      discount.redemptionCount >= discount.maxRedemptions
    ) {
      return this.reject("USAGE_LIMIT_REACHED");
    }

    // Per-user limit counts settled redemptions only, so an abandoned attempt
    // never locks someone out of a code they have not actually used.
    const usedByUser = await this.prisma.discountRedemption.count({
      where: { discountId: discount.id, userId: input.userId }
    });
    if (usedByUser >= discount.maxPerUser) {
      return this.reject("ALREADY_USED");
    }

    if (
      discount.planIds.length > 0 &&
      !discount.planIds.includes(input.plan.id)
    ) {
      return this.reject("PLAN_NOT_ELIGIBLE");
    }

    if (discount.batchIds.length > 0) {
      if (!input.plan.batchId || !discount.batchIds.includes(input.plan.batchId)) {
        return this.reject("PLAN_NOT_ELIGIBLE");
      }
    }

    if (discount.methods.length > 0) {
      // A method-scoped code is not "invalid" before a method is chosen — it
      // simply cannot be priced yet, so say which methods would unlock it.
      if (!input.method || !discount.methods.includes(input.method)) {
        return this.reject("METHOD_NOT_ELIGIBLE");
      }
    }

    if (
      discount.type === "FIXED" &&
      discount.currency &&
      discount.currency.toUpperCase() !== input.plan.currency.toUpperCase()
    ) {
      return this.reject("CURRENCY_MISMATCH");
    }

    if (
      discount.minOrderAmount !== null &&
      input.plan.amount < discount.minOrderAmount
    ) {
      return this.reject("BELOW_MINIMUM");
    }

    const amount = computeDiscount(input.plan.amount, {
      type: discount.type,
      value: discount.value,
      maxDiscountAmount: discount.maxDiscountAmount
    });

    if (amount <= 0) {
      // A code that takes nothing off is worse than no code — it looks applied
      // while changing nothing.
      return this.reject("BELOW_MINIMUM");
    }

    return { valid: true, discount, amount };
  }

  /**
   * Records the redemption, inside the capture transaction. Idempotent on the
   * unique `orderId`, so a replayed webhook cannot consume a second use.
   *
   * Deliberately never throws: money has already changed hands by the time this
   * runs, and a bookkeeping problem must not roll back a capture.
   */
  async redeem(
    tx: PrismaTransactionClient,
    input: { discountId: string; userId: string; orderId: string; amount: number }
  ): Promise<void> {
    const existing = await tx.discountRedemption.findUnique({
      where: { orderId: input.orderId }
    });
    if (existing) return;

    try {
      await tx.discountRedemption.create({
        data: {
          discountId: input.discountId,
          userId: input.userId,
          orderId: input.orderId,
          amount: input.amount
        }
      });
      await tx.discount.update({
        where: { id: input.discountId },
        data: { redemptionCount: { increment: 1 } }
      });
    } catch (error) {
      if (isUniqueViolation(error)) return;
      this.logger.error(
        `Could not record redemption of discount ${input.discountId} on order ${input.orderId}: ${(error as Error).message}`
      );
    }
  }

  // ── Admin CRUD ──

  async list(): Promise<DiscountItem[]> {
    const discounts = await this.prisma.discount.findMany({
      orderBy: { createdAt: "desc" }
    });

    // Resolve scope names in two queries rather than N, so the table reads in
    // one round trip.
    const planIds = [...new Set(discounts.flatMap((d) => d.planIds))];
    const batchIds = [...new Set(discounts.flatMap((d) => d.batchIds))];

    const [plans, batches] = await Promise.all([
      planIds.length > 0
        ? this.prisma.plan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([]),
      batchIds.length > 0
        ? this.prisma.batch.findMany({
            where: { id: { in: batchIds } },
            select: { id: true, name: true }
          })
        : Promise.resolve([])
    ]);

    const planNames = new Map(plans.map((plan) => [plan.id, plan.name]));
    const batchNames = new Map(batches.map((batch) => [batch.id, batch.name]));

    return discounts.map((discount) => this.toItem(discount, planNames, batchNames));
  }

  async create(admin: User, dto: CreateDiscountRequest): Promise<DiscountItem> {
    this.assertCoherent(dto);

    try {
      const discount = await this.prisma.discount.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          type: dto.type,
          value: dto.value,
          currency: dto.currency ?? null,
          maxDiscountAmount: dto.maxDiscountAmount ?? null,
          minOrderAmount: dto.minOrderAmount ?? null,
          startsAt: parseDate(dto.startsAt),
          endsAt: parseDate(dto.endsAt),
          maxRedemptions: dto.maxRedemptions ?? null,
          maxPerUser: dto.maxPerUser,
          planIds: dto.planIds,
          batchIds: dto.batchIds,
          methods: dto.methods,
          isActive: dto.isActive,
          createdById: admin.id
        }
      });
      return this.toItem(discount, new Map(), new Map());
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(`The code "${dto.code}" already exists.`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateDiscountRequest): Promise<DiscountItem> {
    const existing = await this.prisma.discount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Discount not found.");

    this.assertCoherent({
      type: dto.type ?? existing.type,
      value: dto.value ?? existing.value,
      currency: dto.currency !== undefined ? dto.currency : existing.currency
    });

    const discount = await this.prisma.discount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ?? null }
          : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.currency !== undefined ? { currency: dto.currency ?? null } : {}),
        ...(dto.maxDiscountAmount !== undefined
          ? { maxDiscountAmount: dto.maxDiscountAmount ?? null }
          : {}),
        ...(dto.minOrderAmount !== undefined
          ? { minOrderAmount: dto.minOrderAmount ?? null }
          : {}),
        ...(dto.startsAt !== undefined ? { startsAt: parseDate(dto.startsAt) } : {}),
        ...(dto.endsAt !== undefined ? { endsAt: parseDate(dto.endsAt) } : {}),
        ...(dto.maxRedemptions !== undefined
          ? { maxRedemptions: dto.maxRedemptions ?? null }
          : {}),
        ...(dto.maxPerUser !== undefined ? { maxPerUser: dto.maxPerUser } : {}),
        ...(dto.planIds !== undefined ? { planIds: dto.planIds } : {}),
        ...(dto.batchIds !== undefined ? { batchIds: dto.batchIds } : {}),
        ...(dto.methods !== undefined ? { methods: dto.methods } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      }
    });

    return this.toItem(discount, new Map(), new Map());
  }

  /**
   * Deactivates rather than deletes once a code has been used — the orders that
   * claimed it reference the row, and a receipt must keep making sense.
   */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: { _count: { select: { redemptions: true, orders: true } } }
    });
    if (!discount) throw new NotFoundException("Discount not found.");

    if (discount._count.redemptions > 0 || discount._count.orders > 0) {
      await this.prisma.discount.update({
        where: { id },
        data: { isActive: false }
      });
      return { deleted: false };
    }

    await this.prisma.discount.delete({ where: { id } });
    return { deleted: true };
  }

  private assertCoherent(input: {
    type: CreateDiscountRequest["type"];
    value: number;
    currency?: string | null;
  }): void {
    const issue = discountValueIssue(input);
    if (issue) throw new BadRequestException(issue);
  }

  private reject(reason: DiscountRejection): DiscountResolution {
    return { valid: false, reason, message: DISCOUNT_REJECTION_MESSAGES[reason] };
  }

  private toItem(
    discount: Discount,
    planNames: Map<string, string>,
    batchNames: Map<string, string>
  ): DiscountItem {
    return {
      id: discount.id,
      code: discount.code,
      name: discount.name,
      description: discount.description,
      type: discount.type,
      value: discount.value,
      currency: discount.currency,
      maxDiscountAmount: discount.maxDiscountAmount,
      minOrderAmount: discount.minOrderAmount,
      startsAt: discount.startsAt?.toISOString() ?? null,
      endsAt: discount.endsAt?.toISOString() ?? null,
      maxRedemptions: discount.maxRedemptions,
      maxPerUser: discount.maxPerUser,
      redemptionCount: discount.redemptionCount,
      planIds: discount.planIds,
      batchIds: discount.batchIds,
      methods: discount.methods,
      isActive: discount.isActive,
      planNames: discount.planIds.map((id) => planNames.get(id) ?? id),
      batchNames: discount.batchIds.map((id) => batchNames.get(id) ?? id),
      createdAt: discount.createdAt.toISOString(),
      updatedAt: discount.updatedAt.toISOString()
    };
  }
}

/** Applied to an order, as both the client and the invoice see it. */
export function toAppliedDiscount(
  discount: Discount,
  amount: number
): AppliedDiscount {
  return {
    id: discount.id,
    code: discount.code,
    name: discount.name,
    type: discount.type,
    amount
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type { Prisma };
