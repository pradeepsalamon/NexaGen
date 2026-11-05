import { getWebEnv } from "@nexa-chess/config/web";

const env = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
});

const ABSOLUTE_API_URL = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const siteHost = hostOf(env.NEXT_PUBLIC_SITE_URL);

/**
 * This deployment's own (Nexa's) addresses: they keep calling the API host
 * directly, exactly as before. Every other host is an academy's own address,
 * which calls the API on itself under `/api` (docs/SAAS_MULTI_TENANCY.md §H
 * "Routing"), so its session cookies stay host-only.
 */
export function isPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (!siteHost) return true;
  return host === siteHost || host === `www.${siteHost}` || `www.${host}` === siteHost;
}

/** The API's base URL for this page: absolute on Nexa's hosts, same-origin `/api` elsewhere. */
export function apiBaseUrl(): string {
  if (typeof window === "undefined") return ABSOLUTE_API_URL;
  return isPlatformHost(window.location.hostname) ? ABSOLUTE_API_URL : "/api";
}

/** An absolute-or-relative URL to an API path, for links (downloads, exports) and raw `fetch`. */
export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path}`;
}
