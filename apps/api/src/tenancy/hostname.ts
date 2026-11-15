import { domainToASCII } from "node:url";

/**
 * The one hostname form stored in `tenant_domains.hostname` and used for
 * lookups: lowercase, no port, no trailing dot, IDN as punycode. Returns null
 * for anything that isn't a hostname (empty, a path, spaces, bad punycode).
 */
export function normalizeHostname(input: string | null | undefined): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  if (!host) return null;
  if (host.startsWith("[")) {
    // IPv6 literal, optionally with a port: "[::1]:3000".
    const end = host.indexOf("]");
    return end > 1 ? host.slice(0, end + 1) : null;
  }
  const colon = host.indexOf(":");
  if (colon !== -1) {
    if (!/^\d*$/.test(host.slice(colon + 1))) return null;
    host = host.slice(0, colon);
  }
  host = host.replace(/\.+$/, "");
  if (!host || /[\s/\\?#@]/.test(host)) return null;
  const ascii = domainToASCII(host);
  return ascii || null;
}

/** Hostname of an absolute URL (an `Origin` or `Referer` header), or null. */
export function hostnameFromUrl(value: string | null | undefined): string | null {
  if (!value || value === "null") return null;
  try {
    return normalizeHostname(new URL(value).host);
  } catch {
    return null;
  }
}
