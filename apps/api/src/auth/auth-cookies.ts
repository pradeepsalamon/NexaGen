import type { CookieOptions, NextFunction, Request, Response } from "express";
import { getApiEnv, getCookieBaseOptions } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { getTenantContext, type TenantContextStore } from "../tenancy/tenant-context";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_PATHS } from "./types";

export type SessionCookieTokens = {
  accessToken: string;
  accessTokenMaxAge: number;
  refreshToken: string;
  refreshTokenMaxAge: number;
};

/**
 * On another academy's own address the session cookies are host-only and
 * named apart (docs/SAAS_MULTI_TENANCY.md §E "Sessions and cookies"): Nexa's
 * domain-wide `.nexachess.in` cookies also reach `<slug>.nexachess.in`, and
 * must never be overwritten or cleared there. Nexa's own hosts are unchanged.
 */
export const HOST_ONLY_COOKIE_NAMES = {
  accessToken: "nexa_h_access_token",
  refreshToken: "nexa_h_refresh_token"
} as const;

/** Another academy's own address: host-only cookies, and Nexa's domain-wide ones are never used. */
function isAcademyHost(store: TenantContextStore | undefined): boolean {
  return Boolean(store?.tenantId && store.tenantId !== DEFAULT_TENANT_ID && store.source === "host");
}

/**
 * Nexa's own hosts with `PLATFORM_HOST_ONLY_COOKIES` on (the web build calls
 * `/api` on itself): host-only cookies too, while an old domain-wide cookie is
 * still read and swapped out at the next sign-in or refresh.
 */
function isPlatformHostOnly(store: TenantContextStore | undefined): boolean {
  return store?.tenantId === DEFAULT_TENANT_ID && getApiEnv().PLATFORM_HOST_ONLY_COOKIES;
}

export function usesHostOnlyCookies(store: TenantContextStore | undefined = getTenantContext()): boolean {
  return isAcademyHost(store) || isPlatformHostOnly(store);
}

function clearCookiePair(response: Response, names: { accessToken: string; refreshToken: string }, base: CookieOptions) {
  response.clearCookie(names.accessToken, { ...base, path: AUTH_COOKIE_PATHS.accessToken });
  response.clearCookie(names.refreshToken, { ...base, path: AUTH_COOKIE_PATHS.refreshToken });
}

export function setAuthCookies(response: Response, tokens: SessionCookieTokens) {
  const store = getTenantContext();
  const hostOnly = usesHostOnlyCookies(store);
  const domainBase = getCookieBaseOptions(getApiEnv());
  const { domain: _domain, ...hostBase } = domainBase;
  const base = hostOnly ? hostBase : domainBase;
  const names = hostOnly ? HOST_ONLY_COOKIE_NAMES : AUTH_COOKIE_NAMES;

  response.cookie(names.accessToken, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: tokens.accessTokenMaxAge,
    path: AUTH_COOKIE_PATHS.accessToken
  });
  response.cookie(names.refreshToken, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: tokens.refreshTokenMaxAge,
    path: AUTH_COOKIE_PATHS.refreshToken
  });
  // The swap: Nexa's old domain-wide pair goes once the host-only one is set.
  if (isPlatformHostOnly(store)) clearCookiePair(response, AUTH_COOKIE_NAMES, domainBase);
}

export function clearAuthCookies(response: Response) {
  const store = getTenantContext();
  const hostOnly = usesHostOnlyCookies(store);
  const domainBase = getCookieBaseOptions(getApiEnv());
  const { domain: _domain, ...hostBase } = domainBase;
  clearCookiePair(response, hostOnly ? HOST_ONLY_COOKIE_NAMES : AUTH_COOKIE_NAMES, hostOnly ? hostBase : domainBase);
  if (isPlatformHostOnly(store)) clearCookiePair(response, AUTH_COOKIE_NAMES, domainBase);
}

/**
 * After `cookie-parser`: wherever the session is host-only, those cookies are
 * read under the usual names, so every controller's
 * `request.cookies[AUTH_COOKIE_NAMES.accessToken]` sees the right session.
 * On an academy's address a domain-wide Nexa cookie is never used (it is
 * dropped), so it can't act on another academy even in `audit` mode. On Nexa's
 * own hosts (`PLATFORM_HOST_ONLY_COOKIES`) it is the fallback until swapped.
 */
export function aliasHostOnlyCookies(request: Request, _response: Response, next: NextFunction) {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const store = getTenantContext();
  if (cookies && usesHostOnlyCookies(store)) {
    const keepsLegacy = isPlatformHostOnly(store);
    for (const key of ["accessToken", "refreshToken"] as const) {
      const hostOnly = cookies[HOST_ONLY_COOKIE_NAMES[key]];
      if (hostOnly) cookies[AUTH_COOKIE_NAMES[key]] = hostOnly;
      else if (!keepsLegacy) delete cookies[AUTH_COOKIE_NAMES[key]];
    }
  }
  next();
}

export function getSessionContext(request: Request) {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent")
  };
}
