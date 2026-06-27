import { createHash, randomBytes } from "crypto";
import { compare, hash } from "bcryptjs";

const bcryptSaltRounds = 12;

export async function hashSecret(secret: string) {
  return hash(secret, bcryptSaltRounds);
}

export async function verifySecret(secret: string, secretHash: string) {
  return compare(secret, secretHash);
}

export function createOpaqueToken() {
  return randomBytes(48).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseDurationMs(value: string, fallbackMs: number) {
  const match = /^(\d+)(ms|s|m|h|d)?$/.exec(value.trim());

  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "ms";

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return amount * multipliers[unit];
}

export function splitStudentName(studentName: string) {
  const parts = studentName.trim().split(/\s+/);
  const firstName = parts.shift() ?? studentName.trim();
  const lastName = parts.length > 0 ? parts.join(" ") : undefined;

  return { firstName, lastName };
}
