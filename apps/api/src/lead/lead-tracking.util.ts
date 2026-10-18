/**
 * Lightweight, dependency-free attribution parsing for the academy tracking
 * endpoint — mirrors what the original marketing site did (no ua-parser-js,
 * just a handful of regexes good enough to bucket "which browser/OS/device").
 */

export interface ParsedVisitAttribution {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  gclid: string | null;
  landingPage: string;
}

export function parseVisitAttribution(rawUrl: string): ParsedVisitAttribution {
  let searchParams = new URLSearchParams();
  let landingPage = rawUrl;

  try {
    const url = new URL(rawUrl, "https://academy.invalid");
    searchParams = url.searchParams;
    landingPage = url.pathname;
  } catch {
    // Malformed `url` from the client — fall back to empty attribution rather
    // than failing the tracking call.
  }

  const get = (key: string) => searchParams.get(key) || null;

  return {
    utmSource: get("utm_source"),
    utmMedium: get("utm_medium"),
    utmCampaign: get("utm_campaign"),
    utmContent: get("utm_content"),
    utmTerm: get("utm_term"),
    fbclid: get("fbclid"),
    gclid: get("gclid"),
    landingPage
  };
}

export interface ParsedUserAgent {
  browser: string;
  os: string;
  deviceType: string;
}

export function parseUserAgent(userAgent: string | undefined): ParsedUserAgent {
  const ua = userAgent ?? "";

  let browser = "Other";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";

  let os = "Other";
  if (/windows/i.test(ua)) os = "Windows";
  else if (/mac os/i.test(ua)) os = "MacOS";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ios/i.test(ua)) os = "iOS";
  else if (/linux/i.test(ua)) os = "Linux";

  const deviceType = /mobile|android|iphone/i.test(ua) ? "Mobile" : "Desktop";

  return { browser, os, deviceType };
}
