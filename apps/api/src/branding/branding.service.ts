import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  BRAND_ASSET_MAX_BYTES,
  brandColorIssue,
  DEFAULT_TENANT_ID,
  deriveBrandPalette,
  type BrandAssetKind,
  type BrandTheme,
  type TenantBrandingResponse,
  type TenantBrandingSettings,
  type TenantDomainsResponse,
  type TenantPublicConfig,
  type UpdateTenantBrandingRequest,
  type UpdateWhiteLabelRequest
} from "@nexa-chess/types";
import { TenantDomainStatus, UserRole, type TenantBranding } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { EntitlementService } from "../platform/entitlement.service";
import { PrismaService } from "../prisma/prisma.service";
import { currentTenantId } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import { UploadService } from "../upload/upload.service";
import { ACADEMY_NAME } from "../messaging/messaging.format";

const PUBLIC_CACHE_MS = 60_000;
const ASSET_COLUMN: Record<BrandAssetKind, "faviconUrl" | "loginImageUrl" | "logoDarkUrl" | "logoLightUrl"> = {
  favicon: "faviconUrl",
  loginImage: "loginImageUrl",
  logoDark: "logoDarkUrl",
  logoLight: "logoLightUrl"
};

/** Magic bytes, so a renamed file of another type is refused (§F "Assets": PNG/JPEG/WebP only). */
function sniffImage(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * An academy's look (docs/SAAS_MULTI_TENANCY.md §F; Phase 5). The public
 * config is resolved by host for every page before sign-in; the academy's
 * admins edit it when the plan has `brandIdentity`, and hide "Powered by" with
 * `whiteLabel`. Nexa keeps its own wording (`isPlatformHome`).
 */
@Injectable()
export class BrandingService {
  private readonly env = getApiEnv();
  private readonly publicCache = new Map<string, { at: number; config: Promise<TenantPublicConfig> }>();

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadService
  ) {}

  // ── Public ──

  /** The academy the request's host names; an unknown host gets an empty config, never Nexa's. */
  publicConfig(): Promise<TenantPublicConfig> {
    const tenantId = currentTenantId();
    if (!tenantId) return Promise.resolve(emptyPublicConfig());
    return this.configFor(tenantId);
  }

  /**
   * The academy's name for copy it sends or prints (messages, system emails,
   * PDFs, PGN headers): the same name its pages show. Nexa's is its own;
   * no academy in context falls back to it too.
   */
  async nameFor(tenantId: string | null | undefined = currentTenantId()): Promise<string> {
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return ACADEMY_NAME;
    return (await this.configFor(tenantId)).name || ACADEMY_NAME;
  }

  private configFor(tenantId: string): Promise<TenantPublicConfig> {
    const now = Date.now();
    const cached = this.publicCache.get(tenantId);
    if (cached && now - cached.at < PUBLIC_CACHE_MS) return cached.config;
    const config = this.buildPublicConfig(tenantId);
    this.publicCache.set(tenantId, { at: now, config });
    config.catch(() => this.publicCache.delete(tenantId));
    return config;
  }

  private async buildPublicConfig(tenantId: string): Promise<TenantPublicConfig> {
    const [tenant, branding, state] = await Promise.all([
      this.prisma.tenant.findUnique({ select: { name: true, status: true }, where: { id: tenantId } }),
      this.prisma.tenantBranding.findUnique({ where: { tenantId } }),
      this.entitlements.getState(tenantId)
    ]);
    if (!tenant) return emptyPublicConfig();
    const brand = state.features.includes("brandIdentity") ? branding : null;
    const whiteLabel = state.features.includes("whiteLabel");
    return {
      contactEmail: brand?.contactEmail ?? null,
      contactPhone: brand?.contactPhone ?? null,
      defaultTheme: (brand?.defaultTheme as BrandTheme | undefined) ?? "system",
      faviconUrl: brand?.faviconUrl ?? null,
      isPlatformHome: tenantId === DEFAULT_TENANT_ID,
      loginImageUrl: brand?.loginImageUrl ?? null,
      logoDarkUrl: brand?.logoDarkUrl ?? null,
      logoLightUrl: brand?.logoLightUrl ?? null,
      name: brand?.displayName ?? tenant.name,
      palette: brand ? deriveBrandPalette(brand.primaryColor, brand.accentColor) : null,
      poweredBy: tenantId !== DEFAULT_TENANT_ID && !(whiteLabel && (branding?.hidePoweredBy ?? true)),
      seoDescription: brand?.seoDescription ?? null,
      seoTitle: brand?.seoTitle ?? null,
      tagline: brand?.tagline ?? null,
      tenantId
    };
  }

  /** The academy's name and sender details for its emails (§F "Email"); Nexa's are its own. */
  async senderFor(tenantId: string): Promise<{ name: string | null; replyTo: string | null }> {
    if (tenantId === DEFAULT_TENANT_ID) return { name: null, replyTo: null };
    const [tenant, branding, state] = await Promise.all([
      this.prisma.tenant.findUnique({ select: { name: true }, where: { id: tenantId } }),
      this.prisma.tenantBranding.findUnique({ where: { tenantId } }),
      this.entitlements.getState(tenantId)
    ]);
    const brand = state.features.includes("brandIdentity") ? branding : null;
    return {
      name: brand?.emailSenderName ?? brand?.displayName ?? tenant?.name ?? null,
      replyTo: brand?.replyToEmail ?? brand?.contactEmail ?? null
    };
  }

  invalidate(tenantId?: string) {
    if (tenantId) this.publicCache.delete(tenantId);
    else this.publicCache.clear();
  }

  // ── The academy's admins ──

  private async admin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only academy admins can change its branding.");
    }
    return user;
  }

  async get(accessToken: string | undefined): Promise<TenantBrandingResponse> {
    await this.admin(accessToken);
    const tenantId = requireTenantId("branding");
    return this.view(tenantId);
  }

  async update(accessToken: string | undefined, body: UpdateTenantBrandingRequest): Promise<TenantBrandingResponse> {
    const user = await this.admin(accessToken);
    const tenantId = requireTenantId("branding");
    for (const [kind, value] of [["primary", body.primaryColor], ["accent", body.accentColor]] as const) {
      const issue = value ? brandColorIssue(kind, value) : null;
      if (issue) throw new BadRequestException(issue);
    }
    await this.prisma.tenantBranding.upsert({
      create: { ...body, tenantId, updatedById: user.id },
      update: { ...body, updatedById: user.id },
      where: { tenantId }
    });
    this.invalidate(tenantId);
    return this.view(tenantId);
  }

  async setWhiteLabel(accessToken: string | undefined, body: UpdateWhiteLabelRequest): Promise<TenantBrandingResponse> {
    const user = await this.admin(accessToken);
    const tenantId = requireTenantId("branding");
    await this.prisma.tenantBranding.upsert({
      create: { hidePoweredBy: body.hidePoweredBy, tenantId, updatedById: user.id },
      update: { hidePoweredBy: body.hidePoweredBy, updatedById: user.id },
      where: { tenantId }
    });
    this.invalidate(tenantId);
    return this.view(tenantId);
  }

  async uploadAsset(
    accessToken: string | undefined,
    kind: BrandAssetKind,
    file: Express.Multer.File | undefined
  ): Promise<TenantBrandingResponse> {
    const user = await this.admin(accessToken);
    const tenantId = requireTenantId("branding");
    if (!file) throw new BadRequestException("Choose an image to upload.");
    if (file.size > BRAND_ASSET_MAX_BYTES[kind]) {
      throw new BadRequestException(`This image is too large (max ${Math.round(BRAND_ASSET_MAX_BYTES[kind] / 1024)} KB).`);
    }
    if (!sniffImage(file.buffer)) throw new BadRequestException("Use a PNG, JPEG or WebP image.");
    const uploaded = await this.uploads.uploadBrandAsset(file, kind);
    const column = ASSET_COLUMN[kind];
    await this.prisma.tenantBranding.upsert({
      create: { [column]: uploaded.secure_url, tenantId, updatedById: user.id },
      update: { [column]: uploaded.secure_url, updatedById: user.id },
      where: { tenantId }
    });
    this.invalidate(tenantId);
    return this.view(tenantId);
  }

  async clearAsset(accessToken: string | undefined, kind: BrandAssetKind): Promise<TenantBrandingResponse> {
    const user = await this.admin(accessToken);
    const tenantId = requireTenantId("branding");
    await this.prisma.tenantBranding.updateMany({
      data: { [ASSET_COLUMN[kind]]: null, updatedById: user.id },
      where: { tenantId }
    });
    this.invalidate(tenantId);
    return this.view(tenantId);
  }

  /** The academy's own addresses, for its admins (plan feature `customDomain`). */
  async domains(accessToken: string | undefined): Promise<TenantDomainsResponse> {
    await this.admin(accessToken);
    const tenantId = requireTenantId("domains");
    const rows = await this.prisma.tenantDomain.findMany({
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      where: { status: { not: TenantDomainStatus.REMOVED }, tenantId }
    });
    const subdomain = rows.find((row) => row.kind === "SUBDOMAIN")?.hostname;
    return {
      dnsTarget: subdomain ?? this.env.PLATFORM_ROOT_DOMAIN,
      domains: rows.map((row) => ({ hostname: row.hostname, isPrimary: row.isPrimary, kind: row.kind, status: row.status }))
    };
  }

  private async view(tenantId: string): Promise<TenantBrandingResponse> {
    const [tenant, branding, state] = await Promise.all([
      this.prisma.tenant.findUnique({ select: { name: true }, where: { id: tenantId } }),
      this.prisma.tenantBranding.findUnique({ where: { tenantId } }),
      this.entitlements.getState(tenantId)
    ]);
    if (!tenant) throw new NotFoundException("Academy not found.");
    return {
      branding: toSettings(branding),
      canEdit: state.features.includes("brandIdentity"),
      hidePoweredBy: branding?.hidePoweredBy ?? true,
      tenantName: tenant.name,
      whiteLabel: state.features.includes("whiteLabel")
    };
  }
}

