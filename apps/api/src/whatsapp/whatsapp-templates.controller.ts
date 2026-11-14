import { Controller, ForbiddenException, Get, Injectable, Logger, Query, Req } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { API_ROUTES, DEFAULT_TENANT_ID, type WhatsAppTemplateInfo, type WhatsAppTemplateListResponse } from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { authenticateUser } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryString } from "../common/query-params";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { WhatsAppCredentialsService } from "./whatsapp-credentials.service";

/** How long a fetched list is reused: template approval takes minutes to days. */
export const WHATSAPP_TEMPLATES_CACHE_MS = 5 * 60_000;
const MAX_PAGES = 5;

/** Meta's `message_templates` page → our rows; anything malformed is skipped. */
export function parseTemplatePage(body: unknown): { templates: WhatsAppTemplateInfo[]; next: string | null } {
  const data = (body as { data?: unknown })?.data;
  const templates = Array.isArray(data)
    ? data.flatMap((row) => {
        const item = row as Record<string, unknown>;
        return typeof item.name === "string" && typeof item.language === "string"
          ? [
              {
                category: typeof item.category === "string" ? item.category : "",
                language: item.language,
                name: item.name,
                status: typeof item.status === "string" ? item.status : "UNKNOWN"
              }
            ]
          : [];
      })
    : [];
  const next = (body as { paging?: { next?: unknown } })?.paging?.next;
  return { next: typeof next === "string" ? next : null, templates };
}

/**
 * The academy's message templates as WhatsApp Manager lists them, so editors
 * can show whether a template name they typed is approved (docs/MESSAGING.md
 * "WhatsApp templates"). Read-only: templates are created in WhatsApp Manager.
 */
@Injectable()
export class WhatsAppTemplatesService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(WhatsAppTemplatesService.name);
  private readonly cache = new Map<string, { at: number; response: WhatsAppTemplateListResponse }>();

  constructor(
    private readonly credentials: WhatsAppCredentialsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async list(accessToken: string | undefined, refresh: boolean): Promise<WhatsAppTemplateListResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can see WhatsApp templates.");
    }
    const tenantId = requireTenantId("whatsappTemplates");
    const cached = this.cache.get(tenantId);
    if (!refresh && cached && Date.now() - cached.at < WHATSAPP_TEMPLATES_CACHE_MS) return cached.response;
    const response = await this.fetch(tenantId);
    // A failure isn't cached for long: a fixed setting shows up on the next look.
    if (response.available) this.cache.set(tenantId, { at: Date.now(), response });
    return response;
  }

  private account(tenantId: string): { token: string; wabaId: string } | null {
    if (tenantId === DEFAULT_TENANT_ID) {
      const token = this.env.WHATSAPP_ACCESS_TOKEN;
      const wabaId = this.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      return token && wabaId ? { token, wabaId } : null;
    }
    const own = this.credentials.forTenant(tenantId);
    return own?.wabaId ? { token: own.accessToken, wabaId: own.wabaId } : null;
  }

  private async fetch(tenantId: string): Promise<WhatsAppTemplateListResponse> {
    const account = this.account(tenantId);
    if (!account) {
      return {
        available: false,
        fetchedAt: null,
        reason:
          tenantId === DEFAULT_TENANT_ID
            ? "Set WHATSAPP_BUSINESS_ACCOUNT_ID on the server to see template status."
            : "Save the WhatsApp Business Account ID under Branding → WhatsApp to see template status.",
        templates: []
      };
    }
    const base = this.env.WHATSAPP_API_BASE_URL.replace(/\/+$/, "");
    let url: string | null =
      `${base}/${this.env.WHATSAPP_API_VERSION}/${encodeURIComponent(account.wabaId)}/message_templates?fields=name,language,status,category&limit=100`;
    const templates: WhatsAppTemplateInfo[] = [];
    try {
      for (let page = 0; url && page < MAX_PAGES; page += 1) {
        const res: Response = await fetch(url, {
          headers: { Authorization: `Bearer ${account.token}` },
          signal: AbortSignal.timeout(this.env.WHATSAPP_TIMEOUT_MS)
        });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const message = (body as { error?: { message?: unknown } })?.error?.message;
          throw new Error(typeof message === "string" ? message : `HTTP ${res.status}`);
        }
        const parsed = parseTemplatePage(body);
        templates.push(...parsed.templates);
        // Only follow Meta's own paging links.
        url = parsed.next && parsed.next.startsWith(base) ? parsed.next : null;
      }
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      this.logger.warn(`WhatsApp templates for ${tenantId} not loaded: ${message}`);
      return { available: false, fetchedAt: null, reason: `WhatsApp didn't list the templates: ${message}`, templates: [] };
    }
    return { available: true, fetchedAt: new Date().toISOString(), reason: null, templates };
  }
}

@Controller()
export class WhatsAppTemplatesController {
  constructor(private readonly templates: WhatsAppTemplatesService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.whatsappTemplates)
  list(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.templates.list(this.getAccessToken(request), queryString(query.refresh, "refresh") === "1");
  }
}
