import type { Request, Response } from "express";
import { getApiEnv, getCookieBaseOptions } from "@nexa-chess/config/api";
import { AUTH_COOKIE_NAMES, AUTH_COOKIE_PATHS } from "./types";

export type SessionCookieTokens = {
  accessToken: string;
  accessTokenMaxAge: number;
  refreshToken: string;
  refreshTokenMaxAge: number;
};

export function setAuthCookies(response: Response, tokens: SessionCookieTokens) {
  const base = getCookieBaseOptions(getApiEnv());

  response.cookie(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: tokens.accessTokenMaxAge,
    path: AUTH_COOKIE_PATHS.accessToken
  });
  response.cookie(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: tokens.refreshTokenMaxAge,
    path: AUTH_COOKIE_PATHS.refreshToken
  });
}

export function clearAuthCookies(response: Response) {
  const base = getCookieBaseOptions(getApiEnv());

  response.clearCookie(AUTH_COOKIE_NAMES.accessToken, {
    ...base,
    path: AUTH_COOKIE_PATHS.accessToken
  });
  response.clearCookie(AUTH_COOKIE_NAMES.refreshToken, {
    ...base,
    path: AUTH_COOKIE_PATHS.refreshToken
  });
}

export function getSessionContext(request: Request) {
  return {
    ipAddress: request.ip,
    userAgent: request.get("user-agent")
  };
}
