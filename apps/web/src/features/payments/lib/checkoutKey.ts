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
export function checkoutKeyFor(planId: string, discountCode?: string | null): string {
  // The key covers the whole intent, plan *and* code (FE review P2): a buyer
  // who applies or removes a code after closing the gateway gets a new order
  // at the new price, instead of the server replaying the old order and
  // charging its old amount.
  const storageKey = `${STORAGE_PREFIX}${planId}:${discountCode?.trim().toUpperCase() || "-"}`;

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

/** Forgets every key of this plan (any code), e.g. once the purchase completed. */
export function clearCheckoutKey(planId: string): void {
  try {
    const prefix = `${STORAGE_PREFIX}${planId}`;
    for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = window.sessionStorage.key(i);
      if (key && (key === prefix || key.startsWith(`${prefix}:`))) window.sessionStorage.removeItem(key);
    }
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