function toSettings(row: TenantBranding | null): TenantBrandingSettings {
  return {
    accentColor: row?.accentColor ?? null,
    contactEmail: row?.contactEmail ?? null,
    contactPhone: row?.contactPhone ?? null,
    defaultTheme: (row?.defaultTheme as BrandTheme | undefined) ?? "system",
    displayName: row?.displayName ?? null,
    emailSenderName: row?.emailSenderName ?? null,
    faviconUrl: row?.faviconUrl ?? null,
    loginImageUrl: row?.loginImageUrl ?? null,
    logoDarkUrl: row?.logoDarkUrl ?? null,
    logoLightUrl: row?.logoLightUrl ?? null,
    primaryColor: row?.primaryColor ?? null,
    replyToEmail: row?.replyToEmail ?? null,
    seoDescription: row?.seoDescription ?? null,
    seoTitle: row?.seoTitle ?? null,
    tagline: row?.tagline ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null
  };
}

function emptyPublicConfig(): TenantPublicConfig {
  return {
    contactEmail: null,
    contactPhone: null,
    defaultTheme: "system",
    faviconUrl: null,
    isPlatformHome: false,
    loginImageUrl: null,
    logoDarkUrl: null,
    logoLightUrl: null,
    name: "",
    palette: null,
    poweredBy: true,
    seoDescription: null,
    seoTitle: null,
    tagline: null,
    tenantId: null
  };
}
