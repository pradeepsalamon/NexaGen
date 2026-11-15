// The code from a `/r/<code>` visit, kept in this browser so the demo form can
// send it if the API's attribution cookie is missing (blocked third-party
// cookies, a different device profile). The API prefers its cookie.

const KEY = "nexa-referral-code";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function rememberReferralCode(code: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ code, savedAt: Date.now() }));
  } catch {
    // Storage blocked: the cookie still attributes the booking.
  }
}

export function readReferralCode(): string | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { code?: unknown; savedAt?: unknown };
    if (typeof parsed.code !== "string" || typeof parsed.savedAt !== "number") return undefined;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return undefined;
    return parsed.code;
  } catch {
    return undefined;
  }
}
