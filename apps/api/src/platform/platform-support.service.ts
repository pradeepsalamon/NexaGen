import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import type {
  PlatformSupportSessionItem,
  PlatformSupportSessionsResponse,
  StartSupportSessionRequest,
  StartSupportSessionResponse
} from "@nexa-chess/types";
import { TenantDomainStatus, UserRole, type PlatformSupportSession } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { createOpaqueToken, hashOpaqueToken } from "../auth/auth.utils";
import { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";
import { assertPlatformOperator, writePlatformAudit } from "./platform-operator";

const ENTRY_TTL_MS = 5 * 60_000;
const DEFAULT_VISIT_MS = 60 * 60_000;

type SessionWithStaff = PlatformSupportSession & { staffUser: { firstName: string; lastName: string | null } | null };

/**
 * "Open as support" (docs/SAAS_MULTI_TENANCY.md §I "Support access"; Phase
 * 4e). A Nexa operator starts a visit with a reason; a one-time link (5 min)
 * opens the academy's own host, where `AuthService.enterSupportSession` signs
 * the browser in as the academy's hidden "Platform support" user until the
 * visit ends (1 hour). Writes are counted on the visit; the academy's super
 * admin can read the history.
 */
@Injectable()
export class PlatformSupportService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async start(
    accessToken: string | undefined,
    tenantId: string,
    body: StartSupportSessionRequest
  ): Promise<StartSupportSessionResponse> {
    const actor = assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const tenant = await this.prisma.tenant.findUnique({
      include: { domains: { where: { isPrimary: true, status: TenantDomainStatus.ACTIVE } } },
      where: { id: tenantId }
    });
    if (!tenant) throw new NotFoundException("Academy not found.");
    const host = tenant.domains[0]?.hostname;
    if (!host) throw new BadRequestException("This academy has no active address to open.");
    const token = createOpaqueToken();
    const now = Date.now();
    const visit = await this.prisma.$transaction(async (tx) => {
      const created = await tx.platformSupportSession.create({
        data: {
          entryExpiresAt: new Date(now + ENTRY_TTL_MS),
          entryTokenHash: hashOpaqueToken(token),
          expiresAt: new Date(now + DEFAULT_VISIT_MS),
          reason: body.reason,
          staffUserId: actor.id,
          tenantId
        }
      });
      await writePlatformAudit(tx, {
        action: "support.start",
        actorUserId: actor.id,
        details: { supportSessionId: created.id },
        reason: body.reason,
        targetTenantId: tenantId
      });
      return created;
    });
    const scheme = getFrontendUrl(this.env).startsWith("http://") ? "http" : "https";
    const enterUrl = new URL("/support/enter", `${scheme}://${host}`);
    enterUrl.searchParams.set("token", token);
    return { enterUrl: enterUrl.toString(), expiresAt: visit.expiresAt.toISOString(), id: visit.id };
  }

  /** Ends a visit early: its sign-in sessions are revoked at once. */
  async end(accessToken: string | undefined, supportSessionId: string): Promise<{ ok: true }> {
    const actor = assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    const visit = await this.prisma.platformSupportSession.findUnique({ where: { id: supportSessionId } });
    if (!visit) throw new NotFoundException("Support session not found.");
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSupportSession.updateMany({
        data: { endedAt: new Date() },
        where: { endedAt: null, id: visit.id }
      });
      await writePlatformAudit(tx, {
        action: "support.end",
        actorUserId: actor.id,
        details: { supportSessionId: visit.id },
        targetTenantId: visit.tenantId
      });
    });
    // The academy's auth sessions for this visit (an academy table: in its academy).
    await runInTenant(visit.tenantId, "platform:support-end", () =>
      this.prisma.authSession.updateMany({
        data: { revokedAt: new Date() },
        where: { revokedAt: null, supportSessionId: visit.id }
      })
    );
    return { ok: true };
  }

  /** Every visit, for the console (one academy, or all). */
  async listForPlatform(accessToken: string | undefined, tenantId?: string): Promise<PlatformSupportSessionsResponse> {
    assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
    return { sessions: (await this.visits(tenantId)).map(toItem) };
  }

  /** The academy's own history: its super admins see every support visit (§I). */
  async listForAcademy(accessToken: string | undefined): Promise<PlatformSupportSessionsResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException("Only a super admin can see support visits.");
    return { sessions: (await this.visits(requireTenantId("supportVisits"))).map(toItem) };
  }

  private visits(tenantId?: string): Promise<SessionWithStaff[]> {
    return this.prisma.platformSupportSession.findMany({
      include: { staffUser: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: tenantId ? { tenantId } : {}
    });
  }
}

function toItem(visit: SessionWithStaff): PlatformSupportSessionItem {
  const now = Date.now();
  return {
    actionCount: visit.actionCount,
    createdAt: visit.createdAt.toISOString(),
    endedAt: visit.endedAt?.toISOString() ?? null,
    enteredAt: visit.enteredAt?.toISOString() ?? null,
    expiresAt: visit.expiresAt.toISOString(),
    id: visit.id,
    isActive: !visit.endedAt && visit.expiresAt.getTime() > now,
    reason: visit.reason,
    staffName: visit.staffUser ? [visit.staffUser.firstName, visit.staffUser.lastName].filter(Boolean).join(" ") : null,
    tenantId: visit.tenantId
  };
}
