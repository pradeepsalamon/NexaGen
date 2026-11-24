import { sendAdConsent } from "../api/adConsentApi";
import { readAdConsent, type AdConsent } from "./adConsent";

/**
 * Keeps the server's copy of the banner's answer (`VisitorSession.adConsent`) in step with the
 * cookie (docs/AD_MEASUREMENT.md):
 *
 * - **In order:** every call joins one chain, so a later answer always lands last (an Accept still
 *   in flight can't overwrite a Decline given after it).
 * - **After the visit exists:** on a first visit both the tracking call and this one would start a
 *   visit (each with new cookies); this waits for the page's tracking call (`markVisitTracked`), or
 *   a few seconds on a page without one.
 * - **Until acknowledged:** the answer the server confirmed is kept for this browser session
 *   (`sessionStorage`). A saved answer is sent again for each new session (the server's consent is
 *   per visit) and after a failure, so a Decline that didn't reach the server is retried.
 */
const SYNCED_KEY = "nexa_ad_consent_synced";
const TRACKING_WAIT_MS = 4000;
const RETRY_DELAYS_MS = [2000, 8000];
/** How long a demo form waits for a consent call still on its way. */
const SETTLE_WAIT_MS = 3000;

let markTracked: () => void = () => undefined;
const visitTracked = new Promise<void>((resolve) => {
  markTracked = resolve;
});

/** Called by the page's visit tracking once its first call settled: the visit cookies exist then. */
export function markVisitTracked(): void {
  markTracked();
}

let chain: Promise<void> = Promise.resolve();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function readSynced(): string | null {
  try {
    return window.sessionStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}

function writeSynced(value: AdConsent | null): void {
  try {
    if (value) window.sessionStorage.setItem(SYNCED_KEY, value);
    else window.sessionStorage.removeItem(SYNCED_KEY);
  } catch {
    // Storage blocked: the answer is simply sent again on the next page.
  }
}

async function send(answer: AdConsent): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    // A newer answer replaced this one while it waited: that one is sent instead.
    if (readAdConsent() !== answer) return;
    try {
      await sendAdConsent({ consent: answer === "granted", referrer: document.referrer || undefined, url: window.location.href });
      if (readAdConsent() === answer) writeSynced(answer);
      return;
    } catch {
      if (attempt >= RETRY_DELAYS_MS.length) return;
      await wait(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/**
 * Sends the answer to the server. `force` for a choice just made on the banner; without it, an
 * answer this browser session already confirmed is not sent again.
 */
export function syncAdConsent(answer: AdConsent, force = false): void {
  if (!force && readSynced() === answer) return;
  writeSynced(null);
  const ready = Promise.race([visitTracked, wait(TRACKING_WAIT_MS)]);
  chain = chain
    .then(() => ready)
    .then(() => send(answer))
    .catch(() => undefined);
}

/** Resolves once every queued consent call finished (at most a few seconds): a demo form awaits it first. */
export function adConsentSettled(): Promise<void> {
  return Promise.race([chain, wait(SETTLE_WAIT_MS)]);
}
