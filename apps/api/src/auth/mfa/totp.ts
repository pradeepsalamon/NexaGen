import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// RFC 6238 TOTP: HMAC-SHA1, 6 digits, 30s steps — what every authenticator app expects.
export const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 160-bit secret, base32 — the size RFC 4226 recommends for SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

export function generateTotp(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

/**
 * Returns the matching time step (current ±`window` steps for clock drift), or
 * null. Callers reject a step at or before the last one used to stop replays.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number = Date.now(),
  window = 1
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(nowMs);
  const given = Buffer.from(code);
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (timingSafeEqual(Buffer.from(generateTotp(secret, step)), given)) return step;
  }
  return null;
}

export function buildOtpauthUrl(secret: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    issuer,
    period: String(TOTP_STEP_SECONDS),
    secret
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
