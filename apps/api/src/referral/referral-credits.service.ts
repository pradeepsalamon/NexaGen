import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  formatMoney,
  formatReferralPoints,
  referralPointsValueMinor,
  type AdjustReferralCreditsRequest,
  type CancelReferralRewardRequest,
  type ConvertReferralPointsRequest,
  type CreateReferralPaymentCodeRequest,
  type PayReferralWithdrawalRequest,
  type RejectReferralWithdrawalRequest,
  type RequestReferralWithdrawalRequest,
  type TransferReferralPointsRequest
} from "@nexa-chess/types";
import { OrderStatus, type ReferralSettings, type ReferralWallet, type User, UserStatus } from "@prisma/client";
import { DiscountService } from "../payments/discount.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { creditLockKey, displayName, isReferrerRole } from "./referral.util";

/** Orders that may still capture with a code already applied. */
const OPEN_ORDER_STATUSES: OrderStatus[] = [OrderStatus.CREATED, OrderStatus.PENDING];

const DAY_MS = 24 * 60 * 60 * 1000;

export type WalletBalances = { cash: number; points: number };

/**
 * The wallets: one append-only ledger (`ReferralCreditEntry`) with a `wallet`
 * column — CASH (money) and POINTS. A wallet's balance is the sum of its
 * entries. Every debit takes the user's transaction lock, re-reads the
 * balance and writes the entry in the same transaction, so two requests can
 * never spend the same money or points. Money never moves between users;
 * points do (transfers), and points become money one way only (conversion).
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

  /** Points this user sent in the last 24 hours (the daily transfer limit). */
  async pointsSentLast24h(userId: string, client: PrismaTransactionClient | PrismaService = this.prisma): Promise<number> {
    const result = await client.referralPointsTransfer.aggregate({
      _sum: { points: true },
      where: { createdAt: { gte: new Date(Date.now() - DAY_MS) }, fromUserId: userId }
    });
    return result._sum.points ?? 0;
  }

  /** Serialises ledger writes for one user until the transaction ends. */
  private async lock(tx: PrismaTransactionClient, userId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${creditLockKey(userId)}))`;
  }

  /** Two users in a fixed order, so A→B and B→A transfers never deadlock. */
  private async lockPair(tx: PrismaTransactionClient, a: string, b: string) {
    for (const id of [a, b].sort()) await this.lock(tx, id);
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
      const discount = await this.discounts.createPersonalPercentCode(tx, {
        createdById: reviewerId,
        endsAt: reward.rule.discountValidDays ? new Date(now.getTime() + reward.rule.discountValidDays * DAY_MS) : null,
        maxDiscountMinor: reward.rule.maxDiscountMinor,
        name: `${reward.rule.name} — ${displayName(reward.referrer)}`,
        percent: reward.amountMinor,
        userId: reward.referrerId
      });
      await tx.referralReward.update({ data: { discountId: discount.id }, where: { id: reward.id } });
      return true;
    }

    await this.lock(tx, reward.referrerId);
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

      await this.lock(tx, reward.referrerId);
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
    if (!settings.enabled || !settings.withdrawalRoles.includes(user.role)) {
      throw new ForbiddenException("Withdrawals are not available for your account.");
    }
    if (body.amountMinor < settings.minWithdrawalMinor) {
      throw new BadRequestException(`The minimum withdrawal is ${formatMoney(settings.minWithdrawalMinor, settings.currency)}.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.id);
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
    await this.lock(tx, withdrawal.userId);
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

  // ── Payment codes (money or points → fees) ──

  async createPaymentCode(
    user: Pick<User, "id" | "role" | "firstName" | "lastName">,
    settings: ReferralSettings,
    body: CreateReferralPaymentCodeRequest
  ) {
    if (!settings.enabled || !settings.paymentUseRoles.includes(user.role)) {
      throw new ForbiddenException("Paying fees from your wallet is not available for your account.");
    }
    const wallet: ReferralWallet = body.wallet;
    if (wallet === "POINTS" && !settings.pointsPaymentEnabled) {
      throw new ForbiddenException("Paying fees with points is switched off.");
    }
    const valueMinor = wallet === "POINTS" ? referralPointsValueMinor(body.amount, settings) : body.amount;
    if (valueMinor < 1) throw new BadRequestException("That many points is not worth anything yet. Use more points.");

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.id);
      const balance = await this.balance(user.id, wallet, tx);
      if (body.amount > balance) {
        throw new BadRequestException(wallet === "POINTS" ? "That is more than your points." : "That is more than your money balance.");
      }
      const discount = await this.discounts.createPersonalCode(tx, {
        amountMinor: valueMinor,
        createdById: user.id,
        currency: settings.currency,
        name: `Referral ${wallet === "POINTS" ? "points" : "credits"} — ${displayName(user)}`,
        userId: user.id
      });
      await tx.referralCreditEntry.create({
        data: {
          amountMinor: -body.amount,
          createdById: user.id,
          currency: settings.currency,
          discountId: discount.id,
          note: `Payment code ${discount.code}`,
          type: "PAYMENT_CODE",
          userId: user.id,
          wallet
        }
      });
      return discount;
    });
  }

  /** Switches off an unused code and returns what it cost to the wallet that paid. */
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
          userId,
          wallet: issued.wallet
        }
      });
    });
  }

  // ── Points ──

  /**
   * Sends points to another account (by email). Points only: money is never
   * transferable. Both sides must be in `pointsTransferRoles`; the sender's
   * rolling-24-hour total is capped by `maxTransferPointsPerDay`.
   */
  async transferPoints(
    sender: Pick<User, "id" | "role" | "email" | "firstName" | "lastName">,
    settings: ReferralSettings,
    body: TransferReferralPointsRequest
  ) {
    if (!settings.enabled || !settings.pointsTransferEnabled || !settings.pointsTransferRoles.includes(sender.role)) {
      throw new ForbiddenException("Sending points is not available for your account.");
    }
    if (body.points < settings.minTransferPoints) {
      throw new BadRequestException(`Send at least ${formatReferralPoints(settings.minTransferPoints)}.`);
    }
    if (body.email === sender.email.toLowerCase()) throw new BadRequestException("You cannot send points to yourself.");

    const recipient = await this.prisma.user.findFirst({
      select: { firstName: true, id: true, lastName: true, role: true },
      where: { email: { equals: body.email, mode: "insensitive" }, status: UserStatus.ACTIVE }
    });
    if (!recipient || !settings.pointsTransferRoles.includes(recipient.role)) {
      throw new NotFoundException("No account with that email can receive points.");
    }

    return this.prisma.$transaction(async (tx) => {
      await this.lockPair(tx, sender.id, recipient.id);
      const balance = await this.balance(sender.id, "POINTS", tx);
      if (body.points > balance) throw new BadRequestException("That is more than your points.");
      if (settings.maxTransferPointsPerDay > 0) {
        const sent = await this.pointsSentLast24h(sender.id, tx);
        if (sent + body.points > settings.maxTransferPointsPerDay) {
          const left = Math.max(0, settings.maxTransferPointsPerDay - sent);
          throw new BadRequestException(`You can send ${formatReferralPoints(left)} more in the next 24 hours.`);
        }
      }

      const note = body.note || null;
      const transfer = await tx.referralPointsTransfer.create({
        data: { fromUserId: sender.id, note, points: body.points, toUserId: recipient.id }
      });
      await tx.referralCreditEntry.createMany({
        data: [
          {
            amountMinor: -body.points,
            createdById: sender.id,
            currency: settings.currency,
            note: note ?? `Sent to ${displayName(recipient)}`,
            transferId: transfer.id,
            type: "POINTS_TRANSFER_OUT",
            userId: sender.id,
            wallet: "POINTS"
          },
          {
            amountMinor: body.points,
            createdById: sender.id,
            currency: settings.currency,
            note: note ?? `From ${displayName(sender)}`,
            transferId: transfer.id,
            type: "POINTS_TRANSFER_IN",
            userId: recipient.id,
            wallet: "POINTS"
          }
        ]
      });
      return { points: body.points, pointsBalance: balance - body.points, recipientName: displayName(recipient) };
    });
  }

  /**
   * Points → money at the rate in force (snapshotted on the conversion row),
   * rounded down to a whole minor unit. One way: nothing turns money into points.
   */
  async convertPoints(user: Pick<User, "id" | "role">, settings: ReferralSettings, body: ConvertReferralPointsRequest) {
    if (!settings.enabled || !settings.pointsConversionEnabled || !settings.pointsConversionRoles.includes(user.role)) {
      throw new ForbiddenException("Converting points is not available for your account.");
    }
    if (body.points < settings.minConversionPoints) {
      throw new BadRequestException(`Convert at least ${formatReferralPoints(settings.minConversionPoints)}.`);
    }
    const amountMinor = referralPointsValueMinor(body.points, settings);
    if (amountMinor < 1) throw new BadRequestException("That many points is not worth anything yet. Convert more.");

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.id);
      const balance = await this.balance(user.id, "POINTS", tx);
      if (body.points > balance) throw new BadRequestException("That is more than your points.");
      const conversion = await tx.referralPointsConversion.create({
        data: {
          amountMinor,
          currency: settings.currency,
          points: body.points,
          ratePoints: settings.conversionPoints,
          rateValueMinor: settings.conversionValueMinor,
          userId: user.id
        }
      });
      const note = `${formatReferralPoints(body.points)} → ${formatMoney(amountMinor, settings.currency)}`;
      await tx.referralCreditEntry.createMany({
        data: [
          {
            amountMinor: -body.points,
            conversionId: conversion.id,
            createdById: user.id,
            currency: settings.currency,
            note,
            type: "CONVERSION_OUT",
            userId: user.id,
            wallet: "POINTS"
          },
          {
            amountMinor,
            conversionId: conversion.id,
            createdById: user.id,
            currency: settings.currency,
            note,
            type: "CONVERSION_IN",
            userId: user.id,
            wallet: "CASH"
          }
        ]
      });
      return { amountMinor, currency: settings.currency, points: body.points };
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
          userId: target.id,
          wallet: body.wallet
        }
      });
    });
  }
}
