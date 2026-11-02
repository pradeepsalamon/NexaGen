import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  formatMoney,
  type AdjustReferralCreditsRequest,
  type CancelReferralRewardRequest,
  type CreateReferralPaymentCodeRequest,
  type PayReferralWithdrawalRequest,
  type RejectReferralWithdrawalRequest,
  type RequestReferralWithdrawalRequest
} from "@nexa-chess/types";
import { OrderStatus, type ReferralSettings, type User } from "@prisma/client";
import { DiscountService } from "../payments/discount.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { creditLockKey, displayName, isReferrerRole } from "./referral.util";

/** Orders that may still capture with a code already applied. */
const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.PENDING];

/**
 * The credits wallet: an append-only ledger (`ReferralCreditEntry`) whose sum
 * is the balance. Every debit takes a per-user transaction lock, re-reads the
 * balance and writes the entry in the same transaction, so two withdrawals
 * cannot spend the same credits. Requests are status-filtered claims.
 */
@Injectable()
export class ReferralCreditsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discounts: DiscountService
  ) {}

  async balance(userId: string, client: PrismaTransactionClient | PrismaService = this.prisma): Promise<number> {
    const result = await client.referralCreditEntry.aggregate({ _sum: { amountMinor: true }, where: { userId } });
    return result._sum.amountMinor ?? 0;
  }

  /** Serialises ledger writes for one user until the transaction ends. */
  private async lock(tx: PrismaTransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${creditLockKey(userId)}))`;
  }

  // ── Rewards ──

  /** PENDING → CREDITED plus the ledger credit. False if it was not pending. */
  async creditReward(tx: PrismaTransactionClient, rewardId: string, reviewerId: string | null): Promise<boolean> {
    const now = new Date();
    const { count } = await tx.referralReward.updateMany({
      data: { creditedAt: now, reviewedAt: reviewerId ? now : null, reviewedById: reviewerId, status: "CREDITED" },
      where: { id: rewardId, status: "PENDING" }
    });
    if (count === 0) return false;
    const reward = await tx.referralReward.findUniqueOrThrow({ where: { id: rewardId } });
    await this.lock(tx, reward.referrerId);
    await tx.referralCreditEntry.create({
      data: {
        amountMinor: reward.amountMinor,
        createdById: reviewerId,
        currency: reward.currency,
        note: reward.description,
        rewardId: reward.id,
        type: "REWARD",
        userId: reward.referrerId
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

  /** Cancels a pending reward, or reverses a credited one (balance may go below zero). */
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

      if (reward.status === "CREDITED") {
        await this.lock(tx, reward.referrerId);
        await tx.referralCreditEntry.create({
          data: {
            amountMinor: -reward.amountMinor,
            createdById: adminId,
            currency: reward.currency,
            note: body.reason || "Reward cancelled by an admin.",
            rewardId: reward.id,
            type: "REWARD_REVERSAL",
            userId: reward.referrerId
          }
        });
      }
    });
  }

  private async throwRewardState(tx: PrismaTransactionClient, rewardId: string): Promise<never> {
    const reward = await tx.referralReward.findUnique({ select: { status: true }, where: { id: rewardId } });
    if (!reward) throw new NotFoundException("Reward not found.");
    throw new ConflictException(`This reward is already ${reward.status.toLowerCase()}.`);
  }

  // ── Withdrawals ──

  async requestWithdrawal(user: Pick<User, "id" | "role">, settings: ReferralSettings, body: RequestReferralWithdrawalRequest) {
    if (!settings.enabled || !settings.withdrawalRoles.includes(user.role)) {
      throw new ForbiddenException("Withdrawals are not available for your account.");
    }
    if (body.amountMinor < settings.minWithdrawalMinor) {
      throw new BadRequestException(`The minimum withdrawal is ${formatMoney(settings.minWithdrawalMinor, settings.currency)}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.id);
      const balance = await this.balance(user.id, tx);
      if (body.amountMinor > balance) throw new BadRequestException("That is more than your credit balance.");
      const withdrawal = await tx.referralWithdrawal.create({
        data: {
          amountMinor: body.amountMinor,
          currency: settings.currency,
          payoutDetails: body.payoutDetails,
          userId: user.id
        }
      });
      // Held now, so the same credits cannot be spent twice while it waits.
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: -body.amountMinor,
          createdById: user.id,
          currency: settings.currency,
          note: "Withdrawal requested.",
          type: "WITHDRAWAL",
          userId: user.id,
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

  /** REQUESTED → CANCELLED/REJECTED, returning the held credits. */
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
    await this.lock(tx, withdrawal.userId);
    await tx.referralCreditEntry.create({
      data: {
        amountMinor: withdrawal.amountMinor,
        createdById: actorId,
        currency: withdrawal.currency,
        note,
        type: "WITHDRAWAL_REVERSAL",
        userId: withdrawal.userId,
        withdrawalId: withdrawal.id
      }
    });
  }

  private async throwWithdrawalState(tx: PrismaTransactionClient, withdrawalId: string): Promise<never> {
    const withdrawal = await tx.referralWithdrawal.findUnique({ select: { status: true }, where: { id: withdrawalId } });
    if (!withdrawal) throw new NotFoundException("Withdrawal not found.");
    throw new ConflictException(`This withdrawal is already ${withdrawal.status.toLowerCase()}.`);
  }

  // ── Payment codes ──

  async createPaymentCode(
    user: Pick<User, "id" | "role" | "firstName" | "lastName">,
    settings: ReferralSettings,
    body: CreateReferralPaymentCodeRequest
  ) {
    if (!settings.enabled || !settings.paymentUseRoles.includes(user.role)) {
      throw new ForbiddenException("Paying fees with credits is not available for your account.");
    }
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.id);
      const balance = await this.balance(user.id, tx);
      if (body.amountMinor > balance) throw new BadRequestException("That is more than your credit balance.");
      const discount = await this.discounts.createPersonalCode(tx, {
        amountMinor: body.amountMinor,
        createdById: user.id,
        currency: settings.currency,
        name: `Referral credits — ${displayName(user)}`,
        userId: user.id
      });
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: -body.amountMinor,
          createdById: user.id,
          currency: settings.currency,
          discountId: discount.id,
          note: `Payment code ${discount.code}`,
          type: "PAYMENT_CODE",
          userId: user.id
        }
      });
      return discount;
    });
  }

  async cancelPaymentCode(userId: string, discountId: string) {
    await this.prisma.$transaction(async (tx) => {
      const discount = await tx.discount.findFirst({ where: { id: discountId, restrictedToUserId: userId } });
      const issued = discount
        ? await tx.referralCreditEntry.findFirst({ where: { discountId, type: "PAYMENT_CODE", userId } })
        : null;
      if (!discount || !issued) throw new NotFoundException("Payment code not found.");

      // A checkout already priced with this code could still capture.
      const openOrders = await tx.order.count({ where: { discountId, status: { in: OPEN_ORDER_STATUSES } } });
      if (openOrders > 0) {
        throw new ConflictException("A payment using this code is still in progress. Finish or abandon it first.");
      }
      const deactivated = await this.discounts.deactivateUnusedPersonalCode(tx, discountId, userId);
      if (!deactivated) throw new ConflictException("This code was already used or cancelled.");

      await this.lock(tx, userId);
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: -issued.amountMinor,
          createdById: userId,
          currency: issued.currency,
          discountId,
          note: `Payment code ${discount.code} cancelled.`,
          type: "PAYMENT_CODE_REVERSAL",
          userId
        }
      });
    });
  }

  // ── Admin ──

  async adjust(adminId: string, body: AdjustReferralCreditsRequest, currency: string) {
    const target = await this.prisma.user.findUnique({ select: { id: true, role: true }, where: { id: body.userId } });
    if (!target || !isReferrerRole(target.role)) throw new NotFoundException("Referrer not found.");
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, target.id);
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: body.amountMinor,
          createdById: adminId,
          currency,
          note: body.note,
          type: "ADJUSTMENT",
          userId: target.id
        }
      });
    });
  }
}
