import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  formatReferralPoints,
  formatReferralVoucherValue,
  referralVoucherProblem,
  type CreateReferralVoucherRequest,
  type MyReferralVoucherCatalogue,
  type MyReferralVoucherItem,
  type RedeemReferralVoucherRequest,
  type ReferralRedemptionItem,
  type ReferralRedemptionStatus,
  type ReferralVoucherItem,
  type UpdateReferralVoucherRequest
} from "@nexa-chess/types";
import { EntitlementStatus, type Prisma, type ReferralSettings, type ReferralVoucher, type User, UserRole } from "@prisma/client";
import { DiscountService } from "../payments/discount.service";
import { EntitlementService } from "../payments/entitlement.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { OPEN_ORDER_STATUSES, ReferralCreditsService } from "./referral-credits.service";
import { displayName } from "./referral.util";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Redemptions that count against stock and limits (the points are spent or held). */
const LIVE_STATUSES: ReferralRedemptionStatus[] = ["PENDING", "FULFILLED"];

export const REDEMPTION_ITEM_INCLUDE = {
  discount: { select: { code: true, endsAt: true, isActive: true, redemptionCount: true } },
  plan: { select: { name: true } },
  user: { select: { email: true, firstName: true, lastName: true } }
} satisfies Prisma.ReferralRedemptionInclude;

type RedemptionRow = Prisma.ReferralRedemptionGetPayload<{ include: typeof REDEMPTION_ITEM_INCLUDE }>;

/**
 * Reward vouchers (docs/REFERRALS.md § Vouchers): admins make them, students
 * spend points on them. A redemption holds the points at once (ledger
 * `REDEMPTION`, under the user's lock, with the voucher's lock for stock),
 * then is fulfilled — straight away, or when an admin approves — by issuing a
 * one-use personal discount code or by extending the student's access
 * (`EntitlementService.grantFreeDays`). Rejecting, cancelling or revoking
 * returns the points.
 */
