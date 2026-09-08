/**
 * Decides whether a user's `lastActiveAt` should be written on this request.
 * Pure + side-effect free so it can be unit-tested in isolation; the caller owns
 * the `Map` that survives between requests.
 *
 * We only need `lastActiveAt` as a coarse recency signal for engagement
 * analytics, so a write at most once per `windowMs` per user is plenty and keeps
 * the hot path free of a DB write on every request.
 */
export const ACTIVITY_WRITE_WINDOW_MS = 10 * 60 * 1000;

export function shouldWriteLastActive(
  lastWriteAt: number | undefined,
  now: number,
  windowMs: number = ACTIVITY_WRITE_WINDOW_MS
): boolean {
  if (lastWriteAt === undefined) return true;
  return now - lastWriteAt >= windowMs;
}

/**
 * Request paths that never count as user activity — health checks, the engine
 * proxy (polled hard by the analysis board), and webhooks (no end user).
 */
export function isNonActivityPath(path: string): boolean {
  return (
    path === "/health" ||
    path.startsWith("/stockfish") ||
    path.startsWith("/webhooks")
  );
}
