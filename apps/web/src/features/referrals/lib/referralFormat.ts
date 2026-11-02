import {
  formatMoney,
  toMinorUnits,
  type ReferralPaymentCodeItem,
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

export const PAYMENT_CODE_VARIANT: Record<ReferralPaymentCodeItem["status"], BadgeVariant> = {
  ACTIVE: "info",
  CANCELLED: "secondary",
  USED: "success"
};

export const PAYMENT_CODE_LABEL: Record<ReferralPaymentCodeItem["status"], string> = {
  ACTIVE: "Ready to use",
  CANCELLED: "Cancelled",
  USED: "Used"
};
