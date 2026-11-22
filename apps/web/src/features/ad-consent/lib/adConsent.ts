import { META_PIXEL_ID } from "@/lib/site";

/**
 * The cookie banner's answer (docs/AD_MEASUREMENT.md): a first-party cookie, six months. The server
 * gets the same answer on the visit (`VisitorSession.adConsent`), so its Conversions API events
 * follow it too.
 */
export const AD_CONSENT_COOKIE = "nexa_ad_consent";
const SIX_MONTHS_SECONDS = 182 * 24 * 60 * 60;
/** Fired to reopen the banner (the privacy page's "Cookie choices" button). */
export const AD_CONSENT_REOPEN_EVENT = "nexa:ad-consent-reopen";

export type AdConsent = "granted" | "denied";

export function readAdConsent(): AdConsent | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${AD_CONSENT_COOKIE}=`));
  const value = match?.slice(AD_CONSENT_COOKIE.length + 1);
  return value === "granted" || value === "denied" ? value : null;
}

export function writeAdConsent(value: AdConsent): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AD_CONSENT_COOKIE}=${value}; Max-Age=${SIX_MONTHS_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/** Another academy's own address: never Nexa's pixel or banner. */
export function onAcademyHost(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.host === "academy";
}

/** Whether ad measurement may run in this browser now: a pixel is configured, Nexa's host, and Accepted. */
export function adMeasurementAllowed(): boolean {
  return Boolean(META_PIXEL_ID) && !onAcademyHost() && readAdConsent() === "granted";
}
