import type { Request } from "express";
import type { PrismaService } from "../prisma/prisma.service";
import { routeLabel, TenantResolverService } from "./tenant-resolver.service";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ CORS_ORIGIN: "https://dev.nexachess.in,http://localhost:3000", FRONTEND_URL: undefined }),
  getCorsOrigins: (env: { CORS_ORIGIN: string }) => env.CORS_ORIGIN.split(","),
  getFrontendUrl: () => "https://dev.nexachess.in"
}));

const domains: Record<string, string> = { "acme.nexachess.in": "tenant_acme", "nexachess.in": "tenant_nexa" };

function makeResolver() {
  const findFirst = jest.fn(async ({ where }: { where: { hostname: string } }) =>
    domains[where.hostname] ? { tenantId: domains[where.hostname] } : null
  );
  const prisma = { tenantDomain: { findFirst } } as unknown as PrismaService;
  return { findFirst, resolver: new TenantResolverService(prisma) };
}

function request(headers: Record<string, string>, hostname = "api.nexachess.in"): Request {
  return {
    get: (name: string) => headers[name.toLowerCase()],
    hostname,
    method: "GET",
    path: "/batches/cm1234567890abcdefghijk"
  } as unknown as Request;
}

describe("TenantResolverService", () => {
  it("resolves the academy from the browser's Origin before the API's own host", async () => {
    const { resolver } = makeResolver();
    await expect(resolver.resolveRequest(request({ origin: "https://Acme.NexaChess.in" }))).resolves.toEqual({
      host: "acme.nexachess.in",
      label: "GET /batches/:id",
      source: "host",
      tenantId: "tenant_acme"
    });
  });

  it("falls back to Referer, then the request host", async () => {
    const { resolver } = makeResolver();
    const viaReferer = await resolver.resolveRequest(request({ referer: "https://nexachess.in/admin" }));
    expect(viaReferer.tenantId).toBe("tenant_nexa");
    const viaHost = await resolver.resolveRequest(request({}, "nexachess.in"));
    expect(viaHost).toMatchObject({ source: "host", tenantId: "tenant_nexa" });
  });

  it("maps this deployment's configured web origins to Nexa", async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveRequest(request({ origin: "http://localhost:3000" }));
    expect(result).toMatchObject({ host: "localhost", source: "config", tenantId: "tenant_nexa" });
  });

  it("never falls back to Nexa for an unknown host", async () => {
    const { resolver } = makeResolver();
    const result = await resolver.resolveRequest(request({ origin: "https://evil.example" }));
    expect(result).toMatchObject({ host: null, source: null, tenantId: null });
  });

  it("caches lookups, misses included, until invalidated", async () => {
    const { findFirst, resolver } = makeResolver();
    await resolver.resolveHost("acme.nexachess.in");
    await resolver.resolveHost("acme.nexachess.in");
    await resolver.resolveHost("unknown.example");
    await resolver.resolveHost("unknown.example");
    expect(findFirst).toHaveBeenCalledTimes(2);
    resolver.invalidate("acme.nexachess.in");
    await resolver.resolveHost("acme.nexachess.in");
    expect(findFirst).toHaveBeenCalledTimes(3);
  });

  it("treats a failed lookup as no match without failing the request", async () => {
    const prisma = {
      tenantDomain: { findFirst: jest.fn().mockRejectedValue(new Error("db down")) }
    } as unknown as PrismaService;
    const resolver = new TenantResolverService(prisma);
    await expect(resolver.resolveHost("acme.nexachess.in")).resolves.toBeNull();
  });
});

describe("routeLabel", () => {
  it("collapses ids so audit keys stay few", () => {
    expect(routeLabel("GET", "/batches/cm1234567890abcdefghijk/students/42")).toBe("GET /batches/:id/students/:id");
    expect(routeLabel("POST", "/live-class/2f1c6b1e-1d2a-4b4c-9d3e-0a1b2c3d4e5f/join")).toBe("POST /live-class/:id/join");
    expect(routeLabel("GET", "/admin/requests")).toBe("GET /admin/requests");
  });
});
