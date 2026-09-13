const STORAGE_PREFIX = "nexa-checkout-key:";

/**
 * A stable idempotency key for one checkout intent (§11).
 *
 * The key is what makes a double click, a refresh, a browser back/forward and a
 * second tab collapse into ONE order: the server's unique index on
 * `orders.idempotencyKey` rejects the duplicate and replays the original.
 *
 * It lives in sessionStorage so it survives a refresh but not a new session,
 * and it is cleared once the purchase completes so a later renewal of the same
 * plan can legitimately open a new order.
 *
 * sessionStorage can throw or come back empty (private mode, blocked site
 * data), so every access is guarded and the fallback is a fresh per-call key —
 * which loses replay protection for that one tab but never blocks a purchase.
 */
export function checkoutKeyFor(planId: string): string {
  const storageKey = `${STORAGE_PREFIX}${planId}`;

  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;

    const created = generateKey(planId);
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return generateKey(planId);
  }
}

export function clearCheckoutKey(planId: string): void {
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${planId}`);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

function generateKey(planId: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  return `co_${planId.slice(0, 12)}_${random}`.slice(0, 120);
}
