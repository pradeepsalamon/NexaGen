import type { NextFunction, Request, Response } from "express";
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

export function usesHostOnlyCookies(store: TenantContextStore | undefined = getTenantContext()): boolean {
  return Boolean(store?.tenantId && store.tenantId !== DEFAULT_TENANT_ID && store.source === "host");
}

export function setAuthCookies(response: Response, tokens: SessionCookieTokens) {
  const hostOnly = usesHostOnlyCookies();
  const { domain: _domain, ...hostBase } = getCookieBaseOptions(getApiEnv());
  const base = hostOnly ? hostBase : getCookieBaseOptions(getApiEnv());
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
}

export function clearAuthCookies(response: Response) {
  const hostOnly = usesHostOnlyCookies();
  const { domain: _domain, ...hostBase } = getCookieBaseOptions(getApiEnv());
  const base = hostOnly ? hostBase : getCookieBaseOptions(getApiEnv());
  const names = hostOnly ? HOST_ONLY_COOKIE_NAMES : AUTH_COOKIE_NAMES;

  response.clearCookie(names.accessToken, {
    ...base,
    path: AUTH_COOKIE_PATHS.accessToken
  });
  response.clearCookie(names.refreshToken, {
    ...base,
    path: AUTH_COOKIE_PATHS.refreshToken
  });
}

/**
 * After `cookie-parser`: on an academy's own address, the host-only cookies
 * are read under the usual names, so every controller's
 * `request.cookies[AUTH_COOKIE_NAMES.accessToken]` sees the right session.
 * A domain-wide Nexa cookie is never used there (it is dropped), so it can't
 * act on another academy even in `audit` mode.
 */
export function aliasHostOnlyCookies(request: Request, _response: Response, next: NextFunction) {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  if (cookies && usesHostOnlyCookies()) {
    for (const key of ["accessToken", "refreshToken"] as const) {
      const hostOnly = cookies[HOST_ONLY_COOKIE_NAMES[key]];
      if (hostOnly) cookies[AUTH_COOKIE_NAMES[key]] = hostOnly;
      else delete cookies[AUTH_COOKIE_NAMES[key]];
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
