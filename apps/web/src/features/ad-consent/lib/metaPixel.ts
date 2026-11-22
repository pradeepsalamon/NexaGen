import { META_PIXEL_ID } from "@/lib/site";

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  loaded: boolean;
  push: Fbq;
  queue: unknown[];
  version: string;
};

declare global {
  interface Window {
    _fbq?: Fbq;
    fbq?: Fbq;
  }
}

/** Meta's pixel script; its host is in next.config.mjs's CSP (docs/AD_MEASUREMENT.md). */
const PIXEL_SCRIPT = "https://connect.facebook.net/en_US/fbevents.js";

/**
 * Meta's standard loader, without an inline script: a queue that the downloaded script drains.
 * Only ever called after the visitor accepted (`adMeasurementAllowed`). Idempotent.
 */
export function loadMetaPixel(): boolean {
  if (!META_PIXEL_ID || typeof window === "undefined") return false;
  if (window.fbq) return true;
  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  if (!window._fbq) window._fbq = fbq;
  const script = document.createElement("script");
  script.async = true;
  script.src = PIXEL_SCRIPT;
  document.head.appendChild(script);
  fbq("init", META_PIXEL_ID);
  return true;
}

/** A standard pixel event; `eventId` lets Meta match it to the server's Conversions API event. */
export function trackMetaPixel(event: "Lead" | "PageView", params: Record<string, string> = {}, eventId?: string): void {
  window.fbq?.("track", event, params, ...(eventId ? [{ eventID: eventId }] : []));
}

/** A fresh event id for a pixel event the server will also send. */
export function newMetaEventId(): string {
  return crypto.randomUUID();
}
