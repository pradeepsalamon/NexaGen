import { createHmac, timingSafeEqual } from "node:crypto";
import { getApiEnv, type ApiEnv } from "@nexa-chess/config/api";
import { dailyPuzzleLevelSchema, type DailyPuzzleLevel } from "@nexa-chess/types";

/**
 * Signed links to Puzzle of the Day's board picture (docs/PUZZLE_OF_THE_DAY.md
 * step 3). The picture is public (Meta fetches it for the WhatsApp message),
 * so the link is the credential: academy, day, level and puzzle, HMAC-signed
 * with a secret that is never a JWT secret, and expiring a few days after the
 * day, so other days or academies can't be listed by guessing.
 */

/** A link works for the day and this many days after. */
export const DAILY_PUZZLE_PICTURE_DAYS = 3;

export interface DailyPuzzlePictureClaims {
  tenantId: string;
  day: string;
  level: DailyPuzzleLevel;
  puzzleId: string;
}

/** The signing key: its own secret, else one derived from an encryption key. Null = no picture. */
export function dailyPuzzlePictureKey(env: Pick<ApiEnv, "CREDENTIALS_ENCRYPTION_KEY" | "DAILY_PUZZLE_PICTURE_SECRET" | "MFA_ENCRYPTION_KEY"> = getApiEnv()): Buffer | null {
  if (env.DAILY_PUZZLE_PICTURE_SECRET) return Buffer.from(env.DAILY_PUZZLE_PICTURE_SECRET, "utf8");
  const base = env.CREDENTIALS_ENCRYPTION_KEY ?? env.MFA_ENCRYPTION_KEY;
  // Derived, never the encryption key itself.
  return base ? createHmac("sha256", base).update("nexa:daily-puzzle-picture:v1").digest() : null;
}

const sign = (key: Buffer, payload: string) => createHmac("sha256", key).update(payload).digest("base64url");

export function signDailyPuzzlePicture(claims: DailyPuzzlePictureClaims, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify([claims.tenantId, claims.day, claims.level, claims.puzzleId]), "utf8").toString("base64url");
  return `${payload}.${sign(key, payload)}`;
}

/** The claims of a genuine, unexpired link; null for anything else. */
export function readDailyPuzzlePicture(token: string, key: Buffer, now: Date = new Date()): DailyPuzzlePictureClaims | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined || token.length > 600) return null;
  const expected = Buffer.from(sign(key, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 4 || !parsed.every((v) => typeof v === "string")) return null;
    const [tenantId, day, level, puzzleId] = parsed as string[];
    const levelOk = dailyPuzzleLevelSchema.safeParse(level);
    if (!levelOk.success || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const expires = Date.parse(`${day}T00:00:00Z`) + (DAILY_PUZZLE_PICTURE_DAYS + 1) * 86_400_000;
    if (!Number.isFinite(expires) || now.getTime() >= expires) return null;
    return { day, level: levelOk.data, puzzleId, tenantId };
  } catch {
    return null;
  }
}

/** The token at the end of a picture link (`…/daily-puzzle-picture/<token>`); null if none. */
export function pictureTokenFromLink(link: string | null | undefined): string | null {
  const match = link?.match(/\/daily-puzzle-picture\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)(?:\.png)?$/);
  return match ? match[1] : null;
}

/** The web route that draws the picture (apps/web `app/daily-puzzle-picture/[token]`). */
export function dailyPuzzlePicturePath(token: string): string {
  return `/daily-puzzle-picture/${token}.png`;
}
