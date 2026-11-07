import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  formatMoney,
  type AdjustReferralCreditsRequest,
  type CancelReferralRewardRequest,
  type PayReferralWithdrawalRequest,
  type RejectReferralWithdrawalRequest,
  type RequestReferralWithdrawalRequest
} from "@nexa-chess/types";
import { OrderStatus, type ReferralSettings, type ReferralWallet, type User, UserRole } from "@prisma/client";
import { DiscountService } from "../payments/discount.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { creditLockKey, displayName, isReferrerRole, voucherLockKey } from "./referral.util";

/** Orders that may still capture with a code already applied. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.PENDING];

const DAY_MS = 24 * 60 * 60 * 1000;

export type WalletBalances = { cash: number; points: number };

/**
 * The wallets: one append-only ledger (`ReferralCreditEntry`) with a `wallet`
 * column — CASH (coaches and SALES: money, withdrawn) and POINTS (students and
 * new members: spent on vouchers). A wallet's balance is the sum of its
 * entries. Every debit takes the user's transaction lock, re-reads the
 * balance and writes the entry in the same transaction, so two requests can
 * never spend the same money or points. Nothing moves between users, and
 * points never become money.
 */
@Injectable()
export class ReferralCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discounts: DiscountService
  ) {}

  async balance(
    userId: string,
    wallet: ReferralWallet = "CASH",
    client: PrismaTransactionClient | PrismaService = this.prisma
  ): Promise<number> {
    const result = await client.referralCreditEntry.aggregate({ _sum: { amountMinor: true }, where: { userId, wallet } });
    return result._sum.amountMinor ?? 0;
  }

  async balances(userId: string, client: PrismaTransactionClient | PrismaService = this.prisma): Promise<WalletBalances> {
    const groups = await client.referralCreditEntry.groupBy({ _sum: { amountMinor: true }, by: ["wallet"], where: { userId } });
    const of = (wallet: ReferralWallet) => groups.find((group) => group.wallet === wallet)?._sum.amountMinor ?? 0;
    return { cash: of("CASH"), points: of("POINTS") };
  }

  /** Serialises ledger writes for one user until the transaction ends. */
  async lockUser(tx: PrismaTransactionClient, userId: string) {
    await this.lock(tx, creditLockKey(userId));
  }

  /** Serialises redemptions of one voucher (stock) until the transaction ends. */
  async lockVoucher(tx: PrismaTransactionClient, voucherId: string) {
    await this.lock(tx, voucherLockKey(voucherId));
  }

  private async lock(tx: PrismaTransactionClient, key: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  // ── Rewards ──

  /**
   * PENDING → CREDITED, then pays it: a ledger credit in the reward's wallet,
   * or (DISCOUNT_PERCENT) a personal one-use code. False if it was not pending.
   */
  async creditReward(tx: PrismaTransactionClient, rewardId: string, reviewerId: string | null): Promise<boolean> {
    const now = new Date();
    const { count } = await tx.referralReward.updateMany({
      data: { creditedAt: now, reviewedAt: reviewerId ? now : null, reviewedById: reviewerId, status: "CREDITED" },
      where: { id: rewardId, status: "PENDING" }
    });
    if (count === 0) return false;
    const reward = await tx.referralReward.findUniqueOrThrow({
      include: {
        referrer: { select: { firstName: true, lastName: true } },
        rule: { select: { discountValidDays: true, maxDiscountMinor: true, name: true } }
      },
      where: { id: rewardId }
    });

    if (reward.unit === "DISCOUNT_PERCENT") {
      // Only a reward issued before the rebuild can still be a discount.
      const validDays = reward.rule?.discountValidDays ?? null;
      const discount = await this.discounts.createPersonalPercentCode(tx, {
        createdById: reviewerId,
        endsAt: validDays ? new Date(now.getTime() + validDays * DAY_MS) : null,
        maxDiscountMinor: reward.rule?.maxDiscountMinor ?? null,
        name: `${reward.rule?.name ?? "Welcome discount"} — ${displayName(reward.referrer)}`,
        percent: reward.amountMinor,
        userId: reward.referrerId
      });
      await tx.referralReward.update({ data: { discountId: discount.id }, where: { id: reward.id } });
      return true;
    }

    await this.lockUser(tx, reward.referrerId);
    await tx.referralCreditEntry.create({
      data: {
        amountMinor: reward.amountMinor,
        createdById: reviewerId,
        currency: reward.currency,
        note: reward.description,
        rewardId: reward.id,
        type: "REWARD",
        userId: reward.referrerId,
        wallet: reward.unit === "POINTS" ? "POINTS" : "CASH"
      }
    });
    return true;
  }

  async approveReward(adminId: string, rewardId: string) {
    await this.prisma.$transaction(async (tx) => {
      const credited = await this.creditReward(tx, rewardId, adminId);
      if (!credited) await this.throwRewardState(tx, rewardId);
    });
  }

  /**
   * Cancels a pending reward, or reverses a credited one (the balance may go
   * below zero). A discount reward's code is switched off — unless it was
   * already used at checkout, which cannot be undone.
   */
  async cancelReward(adminId: string, rewardId: string, body: CancelReferralRewardRequest) {
    await this.prisma.$transaction(async (tx) => {
      const reward = await tx.referralReward.findUnique({ where: { id: rewardId } });
      if (!reward) throw new NotFoundException("Reward not found.");
      if (reward.status === "CANCELLED") throw new ConflictException("This reward is already cancelled.");

      const { count } = await tx.referralReward.updateMany({
        data: { reviewedAt: new Date(), reviewedById: adminId, status: "CANCELLED" },
        where: { id: rewardId, status: reward.status }
      });
      if (count === 0) throw new ConflictException("This reward just changed. Refresh and try again.");
      if (reward.status !== "CREDITED") return;

      if (reward.unit === "DISCOUNT_PERCENT") {
        if (!reward.discountId) return;
        const openOrders = await tx.order.count({
          where: { discountId: reward.discountId, status: { in: OPEN_ORDER_STATUSES } }
        });
        const deactivated =
          openOrders === 0 && (await this.discounts.deactivateUnusedPersonalCode(tx, reward.discountId, reward.referrerId));
        if (!deactivated) {
          throw new ConflictException("The discount code was already used (or is in a payment in progress), so it cannot be cancelled.");
        }
        return;
      }

      await this.lockUser(tx, reward.referrerId);
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: -reward.amountMinor,
          createdById: adminId,
          currency: reward.currency,
          note: body.reason || "Reward cancelled by an admin.",
          rewardId: reward.id,
          type: "REWARD_REVERSAL",
          userId: reward.referrerId,
          wallet: reward.unit === "POINTS" ? "POINTS" : "CASH"
        }
      });
    });
  }

  private async throwRewardState(tx: PrismaTransactionClient, rewardId: string): Promise<never> {
    const reward = await tx.referralReward.findUnique({ select: { status: true }, where: { id: rewardId } });
    if (!reward) throw new NotFoundException("Reward not found.");
    throw new ConflictException(`This reward is already ${reward.status.toLowerCase()}.`);
  }

  // ── Withdrawals (money only) ──

  async requestWithdrawal(user: Pick<User, "id" | "role">, settings: ReferralSettings, body: RequestReferralWithdrawalRequest) {
    // Students earn points, never money to withdraw (docs/REFERRALS.md).
    if (!settings.enabled || user.role === UserRole.STUDENT || !settings.withdrawalRoles.includes(user.role)) {
      throw new ForbiddenException("Withdrawals are not available for your account.");
    }
    if (body.amountMinor < settings.minWithdrawalMinor) {
      throw new BadRequestException(`The minimum withdrawal is ${formatMoney(settings.minWithdrawalMinor, settings.currency)}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const balance = await this.balance(user.id, "CASH", tx);
      if (body.amountMinor > balance) throw new BadRequestException("That is more than your money balance.");
      const withdrawal = await tx.referralWithdrawal.create({
        data: {
          amountMinor: body.amountMinor,
          currency: settings.currency,
          payoutDetails: body.payoutDetails,
          userId: user.id
        }
      });
      // Held now, so the same money cannot be spent twice while it waits.
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: -body.amountMinor,
          createdById: user.id,
          currency: settings.currency,
          note: "Withdrawal requested.",
          type: "WITHDRAWAL",
          userId: user.id,
          wallet: "CASH",
          withdrawalId: withdrawal.id
        }
      });
      return withdrawal;
    });
  }

  async cancelWithdrawal(userId: string, withdrawalId: string) {
    await this.prisma.$transaction(async (tx) => {
      // Someone else's withdrawal is "not found", never "forbidden".
      const withdrawal = await tx.referralWithdrawal.findFirst({ where: { id: withdrawalId, userId } });
      if (!withdrawal) throw new NotFoundException("Withdrawal not found.");
      await this.closeWithdrawal(tx, withdrawal.id, { status: "CANCELLED" }, userId, "Withdrawal cancelled.");
    });
  }

  async payWithdrawal(adminId: string, withdrawalId: string, body: PayReferralWithdrawalRequest) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.referralWithdrawal.updateMany({
        data: {
          adminNote: body.adminNote ?? null,
          payoutReference: body.payoutReference,
          reviewedAt: new Date(),
          reviewedById: adminId,
          status: "PAID"
        },
        where: { id: withdrawalId, status: "REQUESTED" }
      });
      if (count === 0) await this.throwWithdrawalState(tx, withdrawalId);
    });
  }

  async rejectWithdrawal(adminId: string, withdrawalId: string, body: RejectReferralWithdrawalRequest) {
    await this.prisma.$transaction(async (tx) => {
      await this.closeWithdrawal(
        tx,
        withdrawalId,
        { adminNote: body.adminNote, reviewedAt: new Date(), reviewedById: adminId, status: "REJECTED" },
        adminId,
        `Withdrawal rejected: ${body.adminNote}`
      );
    });
  }

  /** REQUESTED → CANCELLED/REJECTED, returning the held money. */
  private async closeWithdrawal(
    tx: PrismaTransactionClient,
    withdrawalId: string,
    data: { status: "CANCELLED" | "REJECTED"; adminNote?: string; reviewedAt?: Date; reviewedById?: string },
    actorId: string,
    note: string
  ) {
    const { count } = await tx.referralWithdrawal.updateMany({ data, where: { id: withdrawalId, status: "REQUESTED" } });
    if (count === 0) await this.throwWithdrawalState(tx, withdrawalId);
    const withdrawal = await tx.referralWithdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    await this.lockUser(tx, withdrawal.userId);
    await tx.referralCreditEntry.create({
      data: {
        amountMinor: withdrawal.amountMinor,
        createdById: actorId,
        currency: withdrawal.currency,
        note,
        type: "WITHDRAWAL_REVERSAL",
        userId: withdrawal.userId,
        wallet: "CASH",
        withdrawalId: withdrawal.id
      }
    });
  }

  private async throwWithdrawalState(tx: PrismaTransactionClient, withdrawalId: string): Promise<never> {
    const withdrawal = await tx.referralWithdrawal.findUnique({ select: { status: true }, where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException("Withdrawal not found.");
    throw new ConflictException(`This withdrawal is already ${withdrawal.status.toLowerCase()}.`);
  }

  // ── Voucher redemptions (points) ──

  /** Holds/spends the points a redemption costs. Caller holds the user's lock. */
  async debitRedemption(
    tx: PrismaTransactionClient,
    input: { userId: string; redemptionId: string; points: number; currency: string; note: string }
  ) {
    await tx.referralCreditEntry.create({
      data: {
        amountMinor: -input.points,
        createdById: input.userId,
        currency: input.currency,
        note: input.note,
        redemptionId: input.redemptionId,
        type: "REDEMPTION",
        userId: input.userId,
        wallet: "POINTS"
      }
    });
  }

  /** Returns a redemption's points (rejected, cancelled or revoked). */
  async refundRedemption(
    tx: PrismaTransactionClient,
    input: { userId: string; redemptionId: string; points: number; currency: string; note: string; actorId: string }
  ) {
    await this.lockUser(tx, input.userId);
    await tx.referralCreditEntry.create({
      data: {
        amountMinor: input.points,
        createdById: input.actorId,
        currency: input.currency,
        note: input.note,
        redemptionId: input.redemptionId,
        type: "REDEMPTION_REVERSAL",
        userId: input.userId,
        wallet: "POINTS"
      }
    });
  }

  // ── Admin ──

  async adjust(adminId: string, body: AdjustReferralCreditsRequest, currency: string) {
    const target = await this.prisma.user.findUnique({ select: { id: true, role: true }, where: { id: body.userId } });
    if (!target || !isReferrerRole(target.role)) throw new NotFoundException("Referrer not found.");
    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, target.id);
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: body.amountMinor,
          createdById: adminId,
          currency,
          note: body.note,
          type: "ADJUSTMENT",
          userId: target.id,
          wallet: body.wallet
        }
      });
    });
  }
}
