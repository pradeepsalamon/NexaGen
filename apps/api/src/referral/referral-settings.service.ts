import { ConflictException, Injectable } from "@nestjs/common";
import {
  canHoldReferralLink,
  referralCodePrefix,
  type ReferralSettingsItem,
  type ReferrerRole,
  type UpdateReferralSettingsRequest
} from "@nexa-chess/types";
import type { ReferralCode, ReferralSettings, User } from "@prisma/client";
import { isUniqueViolation } from "../payments/payments.util";
import { PrismaService } from "../prisma/prisma.service";
import { isReferrerRole, randomReferralSuffix } from "./referral.util";

const SETTINGS_ID = "default";

/** Program switches (singleton row) and the one code each referrer holds. */
@Injectable()
export class ReferralSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<ReferralSettings> {
    return this.prisma.referralSettings.upsert({
      create: { id: SETTINGS_ID },
      update: {},
      where: { id: SETTINGS_ID }
    });
  }

  async getItem(): Promise<ReferralSettingsItem> {
    return this.toItem(await this.get());
  }

  async update(adminId: string, body: UpdateReferralSettingsRequest): Promise<ReferralSettingsItem> {
    await this.get();
    const updated = await this.prisma.referralSettings.update({
      data: {
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.referrerRoles !== undefined ? { referrerRoles: [...new Set(body.referrerRoles)] } : {}),
        ...(body.attributionDays !== undefined ? { attributionDays: body.attributionDays } : {}),
        ...(body.withdrawalRoles !== undefined ? { withdrawalRoles: [...new Set(body.withdrawalRoles)] } : {}),
        ...(body.minWithdrawalMinor !== undefined ? { minWithdrawalMinor: body.minWithdrawalMinor } : {}),
        ...(body.paymentUseRoles !== undefined ? { paymentUseRoles: [...new Set(body.paymentUseRoles)] } : {}),
        ...(body.programTerms !== undefined ? { programTerms: body.programTerms || null } : {}),
        updatedById: adminId
      },
      where: { id: SETTINGS_ID }
    });
    return this.toItem(updated);
  }

  toItem(settings: ReferralSettings): ReferralSettingsItem {
    const roles = (list: readonly string[]) => list.filter(isReferrerRole) as ReferrerRole[];
    return {
      attributionDays: settings.attributionDays,
      currency: settings.currency,
      enabled: settings.enabled,
      minWithdrawalMinor: settings.minWithdrawalMinor,
      paymentUseRoles: roles(settings.paymentUseRoles),
      programTerms: settings.programTerms,
      referrerRoles: roles(settings.referrerRoles),
      withdrawalRoles: roles(settings.withdrawalRoles)
    };
  }

  isEligible(user: Pick<User, "role">, settings: ReferralSettings): boolean {
    return canHoldReferralLink(user.role, { enabled: settings.enabled, referrerRoles: this.toItem(settings).referrerRoles });
  }

  /** The user's code, created on first use (`<NAME><4 random>`). */
  async ensureCode(user: Pick<User, "id" | "firstName">): Promise<ReferralCode> {
    const existing = await this.prisma.referralCode.findUnique({ where: { userId: user.id } });
    if (existing) return existing;

    const prefix = referralCodePrefix(user.firstName);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        return await this.prisma.referralCode.create({
          data: { code: `${prefix}${randomReferralSuffix(attempt < 4 ? 4 : 6)}`, userId: user.id }
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // Either the code collided, or a parallel request created this user's
        // code first — that one wins.
        const raced = await this.prisma.referralCode.findUnique({ where: { userId: user.id } });
        if (raced) return raced;
      }
    }
    throw new ConflictException("Could not create a referral code. Try again.");
  }
}
