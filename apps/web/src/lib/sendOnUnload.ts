import * as Sentry from "@sentry/nextjs";

/**
 * Browsers cap the bodies of all in-flight `keepalive` requests at 64 KB in
 * total and refuse a request over it. Stay well under that.
 */
const KEEPALIVE_MAX_BYTES = 60_000;

/**
 * A write that should survive the page unloading (axios cannot keepalive).
 * A body too big for keepalive is sent as an ordinary request instead, which
 * may still finish, and reported to Sentry with its size only (FE review L1);
 * before, the browser refused it and the `.catch` hid the lost save.
 */
export function sendOnUnload(url: string, method: "POST" | "PUT", body: unknown, label: string): void {
  const json = JSON.stringify(body);
  const bytes = new Blob([json]).size;
  const keepalive = bytes <= KEEPALIVE_MAX_BYTES;
  if (!keepalive) {
    Sentry.captureMessage(`${label}: unload save too big for keepalive`, {
      extra: { bytes },
      level: "warning"
    });
  }
  void fetch(url, {
    body: json,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    keepalive,
    method
  }).catch(() => undefined);
}
