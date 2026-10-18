import { createHash, randomBytes, timingSafeEqual } from "crypto";
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

// bcrypt reads only the first 72 bytes, which for a JWT is the header plus a
// sliver of the payload — so refresh tokens are stored as sha256 instead.
export function hashRefreshToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function refreshTokenMatches(token: string, storedHash: string) {
  if (storedHash.startsWith("$2")) {
    return compare(token, storedHash); // sessions issued before the sha256 switch
  }
  const expected = Buffer.from(storedHash, "hex");
  const actual = createHash("sha256").update(token).digest();
  return expected.length === actual.length && timingSafeEqual(expected, actual);
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
