import {
  formatMoney,
  toMinorUnits,
  type ReferralRedemptionItem,
  type ReferralRedemptionStatus,
  type ReferralRewardStatus,
  type ReferralWithdrawalStatus
} from "@nexa-chess/types";
import type { ComponentProps } from "react";
import type { Badge } from "@/components/ui/Badge";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

export function money(minor: number, currency: string): string {
  return formatMoney(minor, currency);
}

/** "500" or "499.50" typed in major units → integer minor units, or null if unusable. */
export function parseMajorAmount(input: string, currency: string): number | null {
  const value = Number(input.replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return toMinorUnits(value, currency);
}

export const REWARD_STATUS_VARIANT: Record<ReferralRewardStatus, BadgeVariant> = {
  CANCELLED: "secondary",
  CREDITED: "success",
  PENDING: "warning"
};

export const REWARD_STATUS_LABEL: Record<ReferralRewardStatus, string> = {
  CANCELLED: "Cancelled",
  CREDITED: "Credited",
  PENDING: "Awaiting approval"
};

export const WITHDRAWAL_STATUS_VARIANT: Record<ReferralWithdrawalStatus, BadgeVariant> = {
  CANCELLED: "secondary",
  PAID: "success",
  REJECTED: "destructive",
  REQUESTED: "warning"
};

export const WITHDRAWAL_STATUS_LABEL: Record<ReferralWithdrawalStatus, string> = {
  CANCELLED: "Cancelled",
  PAID: "Paid",
  REJECTED: "Rejected",
  REQUESTED: "Requested"
};

export const REDEMPTION_STATUS_VARIANT: Record<ReferralRedemptionStatus, BadgeVariant> = {
  CANCELLED: "secondary",
  FULFILLED: "success",
  PENDING: "warning",
  REJECTED: "destructive",
  REVOKED: "secondary"
};

export const REDEMPTION_STATUS_LABEL: Record<ReferralRedemptionStatus, string> = {
  CANCELLED: "Cancelled",
  FULFILLED: "Ready",
  PENDING: "Awaiting approval",
  REJECTED: "Rejected",
  REVOKED: "Taken back"
};

/** A voucher code's state, for the code chip. */
export const DISCOUNT_STATUS_LABEL: Record<NonNullable<ReferralRedemptionItem["discountStatus"]>, string> = {
  ACTIVE: "Use at checkout",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  USED: "Used"
};

/** "120" → 120, or null if not a whole number above zero. */
export function parseWhole(input: string): number | null {
  const value = Number(input.replace(/,/g, "").trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}
