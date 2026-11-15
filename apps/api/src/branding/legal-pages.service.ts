import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  DEFAULT_TENANT_ID,
  LEGAL_PAGE_KINDS,
  legalTermsVersionFor,
  type AdminLegalPagesResponse,
  type LegalPageKind,
  type PublicLegalPage,
  type UpdateLegalPageRequest
} from "@nexa-chess/types";
import { UserRole, type TenantLegalPage } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { currentTenantId } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";

/**
 * An academy's own wording for `/privacy` and `/terms` on its own address
 * (docs/SAAS_MULTI_TENANCY.md §F "Legal pages"). No row = the built-in text.
 * Nexa's own pages are part of the web app (`features/legal/content.ts`) and
 * are never edited here. Available on every plan: the academy is the one
 * responsible for its families' data, whatever it pays.
 */
@Injectable()
export class LegalPagesService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── Public ──

  /** The page for the academy the request's host names; an unknown host or Nexa's gets the built-in text. */
  async publicPage(kind: LegalPageKind): Promise<PublicLegalPage> {
    const tenantId = currentTenantId();
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return emptyPage(kind);
    const row = await this.prisma.tenantLegalPage.findUnique({ where: { tenantId_kind: { kind, tenantId } } });
    return row ? toPage(row) : emptyPage(kind);
  }

  /**
   * What a self-registration on this academy records as the accepted version:
   * the built-in version, or when the academy's own wording last changed.
   */
  async termsVersion(): Promise<string> {
    const tenantId = currentTenantId();
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return legalTermsVersionFor([]);
    const rows = await this.prisma.tenantLegalPage.findMany({ select: { updatedAt: true }, where: { tenantId } });
    return legalTermsVersionFor(rows.map((row) => row.updatedAt));
  }

  // ── The academy's admins ──

  private async admin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only academy admins can change its legal pages.");
    }
    return user;
  }

  async list(accessToken: string | undefined): Promise<AdminLegalPagesResponse> {
    await this.admin(accessToken);
    return this.view(requireTenantId("legalPages"));
  }

  async update(
    accessToken: string | undefined,
    kind: LegalPageKind,
    body: UpdateLegalPageRequest
  ): Promise<AdminLegalPagesResponse> {
    const user = await this.admin(accessToken);
    const tenantId = requireTenantId("legalPages");
    if (tenantId === DEFAULT_TENANT_ID) {
      throw new BadRequestException("Nexa's own legal pages are part of the app and can't be edited here.");
    }

    if (body.body === "") {
      await this.prisma.tenantLegalPage.deleteMany({ where: { kind, tenantId } });
    } else {
      await this.prisma.tenantLegalPage.upsert({
        create: { body: body.body, kind, tenantId, updatedById: user.id },
        update: { body: body.body, updatedById: user.id },
        where: { tenantId_kind: { kind, tenantId } }
      });
    }
    return this.view(tenantId);
  }

  private async view(tenantId: string): Promise<AdminLegalPagesResponse> {
    const rows = await this.prisma.tenantLegalPage.findMany({ where: { tenantId } });
    return {
      editable: tenantId !== DEFAULT_TENANT_ID,
      pages: LEGAL_PAGE_KINDS.map((kind) => {
        const row = rows.find((candidate) => candidate.kind === kind);
        return row ? toPage(row) : emptyPage(kind);
      })
    };
  }
}

function emptyPage(kind: LegalPageKind): PublicLegalPage {
  return { body: null, kind, updatedAt: null };
}

function toPage(row: TenantLegalPage): PublicLegalPage {
  return { body: row.body, kind: row.kind as LegalPageKind, updatedAt: row.updatedAt.toISOString() };
}
