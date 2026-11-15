import { getWebEnv } from "@nexa-chess/config/web";

const env = getWebEnv({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_PLATFORM_SAME_ORIGIN_API: process.env.NEXT_PUBLIC_PLATFORM_SAME_ORIGIN_API,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL
});

/**
 * Nexa's own hosts call `/api` on themselves too (build-time switch, off by
 * default), so their session cookies can be host-only. Local development
 * keeps the API host.
 */
export const PLATFORM_SAME_ORIGIN_API = env.NEXT_PUBLIC_PLATFORM_SAME_ORIGIN_API;

const ABSOLUTE_API_URL = env.NEXT_PUBLIC_API_URL.replace(/\/+$/, "");

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * This deployment's own (Nexa's) web hosts, decided at build time: the site
 * host (and its www twin), and the web host paired with the API host
 * (`api.nexachess.in` -> `nexachess.in`, `api-dev.nexachess.in` ->
 * `dev.nexachess.in`), so a deployment whose `NEXT_PUBLIC_SITE_URL` is left at
 * its localhost default (staging) still knows its own address.
 */
export const PLATFORM_HOSTS: readonly string[] = (() => {
  const hosts = new Set<string>();
  const add = (host: string | null) => {
    if (!host) return;
    const bare = host.replace(/^www\./, "");
    hosts.add(bare);
    hosts.add(`www.${bare}`);
  };
  add(hostOf(env.NEXT_PUBLIC_SITE_URL));
  const apiHost = hostOf(ABSOLUTE_API_URL);
  add(apiHost ? (/^api[.-](.+\..+)$/.exec(apiHost)?.[1] ?? null) : null);
  return [...hosts];
})();

/**
 * Nexa's own addresses (and local development) keep calling the API host
 * directly, exactly as before. Every other host is an academy's own address,
 * which calls the API on itself under `/api` (docs/SAAS_MULTI_TENANCY.md §H
 * "Routing"), so its session cookies stay host-only. `app/layout.tsx`'s
 * pre-paint script applies the same rule from `PLATFORM_HOSTS`.
 */
function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function isPlatformHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (isLocalHost(host)) return true;
  return PLATFORM_HOSTS.length === 0 || PLATFORM_HOSTS.includes(host);
}

/**
 * Whether this page's session lives in the host-only `nexa_h_*` cookies: always
 * on an academy's address, and on Nexa's own (non-local) hosts once
 * `PLATFORM_SAME_ORIGIN_API` is on.
 */
export function usesHostOnlySession(hostname: string): boolean {
  if (!isPlatformHost(hostname)) return true;
  return PLATFORM_SAME_ORIGIN_API && !isLocalHost(hostname.toLowerCase());
}

/** The API's base URL for this page: same-origin `/api` wherever the session is host-only, else absolute. */
export function apiBaseUrl(): string {
  if (typeof window === "undefined") return ABSOLUTE_API_URL;
  return usesHostOnlySession(window.location.hostname) ? "/api" : ABSOLUTE_API_URL;
}

/** An absolute-or-relative URL to an API path, for links (downloads, exports) and raw `fetch`. */
export function apiUrl(path: string): string {
  return `${apiBaseUrl()}${path}`;
}
