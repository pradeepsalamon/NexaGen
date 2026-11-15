import { Injectable } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { TenantDomainStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform, currentTenantId } from "./tenant-context";

const ORIGIN_CACHE_MS = 60_000;

/**
 * The web address an academy's own people open (docs/SAAS_MULTI_TENANCY.md
 * § "Links in messages"). Every link the API builds for a person (emails,
 * WhatsApp, in-app, gateway return URLs, certificates) goes through here, so
 * another academy's student never lands on Nexa's site, where their account
 * doesn't sign in.
 *
 * Nexa (and platform work with no academy) gets `FRONTEND_URL`. Another
 * academy gets its primary ACTIVE domain; one with no active domain yet falls
 * back to `FRONTEND_URL`, because its people have no other address either.
 */
@Injectable()
export class AcademyLinksService {
  private readonly frontendUrl = getFrontendUrl(getApiEnv()).replace(/\/+$/, "");
  private readonly cache = new Map<string, { at: number; origin: Promise<string> }>();

  constructor(private readonly prisma: PrismaService) {}

  /** Nexa's own address (`FRONTEND_URL`, no trailing slash). */
  platformOrigin(): string {
    return this.frontendUrl;
  }

  /** The academy's origin, no trailing slash. Defaults to the request's or job's academy. */
  origin(tenantId: string | null | undefined = currentTenantId()): Promise<string> {
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return Promise.resolve(this.frontendUrl);
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && now - cached.at < ORIGIN_CACHE_MS) return cached.origin;
    const origin = this.lookup(tenantId);
    this.cache.set(tenantId, { at: now, origin });
    origin.catch(() => this.cache.delete(tenantId));
    return origin;
  }

  /** `path` (starting with `/`) on the academy's origin. */
  async url(path: string, tenantId?: string | null): Promise<string> {
    const origin = await this.origin(tenantId === undefined ? currentTenantId() : tenantId);
    return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  }

  /**
   * Moves every value that is a link on Nexa's address onto the academy's.
   * Callers that built links with `getFrontendUrl` before this helper existed
   * stay correct: senders run this once over the finished variables.
   */
  async localize<T extends Record<string, unknown>>(
    variables: T,
    tenantId: string | null | undefined = currentTenantId()
  ): Promise<T> {
    const origin = await this.origin(tenantId);
    return this.rewrite(variables, origin);
  }

  /** The synchronous half of `localize`, for a caller that already has the origin. */
  rewrite<T extends Record<string, unknown>>(variables: T, origin: string): T {
    if (origin === this.frontendUrl) return variables;
    const out: Record<string, unknown> = { ...variables };
    for (const [key, value] of Object.entries(out)) {
      if (typeof value === "string") out[key] = this.rewriteLink(value, origin);
    }
    return out as T;
  }

  /** One link: Nexa's origin replaced by `origin`; anything else is returned unchanged. */
  rewriteLink(value: string, origin: string): string {
    if (origin === this.frontendUrl) return value;
    if (value === this.frontendUrl) return origin;
    // Only a whole origin match: `https://nexachess.in.evil` or `…/x` inside a sentence stay.
    for (const sep of ["/", "?", "#"]) {
      if (value.startsWith(`${this.frontendUrl}${sep}`)) return `${origin}${value.slice(this.frontendUrl.length)}`;
    }
    return value;
  }

  private async lookup(tenantId: string): Promise<string> {
    const domain = await asPlatform("academy links: the academy's own address", () =>
      this.prisma.tenantDomain.findFirst({
        orderBy: [{ isPrimary: "desc" }, { hostname: "asc" }],
        select: { hostname: true },
        where: { status: TenantDomainStatus.ACTIVE, tenantId }
      })
    );
    if (!domain) return this.frontendUrl;
    const scheme = this.frontendUrl.startsWith("http://") ? "http" : "https";
    return `${scheme}://${domain.hostname}`;
  }
}
