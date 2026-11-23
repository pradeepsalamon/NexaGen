import { randomBytes } from "crypto";
import { REFERRAL_CODE_ALPHABET, REFERRER_ROLES, type ReferrerRole } from "@nexa-chess/types";
import type { UserRole } from "@prisma/client";

export function displayName(user: { firstName: string; lastName: string | null }): string {
  return `${user.firstName} ${user.lastName ?? ""}`.trim();
}

export function isReferrerRole(role: UserRole | string): role is ReferrerRole {
  return (REFERRER_ROLES as readonly string[]).includes(role);
}

/**
 * The one role rule for referrals (review R6): the role an account refers as,
 * from its stored role and extra roles, never the session's active role. A
 * student, coach or sales account refers as itself; an admin who also teaches
 * refers as a coach; anyone else can't refer.
 */
export function referralRoleOf(user: { extraRoles?: readonly UserRole[] | null; role: UserRole }): ReferrerRole | null {
  if (isReferrerRole(user.role)) return user.role;
  if (user.extraRoles?.includes("COACH")) return "COACH";
  return null;
}

export function toReferrerRole(role: UserRole): ReferrerRole {
  // Only referrer roles ever own codes; anything else is shown as a student.
  return isReferrerRole(role) ? role : "STUDENT";
}

export function randomReferralSuffix(length: number): string {
  return Array.from(randomBytes(length), (byte) => REFERRAL_CODE_ALPHABET[byte % REFERRAL_CODE_ALPHABET.length]).join("");
}

/** Advisory key for one user's credits ledger (balance check + debit). */
export function creditLockKey(userId: string): string {
  return `referral-credits:${userId}`;
}

/** Advisory key for one voucher's stock (count + redeem). */
export function voucherLockKey(voucherId: string): string {
  return `referral-voucher:${voucherId}`;
}

export const REFERRAL_COOKIE_NAME = "nexa_referral";