@Injectable()
export class ReferralVouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: ReferralCreditsService,
    private readonly discounts: DiscountService,
    private readonly entitlements: EntitlementService
  ) {}

  // ── Admin: vouchers ──

  async list(currency: string): Promise<ReferralVoucherItem[]> {
    const vouchers = await this.prisma.referralVoucher.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return this.toVoucherItems(vouchers, currency);
  }

  async create(adminId: string, body: CreateReferralVoucherRequest, currency: string): Promise<ReferralVoucherItem> {
    const data = this.normalise(body);
    await this.assertPlansExist(data.planIds);
    const voucher = await this.prisma.referralVoucher.create({ data: { ...data, createdById: adminId } });
    return (await this.toVoucherItems([voucher], currency))[0]!;
  }

  /** Edits apply to redemptions made from now on; issued rewards keep their snapshot. */
  async update(id: string, body: UpdateReferralVoucherRequest, currency: string): Promise<ReferralVoucherItem> {
    const existing = await this.prisma.referralVoucher.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Voucher not found.");
    const merged = {
      amountOffMinor: existing.amountOffMinor,
      codeValidDays: existing.codeValidDays,
      description: existing.description,
      endsAt: existing.endsAt?.toISOString() ?? null,
      freeDays: existing.freeDays,
      isActive: existing.isActive,
      maxDiscountMinor: existing.maxDiscountMinor,
      minOrderMinor: existing.minOrderMinor,
      name: existing.name,
      percentOff: existing.percentOff,
      perUserLimit: existing.perUserLimit,
      planIds: existing.planIds,
      pointsCost: existing.pointsCost,
      requiresApproval: existing.requiresApproval,
      sortOrder: existing.sortOrder,
      startsAt: existing.startsAt?.toISOString() ?? null,
      stock: existing.stock,
      type: existing.type,
      ...Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))
    } as CreateReferralVoucherRequest;
    const data = this.normalise(merged);
    await this.assertPlansExist(data.planIds);
    const voucher = await this.prisma.referralVoucher.update({ data, where: { id } });
    return (await this.toVoucherItems([voucher], currency))[0]!;
  }

  /** A voucher someone redeemed is switched off instead: redemptions point at it. */
  async remove(id: string): Promise<{ deleted: boolean }> {
    const voucher = await this.prisma.referralVoucher.findUnique({ include: { _count: { select: { redemptions: true } } }, where: { id } });
    if (!voucher) throw new NotFoundException("Voucher not found.");
    if (voucher._count.redemptions > 0) {
      await this.prisma.referralVoucher.update({ data: { isActive: false }, where: { id } });
      return { deleted: false };
    }
    await this.prisma.referralVoucher.delete({ where: { id } });
    return { deleted: true };
  }

  /** The shape rule, then only the fields the type uses (the rest cleared). */
  private normalise(body: CreateReferralVoucherRequest) {
    const problem = referralVoucherProblem(body);
    if (problem) throw new BadRequestException(problem.message);
    const isPercent = body.type === "PERCENT_DISCOUNT";
    const isDiscount = body.type !== "FREE_DAYS";
    return {
      amountOffMinor: body.type === "FIXED_DISCOUNT" ? (body.amountOffMinor ?? null) : null,
      codeValidDays: isDiscount ? (body.codeValidDays ?? null) : null,
      description: body.description || null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      freeDays: body.type === "FREE_DAYS" ? (body.freeDays ?? null) : null,
      isActive: body.isActive ?? true,
      maxDiscountMinor: isPercent ? (body.maxDiscountMinor ?? null) : null,
      minOrderMinor: isDiscount ? (body.minOrderMinor ?? null) : null,
      name: body.name,
      percentOff: isPercent ? (body.percentOff ?? null) : null,
      perUserLimit: body.perUserLimit ?? null,
      planIds: [...new Set(body.planIds ?? [])],
      pointsCost: body.pointsCost,
      requiresApproval: body.requiresApproval ?? false,
      sortOrder: body.sortOrder ?? 0,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      stock: body.stock ?? null,
      type: body.type
    };
  }

  private async assertPlansExist(planIds: string[]) {
    if (planIds.length === 0) return;
    const found = await this.prisma.plan.count({ where: { id: { in: planIds } } });
    if (found !== planIds.length) throw new BadRequestException("Pick plans that exist.");
  }

  private async toVoucherItems(vouchers: ReferralVoucher[], currency: string): Promise<ReferralVoucherItem[]> {
    const ids = vouchers.map((voucher) => voucher.id);
    const [groups, planNames] = await Promise.all([
      this.prisma.referralRedemption.groupBy({ _count: true, by: ["voucherId", "status"], where: { voucherId: { in: ids } } }),
      this.planNames(vouchers.flatMap((voucher) => voucher.planIds))
    ]);
    const countOf = (id: string, statuses: ReferralRedemptionStatus[]) =>
      groups.filter((group) => group.voucherId === id && statuses.includes(group.status)).reduce((sum, group) => sum + group._count, 0);
    return vouchers.map((voucher) => ({
      amountOffMinor: voucher.amountOffMinor,
      codeValidDays: voucher.codeValidDays,
      createdAt: voucher.createdAt.toISOString(),
      currency,
      description: voucher.description,
      endsAt: voucher.endsAt?.toISOString() ?? null,
      freeDays: voucher.freeDays,
      id: voucher.id,
      isActive: voucher.isActive,
      maxDiscountMinor: voucher.maxDiscountMinor,
      minOrderMinor: voucher.minOrderMinor,
      name: voucher.name,
      pendingCount: countOf(voucher.id, ["PENDING"]),
      percentOff: voucher.percentOff,
      perUserLimit: voucher.perUserLimit,
      planIds: voucher.planIds,
      planNames: voucher.planIds.map((id) => planNames.get(id) ?? id),
      pointsCost: voucher.pointsCost,
      redeemedCount: countOf(voucher.id, LIVE_STATUSES),
      requiresApproval: voucher.requiresApproval,
      sortOrder: voucher.sortOrder,
      startsAt: voucher.startsAt?.toISOString() ?? null,
      stock: voucher.stock,
      type: voucher.type
    }));
  }

  private async planNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const plans = await this.prisma.plan.findMany({ select: { id: true, name: true }, where: { id: { in: unique } } });
    return new Map(plans.map((plan) => [plan.id, plan.name]));
  }

  // ── Student: the rewards store ──

  async catalogue(user: Pick<User, "id" | "role">, settings: ReferralSettings, pointsBalance: number): Promise<MyReferralVoucherCatalogue> {
    const canRedeem = this.canRedeem(user, settings);
    const now = new Date();
    const [vouchers, plans] = await Promise.all([
      canRedeem
        ? this.prisma.referralVoucher.findMany({
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            where: {
              AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
              isActive: true
            }
          })
        : Promise.resolve([]),
      canRedeem ? this.currentPlans(user.id, now) : Promise.resolve([])
    ]);
    const ids = vouchers.map((voucher) => voucher.id);
    const [all, mine, recent, planNames] = await Promise.all([
      this.prisma.referralRedemption.groupBy({ _count: true, by: ["voucherId"], where: { status: { in: LIVE_STATUSES }, voucherId: { in: ids } } }),
      this.prisma.referralRedemption.groupBy({
        _count: true,
        by: ["voucherId"],
        where: { status: { in: LIVE_STATUSES }, userId: user.id, voucherId: { in: ids } }
      }),
      settings.maxRedemptionsPer30Days > 0 ? this.recentCount(this.prisma, user.id) : Promise.resolve(0),
      this.planNames(vouchers.flatMap((voucher) => voucher.planIds))
    ]);
    const allMap = new Map(all.map((row) => [row.voucherId, row._count]));
    const mineMap = new Map(mine.map((row) => [row.voucherId, row._count]));
    const heldPlans = new Set(plans.map((plan) => plan.planId));

    const items = vouchers.map((voucher): MyReferralVoucherItem => {
      const redeemedByMe = mineMap.get(voucher.id) ?? 0;
      const remaining = voucher.stock === null ? null : Math.max(0, voucher.stock - (allMap.get(voucher.id) ?? 0));
      let unavailableReason: string | null = null;
      if (remaining === 0) unavailableReason = "All taken";
      else if (voucher.perUserLimit !== null && redeemedByMe >= voucher.perUserLimit) unavailableReason = "You've used this one";
      else if (settings.maxRedemptionsPer30Days > 0 && recent >= settings.maxRedemptionsPer30Days) {
        unavailableReason = "Monthly limit reached";
      } else if (
        voucher.type === "FREE_DAYS" &&
        voucher.planIds.length !== 1 &&
        !(voucher.planIds.length === 0 ? heldPlans.size > 0 : voucher.planIds.some((id) => heldPlans.has(id)))
      ) {
        unavailableReason = "Needs an active plan";
      }
      return {
        amountOffMinor: voucher.amountOffMinor,
        codeValidDays: voucher.codeValidDays,
        description: voucher.description,
        endsAt: voucher.endsAt?.toISOString() ?? null,
        freeDays: voucher.freeDays,
        id: voucher.id,
        maxDiscountMinor: voucher.maxDiscountMinor,
        minOrderMinor: voucher.minOrderMinor,
        name: voucher.name,
        percentOff: voucher.percentOff,
        perUserLimit: voucher.perUserLimit,
        planIds: voucher.planIds,
        planNames: voucher.planIds.map((id) => planNames.get(id) ?? id),
        pointsCost: voucher.pointsCost,
        redeemedByMe,
        remaining,
        requiresApproval: voucher.requiresApproval,
        type: voucher.type,
        unavailableReason
      };
    });
    return { canRedeem, currency: settings.currency, plans, pointsBalance, vouchers: items };
  }

  canRedeem(user: Pick<User, "role">, settings: ReferralSettings): boolean {
    return settings.enabled && settings.redemptionsEnabled && user.role === UserRole.STUDENT;
  }

  /** The student's live time-limited access (what free days can extend). */
  private async currentPlans(userId: string, now: Date) {
    const rows = await this.prisma.entitlement.findMany({
      include: { plan: { select: { name: true } } },
      orderBy: { endsAt: "desc" },
      where: { endsAt: { gt: now }, startsAt: { lte: now }, status: EntitlementStatus.ACTIVE, userId }
    });
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (seen.has(row.planId) || !row.endsAt) return [];
      seen.add(row.planId);
      return [{ endsAt: row.endsAt.toISOString(), planId: row.planId, planName: row.plan.name }];
    });
  }

  private recentCount(client: PrismaTransactionClient | PrismaService, userId: string) {
    return client.referralRedemption.count({
      where: { createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) }, status: { in: LIVE_STATUSES }, userId }
    });
  }

  /**
   * Spends points on a voucher. Under the voucher's lock (stock) and the
   * user's lock (balance), re-checks every limit, holds the points and writes
   * the redemption; a voucher without approval is fulfilled in the same
   * transaction, so a failure (e.g. unlimited access already) spends nothing.
   */
  async redeem(
    user: Pick<User, "id" | "role" | "firstName" | "lastName">,
    settings: ReferralSettings,
    voucherId: string,
    body: RedeemReferralVoucherRequest
  ): Promise<ReferralRedemptionItem> {
    if (!this.canRedeem(user, settings)) throw new ForbiddenException("Redeeming points is not available for your account.");

    const id = await this.prisma.$transaction(async (tx) => {
      await this.credits.lockVoucher(tx, voucherId);
      await this.credits.lockUser(tx, user.id);
      const voucher = await tx.referralVoucher.findUnique({ where: { id: voucherId } });
      const now = new Date();
      if (!voucher || !voucher.isActive) throw new NotFoundException("This voucher is not available.");
      if ((voucher.startsAt && voucher.startsAt > now) || (voucher.endsAt && voucher.endsAt <= now)) {
        throw new ConflictException("This voucher is not available right now.");
      }
      if (voucher.stock !== null) {
        const taken = await tx.referralRedemption.count({ where: { status: { in: LIVE_STATUSES }, voucherId } });
        if (taken >= voucher.stock) throw new ConflictException("This voucher has all been taken.");
      }
      if (voucher.perUserLimit !== null) {
        const mine = await tx.referralRedemption.count({ where: { status: { in: LIVE_STATUSES }, userId: user.id, voucherId } });
        if (mine >= voucher.perUserLimit) throw new ConflictException("You've already redeemed this voucher as many times as allowed.");
      }
      if (settings.maxRedemptionsPer30Days > 0 && (await this.recentCount(tx, user.id)) >= settings.maxRedemptionsPer30Days) {
        throw new ConflictException(`You can redeem ${settings.maxRedemptionsPer30Days} voucher(s) every 30 days.`);
      }
      const balance = await this.credits.balance(user.id, "POINTS", tx);
      if (balance < voucher.pointsCost) {
        throw new BadRequestException(`You need ${formatReferralPoints(voucher.pointsCost - balance)} more.`);
      }
      const planId = voucher.type === "FREE_DAYS" ? await this.resolveFreeDaysPlan(tx, voucher, user.id, body.planId, now) : null;

      const redemption = await tx.referralRedemption.create({
        data: {
          amountOffMinor: voucher.amountOffMinor,
          currency: settings.currency,
          freeDays: voucher.freeDays,
          maxDiscountMinor: voucher.maxDiscountMinor,
          minOrderMinor: voucher.minOrderMinor,
          percentOff: voucher.percentOff,
          planId,
          pointsCost: voucher.pointsCost,
          type: voucher.type,
          userId: user.id,
          voucherId: voucher.id,
          voucherName: voucher.name
        }
      });
      await this.credits.debitRedemption(tx, {
        currency: settings.currency,
        note: `${voucher.name} (${formatReferralVoucherValue(voucher, settings.currency)})`,
        points: voucher.pointsCost,
        redemptionId: redemption.id,
        userId: user.id
      });
      if (!voucher.requiresApproval) await this.fulfil(tx, redemption.id, null, displayName(user), voucher);
      return redemption.id;
    });
    return this.getItem(id);
  }

  /**
   * Which plan free days extend: the one asked for, else the student's only
   * matching live plan, else the voucher's only plan (a new grant). Ambiguity
   * or no plan at all is a 400 the store explains.
   */
  private async resolveFreeDaysPlan(
    tx: PrismaTransactionClient,
    voucher: Pick<ReferralVoucher, "planIds">,
    userId: string,
    requested: string | undefined,
    now: Date
  ): Promise<string> {
    const live = await tx.entitlement.findMany({
      select: { planId: true },
      where: { endsAt: { gt: now }, startsAt: { lte: now }, status: EntitlementStatus.ACTIVE, userId }
    });
    const held = [...new Set(live.map((row) => row.planId))];
    const eligible = voucher.planIds.length ? held.filter((id) => voucher.planIds.includes(id)) : held;
    if (requested) {
      if (eligible.includes(requested) || voucher.planIds.includes(requested)) return requested;
      throw new BadRequestException("This voucher can't be used on that plan.");
    }
    if (eligible.length === 1) return eligible[0]!;
    if (eligible.length > 1) throw new BadRequestException("Choose which plan to add the free days to.");
    if (voucher.planIds.length === 1) return voucher.planIds[0]!;
    throw new BadRequestException("Free days need an active plan to add to.");
  }

  /** PENDING → FULFILLED, issuing the code or the free days. */
  private async fulfil(
    tx: PrismaTransactionClient,
    redemptionId: string,
    reviewerId: string | null,
    userName: string,
    voucher: Pick<ReferralVoucher, "codeValidDays" | "planIds">
  ) {
    const now = new Date();
    const { count } = await tx.referralRedemption.updateMany({
      data: { fulfilledAt: now, reviewedAt: reviewerId ? now : null, reviewedById: reviewerId, status: "FULFILLED" },
      where: { id: redemptionId, status: "PENDING" }
    });
    if (count === 0) await this.throwState(tx, redemptionId);
    const redemption = await tx.referralRedemption.findUniqueOrThrow({ where: { id: redemptionId } });

    if (redemption.type === "FREE_DAYS") {
      const planId = redemption.planId ?? (await this.resolveFreeDaysPlan(tx, voucher, redemption.userId, undefined, now));
      const { entitlement } = await this.entitlements.grantFreeDays(tx, {
        days: redemption.freeDays ?? 0,
        now,
        planId,
        userId: redemption.userId
      });
      await tx.referralRedemption.update({
        data: { accessEndsAt: entitlement.endsAt, entitlementId: entitlement.id, planId },
        where: { id: redemption.id }
      });
      return;
    }

    const discount = await this.discounts.createPersonalVoucherCode(tx, {
      createdById: reviewerId,
      currency: redemption.currency,
      endsAt: voucher.codeValidDays ? new Date(now.getTime() + voucher.codeValidDays * DAY_MS) : null,
      maxDiscountMinor: redemption.maxDiscountMinor,
      minOrderMinor: redemption.minOrderMinor,
      name: `${redemption.voucherName} — ${userName}`,
      planIds: voucher.planIds,
      type: redemption.type === "PERCENT_DISCOUNT" ? "PERCENTAGE" : "FIXED",
      userId: redemption.userId,
      value: redemption.type === "PERCENT_DISCOUNT" ? (redemption.percentOff ?? 0) : (redemption.amountOffMinor ?? 0)
    });
    await tx.referralRedemption.update({ data: { discountId: discount.id }, where: { id: redemption.id } });
  }

  /** The student withdraws a request still waiting for approval. */
  async cancel(userId: string, redemptionId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Someone else's redemption is "not found", never "forbidden".
      const redemption = await tx.referralRedemption.findFirst({ where: { id: redemptionId, userId } });
      if (!redemption) throw new NotFoundException("Redemption not found.");
      await this.close(tx, redemption.id, "PENDING", "CANCELLED", userId, null, "Voucher request cancelled.");
    });
  }

  async listMine(userId: string): Promise<ReferralRedemptionItem[]> {
    const rows = await this.prisma.referralRedemption.findMany({
      include: REDEMPTION_ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { userId }
    });
    return rows.map(toRedemptionItem);
  }

  // ── Admin: redemptions ──

  async approve(adminId: string, redemptionId: string) {
    await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.referralRedemption.findUnique({
        include: { user: { select: { firstName: true, lastName: true } }, voucher: { select: { codeValidDays: true, planIds: true } } },
        where: { id: redemptionId }
      });
      if (!redemption) throw new NotFoundException("Redemption not found.");
      await this.fulfil(tx, redemption.id, adminId, displayName(redemption.user), redemption.voucher);
    });
  }

  async reject(adminId: string, redemptionId: string, note: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.close(tx, redemptionId, "PENDING", "REJECTED", adminId, note, `Voucher request rejected: ${note}`);
    });
  }

  /**
   * Takes back a fulfilled discount code that was never used (and is on no
   * payment in progress), returning the points. Free days cannot be taken back.
   */
  async revoke(adminId: string, redemptionId: string, note: string) {
    await this.prisma.$transaction(async (tx) => {
      const redemption = await tx.referralRedemption.findUnique({ where: { id: redemptionId } });
      if (!redemption) throw new NotFoundException("Redemption not found.");
      if (redemption.status !== "FULFILLED") throw new ConflictException(`This redemption is ${redemption.status.toLowerCase()}.`);
      if (!redemption.discountId) throw new ConflictException("Free days already given cannot be taken back. Adjust the access in Payments.");
      const openOrders = await tx.order.count({ where: { discountId: redemption.discountId, status: { in: OPEN_ORDER_STATUSES } } });
      const off =
        openOrders === 0 && (await this.discounts.deactivateUnusedPersonalCode(tx, redemption.discountId, redemption.userId));
      if (!off) throw new ConflictException("The code was already used (or is in a payment in progress), so it cannot be taken back.");
      await this.close(tx, redemption.id, "FULFILLED", "REVOKED", adminId, note, `Voucher code taken back: ${note}`);
    });
  }

  /** A status-filtered claim to a closed state, returning the points. */
  private async close(
    tx: PrismaTransactionClient,
    redemptionId: string,
    from: ReferralRedemptionStatus,
    to: ReferralRedemptionStatus,
    actorId: string,
    adminNote: string | null,
    ledgerNote: string
  ) {
    const { count } = await tx.referralRedemption.updateMany({
      data: { adminNote, reviewedAt: new Date(), reviewedById: actorId, status: to },
      where: { id: redemptionId, status: from }
    });
    if (count === 0) await this.throwState(tx, redemptionId);
    const redemption = await tx.referralRedemption.findUniqueOrThrow({ where: { id: redemptionId } });
    await this.credits.refundRedemption(tx, {
      actorId,
      currency: redemption.currency,
      note: ledgerNote,
      points: redemption.pointsCost,
      redemptionId: redemption.id,
      userId: redemption.userId
    });
  }

  private async throwState(tx: PrismaTransactionClient, redemptionId: string): Promise<never> {
    const redemption = await tx.referralRedemption.findUnique({ select: { status: true }, where: { id: redemptionId } });
    if (!redemption) throw new NotFoundException("Redemption not found.");
    throw new ConflictException(`This redemption is already ${redemption.status.toLowerCase()}.`);
  }

  async getItem(id: string): Promise<ReferralRedemptionItem> {
    return toRedemptionItem(await this.prisma.referralRedemption.findUniqueOrThrow({ include: REDEMPTION_ITEM_INCLUDE, where: { id } }));
  }
}

export function toRedemptionItem(row: RedemptionRow): ReferralRedemptionItem {
  const discount = row.discount;
  return {
    accessEndsAt: row.accessEndsAt?.toISOString() ?? null,
    adminNote: row.adminNote,
    amountOffMinor: row.amountOffMinor,
    codeEndsAt: discount?.endsAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    currency: row.currency,
    discountCode: discount?.code ?? null,
    discountStatus: discount
      ? discount.redemptionCount > 0
        ? "USED"
        : !discount.isActive
          ? "CANCELLED"
          : discount.endsAt && discount.endsAt <= new Date()
            ? "EXPIRED"
            : "ACTIVE"
      : null,
    freeDays: row.freeDays,
    fulfilledAt: row.fulfilledAt?.toISOString() ?? null,
    id: row.id,
    maxDiscountMinor: row.maxDiscountMinor,
    minOrderMinor: row.minOrderMinor,
    percentOff: row.percentOff,
    planName: row.plan?.name ?? null,
    pointsCost: row.pointsCost,
    status: row.status,
    type: row.type,
    userEmail: row.user.email,
    userId: row.userId,
    userName: displayName(row.user),
    voucherId: row.voucherId,
    voucherName: row.voucherName
  };
}
