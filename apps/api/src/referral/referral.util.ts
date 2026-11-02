import { randomBytes } from "crypto";
import { REFERRAL_CODE_ALPHABET, REFERRER_ROLES, type ReferrerRole } from "@nexa-chess/types";
import type { UserRole } from "@prisma/client";

export function displayName(user: { firstName: string; lastName: string | null }): string {
  return `${user.firstName} ${user.lastName ?? ""}`.trim();
}

export function isReferrerRole(role: UserRole | string): role is ReferrerRole {
  return (REFERRER_ROLES as readonly string[]).includes(role);
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

export const REFERRAL_COOKIE_NAME = "nexa_referral";
