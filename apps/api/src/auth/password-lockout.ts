import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

/** Wrong passwords per account before sign-in locks; per IP limits miss spread-out guessing. */
export const LOGIN_MAX_FAILED_ATTEMPTS = 10;
export const LOGIN_LOCKOUT_MS = 15 * 60_000;

const logger = new Logger("PasswordLockout");

/** The 429 a locked account answers with, at sign-in and at a password confirmation. */
export function lockedOutError(lockedUntil: Date): HttpException {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return new HttpException(
    `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or reset your password.`,
    HttpStatus.TOO_MANY_REQUESTS
  );
}

/** Throws the 429 while the account is locked. */
export function assertNotLockedOut(user: { loginLockedUntil: Date | null }): void {
  if (user.loginLockedUntil && user.loginLockedUntil.getTime() > Date.now()) {
    throw lockedOutError(user.loginLockedUntil);
  }
}

/**
 * Counts a wrong password against the account; the Nth one locks sign-in. Sign-in and every
 * password confirmation (profile changes, account deletion) share the count, so guessing through
 * a stolen session runs into the same limit (review A7).
 */
export async function recordPasswordFailure(prisma: Pick<PrismaService, "user">, userId: string): Promise<void> {
  const { failedLoginAttempts } = await prisma.user.update({
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
    where: { id: userId }
  });
  if (failedLoginAttempts < LOGIN_MAX_FAILED_ATTEMPTS) return;

  await prisma.user.update({
    data: { failedLoginAttempts: 0, loginLockedUntil: new Date(Date.now() + LOGIN_LOCKOUT_MS) },
    where: { id: userId }
  });
  logger.warn(`Sign-in locked for user ${userId} after ${failedLoginAttempts} failed attempts.`);
}

const UNKNOWN_EMAIL_KEYS_MAX = 10_000;

/**
 * The same lockout for an email with no account (review A8): without it, a locked account
 * answers 429 and an unknown email never does, which tells a guesser which emails exist.
 * Kept in memory (one API process), bounded, keyed by academy and email.
 */
export class UnknownEmailLockout {
  private readonly entries = new Map<string, { failures: number; lockedUntil: Date | null }>();

  lockedUntil(key: string, now = Date.now()): Date | null {
    const entry = this.entries.get(key);
    if (!entry?.lockedUntil) return null;
    if (entry.lockedUntil.getTime() > now) return entry.lockedUntil;
    this.entries.delete(key);
    return null;
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.entries.get(key) ?? { failures: 0, lockedUntil: null };
    entry.failures += 1;
    if (entry.failures >= LOGIN_MAX_FAILED_ATTEMPTS) {
      entry.failures = 0;
      entry.lockedUntil = new Date(now + LOGIN_LOCKOUT_MS);
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    if (this.entries.size > UNKNOWN_EMAIL_KEYS_MAX) {
      this.entries.delete(this.entries.keys().next().value as string);
    }
  }
}
