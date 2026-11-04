import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getCorsOrigins, getFrontendUrl } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { hostnameFromUrl, normalizeHostname } from "./hostname";
import type { TenantContextSource, TenantContextStore } from "./tenant-context";

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_HOSTS = 1_000;

type Match = { source: TenantContextSource; tenantId: string };

/** `METHOD /path` with id-like segments collapsed, so audit keys stay few. */
export function routeLabel(method: string, path: string): string {
  const collapsed = path
    .split("/")
    .map((segment) =>
      /^\d+$/.test(segment) || /^[0-9a-f-]{32,36}$/i.test(segment) || /^c[a-z0-9]{20,}$/.test(segment)
        ? ":id"
        : segment
    )
    .join("/");
  return `${method} ${collapsed}`;
}

/**
 * Host → academy (docs/SAAS_MULTI_TENANCY.md §B "Request lifecycle").
 *
 * Until Phase 5 serves the API same-origin under `/api`, the browser calls a
 * separate API host (`api.nexachess.in`), so the academy is read from the
 * request's `Origin`, then `Referer`, then its own host (`X-Forwarded-Host`
 * only through `TRUST_PROXY_HOPS`, via Express's `req.hostname`). The first
 * candidate that matches wins:
 * 1. an ACTIVE `tenant_domains` row (cached 60 s per host, misses included);
 * 2. one of this deployment's configured web origins (`FRONTEND_URL`,
 *    `CORS_ORIGIN`), which are Nexa's until academies get their own hosts.
 * No match leaves the context empty — **never a fallback to Nexa** — and
 * `authenticateUser` may then fill it from the signed-in user.
 */
@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name);
  private readonly cache = new Map<string, { expiresAt: number; tenantId: string | null }>();
  private readonly configHosts: ReadonlySet<string>;

  constructor(private readonly prisma: PrismaService) {
    const env = getApiEnv();
    this.configHosts = new Set(
      [...getCorsOrigins(env), getFrontendUrl(env)]
        .map((origin) => hostnameFromUrl(origin))
        .filter((host): host is string => host !== null)
    );
  }

  async resolveRequest(request: Request): Promise<TenantContextStore> {
    const label = routeLabel(request.method, request.path);
    for (const host of this.candidateHosts(request)) {
      const match = await this.resolveHost(host);
      if (match) return { host, label, source: match.source, tenantId: match.tenantId };
    }
    return { host: null, label, source: null, tenantId: null };
  }

  async resolveHost(host: string): Promise<Match | null> {
    const tenantId = await this.lookupDomain(host);
    if (tenantId) return { source: "host", tenantId };
    if (this.configHosts.has(host)) return { source: "config", tenantId: DEFAULT_TENANT_ID };
    return null;
  }

  /** Drops cached lookups, e.g. after a domain is added or removed. */
  invalidate(host?: string) {
    if (host) this.cache.delete(host);
    else this.cache.clear();
  }

  private candidateHosts(request: Request): string[] {
    const hosts = [
      hostnameFromUrl(request.get("origin")),
      hostnameFromUrl(request.get("referer")),
      normalizeHostname(request.hostname)
    ].filter((host): host is string => host !== null);
    return [...new Set(hosts)];
  }

  private async lookupDomain(host: string): Promise<string | null> {
    const now = Date.now();
    const cached = this.cache.get(host);
    if (cached && cached.expiresAt > now) return cached.tenantId;
    let tenantId: string | null = null;
    try {
      const row = await this.prisma.tenantDomain.findFirst({
        select: { tenantId: true },
        where: { hostname: host, status: "ACTIVE", tenant: { status: { not: "DEACTIVATED" } } }
      });
      tenantId = row?.tenantId ?? null;
    } catch (error) {
      // Audit mode: a failed lookup must not fail the request. Not cached.
      this.logger.warn(`tenant domain lookup failed for ${host}: ${(error as Error).message}`);
      return null;
    }
    if (this.cache.size >= CACHE_MAX_HOSTS) this.cache.clear();
    this.cache.set(host, { expiresAt: now + CACHE_TTL_MS, tenantId });
    return tenantId;
  }
}
