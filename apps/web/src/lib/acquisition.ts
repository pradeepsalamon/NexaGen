import type { AcquisitionCapture } from "@nexa-chess/types";

const STORAGE_KEY = "nexa-acq";

type StoredAcquisition = AcquisitionCapture & { firstSeenAt?: string };

/**
 * Maps an inbound referrer host / utm_source to one of our normalized
 * acquisition slugs. Deliberately conservative — anything unrecognised stays
 * unset so the register form can still ask the user directly.
 */
function inferSource(
  utmSource: string | null,
  referrer: string | null
): AcquisitionCapture["acquisitionSource"] | undefined {
  const haystack = `${utmSource ?? ""} ${referrer ?? ""}`.toLowerCase();
  if (!haystack.trim()) return undefined;
  if (/google|\bgoog\b|adwords/.test(haystack)) return "google";
  if (/instagram|\big\b/.test(haystack)) return "instagram";
  if (/facebook|fb\.com|\bfb\b|meta/.test(haystack)) return "facebook";
  if (/youtube|youtu\.be/.test(haystack)) return "youtube";
  if (/whatsapp|wa\.me/.test(haystack)) return "whatsapp";
  return undefined;
}

function readStored(): StoredAcquisition | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAcquisition) : null;
  } catch {
    return null;
  }
}

/**
 * First-touch capture: on the first page load that carries UTM params or an
 * external referrer, persist the attribution to localStorage. Subsequent loads
 * never overwrite it. Safe to call on every mount.
 */
export function captureAcquisitionFromUrl(): void {
  if (typeof window === "undefined") return;
  if (readStored()) return;

  let params: URLSearchParams;
  try {
    params = new URL(window.location.href).searchParams;
  } catch {
    return;
  }

  const utmSource = params.get("utm_source");
  const referrer =
    document.referrer && !document.referrer.startsWith(window.location.origin)
      ? document.referrer
      : null;

  const hasSignal =
    utmSource ||
    params.get("utm_medium") ||
    params.get("utm_campaign") ||
    params.get("ref") ||
    referrer;
  if (!hasSignal) return;

  const payload: StoredAcquisition = {
    firstSeenAt: new Date().toISOString(),
    acquisitionSource: inferSource(utmSource, referrer),
    utmSource: utmSource ?? undefined,
    utmMedium: params.get("utm_medium") ?? undefined,
    utmCampaign: params.get("utm_campaign") ?? undefined,
    utmContent: params.get("utm_content") ?? undefined,
    utmTerm: params.get("utm_term") ?? undefined,
    landingReferrer: referrer ?? undefined
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // storage unavailable — acquisition simply falls back to the form answer
  }
}

/** The stored first-touch attribution, for merging into a register payload. */
export function getStoredAcquisition(): AcquisitionCapture {
  const stored = readStored();
  if (!stored) return {};
  const { firstSeenAt: _firstSeenAt, ...rest } = stored;
  return rest;
}
