import type { Request, Response } from "express";
import { runWithTenantContext, type TenantContextStore } from "../tenancy/tenant-context";
import {
  aliasHostOnlyCookies,
  clearAuthCookies,
  HOST_ONLY_COOKIE_NAMES,
  setAuthCookies,
  trackingCookieBase,
  usesHostOnlyCookies
} from "./auth-cookies";
import { AUTH_COOKIE_NAMES } from "./types";

const env = { COOKIE_DOMAIN: ".nexachess.in", PLATFORM_HOST_ONLY_COOKIES: false };

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => env,
  getCookieBaseOptions: (e: { COOKIE_DOMAIN?: string }) => ({
    sameSite: "lax",
    secure: true,
    ...(e.COOKIE_DOMAIN ? { domain: e.COOKIE_DOMAIN } : {})
  })
}));

const nexa: TenantContextStore = { host: "nexachess.in", label: "spec", source: "config", tenantId: "tenant_nexa" };
const academy: TenantContextStore = { host: "rook.nexachess.in", label: "spec", source: "host", tenantId: "tenant_rook" };
const tokens = { accessToken: "a", accessTokenMaxAge: 1, refreshToken: "r", refreshTokenMaxAge: 2 };

type Call = { name: string; options: { domain?: string } };
function fakeResponse() {
  const set: Call[] = [];
  const cleared: Call[] = [];
  const response = {
    clearCookie: (name: string, options: Call["options"]) => cleared.push({ name, options }),
    cookie: (name: string, _value: string, options: Call["options"]) => set.push({ name, options })
  } as unknown as Response;
  return { cleared, response, set };
}

const inContext = <T>(store: TenantContextStore, fn: () => T) => runWithTenantContext(store, fn);

function alias(store: TenantContextStore, cookies: Record<string, string>) {
  const request = { cookies: { ...cookies } } as unknown as Request;
  inContext(store, () => aliasHostOnlyCookies(request, {} as Response, () => undefined));
  return request.cookies as Record<string, string | undefined>;
}

describe("session cookies per host (docs/AUTHORIZATION.md Cookies)", () => {
  afterEach(() => {
    env.PLATFORM_HOST_ONLY_COOKIES = false;
  });

  describe("PLATFORM_HOST_ONLY_COOKIES off (today)", () => {
    it("Nexa keeps its domain-wide pair", () => {
      const { response, set, cleared } = fakeResponse();
      inContext(nexa, () => setAuthCookies(response, tokens));
      expect(set.map((c) => c.name)).toEqual([AUTH_COOKIE_NAMES.accessToken, AUTH_COOKIE_NAMES.refreshToken]);
      expect(set.every((c) => c.options.domain === ".nexachess.in")).toBe(true);
      expect(cleared).toEqual([]);
      expect(inContext(nexa, () => usesHostOnlyCookies())).toBe(false);
    });

    it("an academy gets host-only cookies and never reads Nexa's", () => {
      const { response, set } = fakeResponse();
      inContext(academy, () => setAuthCookies(response, tokens));
      expect(set.map((c) => c.name)).toEqual([HOST_ONLY_COOKIE_NAMES.accessToken, HOST_ONLY_COOKIE_NAMES.refreshToken]);
      expect(set.every((c) => c.options.domain === undefined)).toBe(true);
      expect(alias(academy, { [AUTH_COOKIE_NAMES.accessToken]: "nexa" })[AUTH_COOKIE_NAMES.accessToken]).toBeUndefined();
    });
  });

  it("tracking (visitor/referral) cookies follow the same host rule", () => {
    expect(inContext(nexa, () => trackingCookieBase()).domain).toBe(".nexachess.in");
    expect(inContext(academy, () => trackingCookieBase()).domain).toBeUndefined();
    expect(inContext(academy, () => trackingCookieBase())).toMatchObject({ sameSite: "lax", secure: true });
  });

  describe("PLATFORM_HOST_ONLY_COOKIES on", () => {
    beforeEach(() => {
      env.PLATFORM_HOST_ONLY_COOKIES = true;
    });

    it("Nexa sets the host-only pair and clears the old domain-wide one", () => {
      const { response, set, cleared } = fakeResponse();
      inContext(nexa, () => setAuthCookies(response, tokens));
      expect(set.map((c) => c.name)).toEqual([HOST_ONLY_COOKIE_NAMES.accessToken, HOST_ONLY_COOKIE_NAMES.refreshToken]);
      expect(set.every((c) => c.options.domain === undefined)).toBe(true);
      expect(cleared).toEqual([
        { name: AUTH_COOKIE_NAMES.accessToken, options: expect.objectContaining({ domain: ".nexachess.in" }) },
        { name: AUTH_COOKIE_NAMES.refreshToken, options: expect.objectContaining({ domain: ".nexachess.in" }) }
      ]);
    });

    it("signing out on Nexa clears both pairs", () => {
      const { response, cleared } = fakeResponse();
      inContext(nexa, () => clearAuthCookies(response));
      expect(cleared.map((c) => c.name).sort()).toEqual(
        [...Object.values(AUTH_COOKIE_NAMES), ...Object.values(HOST_ONLY_COOKIE_NAMES)].sort()
      );
    });

    it("Nexa prefers the host-only cookie and still accepts an old one until the swap", () => {
      expect(
        alias(nexa, { [AUTH_COOKIE_NAMES.accessToken]: "old", [HOST_ONLY_COOKIE_NAMES.accessToken]: "new" })[AUTH_COOKIE_NAMES.accessToken]
      ).toBe("new");
      expect(alias(nexa, { [AUTH_COOKIE_NAMES.refreshToken]: "old" })[AUTH_COOKIE_NAMES.refreshToken]).toBe("old");
    });

    it("academies are unchanged: Nexa's cookie is still dropped there", () => {
      expect(alias(academy, { [AUTH_COOKIE_NAMES.refreshToken]: "nexa" })[AUTH_COOKIE_NAMES.refreshToken]).toBeUndefined();
      const { response, cleared } = fakeResponse();
      inContext(academy, () => setAuthCookies(response, tokens));
      expect(cleared).toEqual([]);
    });

    it("no academy in context keeps the domain-wide pair", () => {
      const { response, set } = fakeResponse();
      inContext({ host: null, label: "spec", source: null, tenantId: null }, () => setAuthCookies(response, tokens));
      expect(set.map((c) => c.name)).toEqual([AUTH_COOKIE_NAMES.accessToken, AUTH_COOKIE_NAMES.refreshToken]);
    });
  });
});
