import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  DEFAULT_TENANT_ID,
  RESERVED_TENANT_SLUGS,
  type AddPlatformTenantDomainRequest,
  type CreatePlatformTenantRequest,
  type PlatformAuditResponse,
  type PlatformDomainCheckResponse,
  type PlatformTenantDetail,
  type PlatformTenantDomainItem,
  type PlatformTenantResponse,
  type PlatformTenantsResponse,
  type PlatformTenantStatusRequest,
  type PlatformTenantSummary,
  type UpdatePlatformTenantRequest
} from "@nexa-chess/types";
import {
  Prisma,
  TenantDomainKind,
  TenantDomainStatus,
  TenantStatus,
  TenantSubscriptionEventSource,
  TenantSubscriptionStatus,
  UserRole,
  UserStatus,
  type TenantDomain
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { createOpaqueToken, hashOpaqueToken, hashSecret } from "../auth/auth.utils";
import { SystemNotifier } from "../mail/system-notifier.service";
import { isUniqueViolation } from "../payments/payments.util";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { normalizeHostname } from "../tenancy/hostname";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { DomainCheckService } from "../tenancy/domain-check.service";
import { TenantResolverService } from "../tenancy/tenant-resolver.service";
import { EntitlementService } from "./entitlement.service";
import { PlanRestrictionException } from "./plan-restriction.exception";
import { assertPlatformOperator, writePlatformAudit } from "./platform-operator";

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

type TenantWithRelations = Prisma.TenantGetPayload<{
  include: { domains: true; subscription: { include: { plan: true } } };
}>;

const TENANT_INCLUDE = { domains: true, subscription: { include: { plan: true } } } as const;

/**
 * The platform console's academies (docs/SAAS_MULTI_TENANCY.md §H, §I; Phase
 * 4b). Every route is a platform operator's (§E). Reads of academy-owned rows
 * (usage, users) run inside that academy (`runInTenant`); platform tables
 * (tenants, domains, subscriptions) are read directly.
 */
const REMOVED_HOLD_MS = 30 * 86_400_000;

@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);
  private readonly env = getApiEnv();

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly notifier: SystemNotifier,
    private readonly prisma: PrismaService,
    private readonly resolver: TenantResolverService,
    private readonly domainCheck: DomainCheckService
  ) {}

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  // ── reads ───────────────────────────────────────────────

  async list(accessToken: string | undefined): Promise<PlatformTenantsResponse> {
    await this.operator(accessToken);
    const tenants = await this.prisma.tenant.findMany({ include: TENANT_INCLUDE, orderBy: { createdAt: "asc" } });
    return {
      rootDomain: this.env.PLATFORM_ROOT_DOMAIN,
      tenants: await Promise.all(tenants.map((tenant) => this.summary(tenant)))
    };
  }

  async get(accessToken: string | undefined, tenantId: string): Promise<PlatformTenantResponse> {
    await this.operator(accessToken);
    return { tenant: await this.detail(tenantId) };
  }

  async audit(
    accessToken: string | undefined,
    query: { cursor?: string; tenantId?: string }
  ): Promise<PlatformAuditResponse> {
    await this.operator(accessToken);
    const take = 50;
    const rows = await this.prisma.platformAuditLog.findMany({
      include: { actor: { select: { firstName: true, lastName: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      where: query.tenantId ? { targetTenantId: query.tenantId } : {}
    });
    const page = rows.slice(0, take);
    return {
      entries: page.map((row) => ({
        action: row.action,
        actorName: row.actor ? [row.actor.firstName, row.actor.lastName].filter(Boolean).join(" ") : null,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt.toISOString(),
        details: (row.details ?? {}) as Record<string, unknown>,
        id: row.id,
        reason: row.reason,
        targetTenantId: row.targetTenantId
      })),
      nextCursor: rows.length > take ? page[page.length - 1].id : null
    };
  }

  // ── create ──────────────────────────────────────────────

  /**
   * One transaction (§H): the academy, its subdomain, its subscription on the
   * chosen plan, its hidden "Platform support" user and its first super admin
   * with a set-password link. A repeat of the same idempotency key returns the
   * academy the first call made.
   */
  async create(accessToken: string | undefined, body: CreatePlatformTenantRequest): Promise<PlatformTenantResponse> {
    const actor = await this.operator(accessToken);
    const repeat = await this.prisma.tenant.findUnique({ select: { id: true }, where: { creationKey: body.idempotencyKey } });
    if (repeat) return { tenant: await this.detail(repeat.id) };

    if (RESERVED_TENANT_SLUGS.has(body.slug)) throw new BadRequestException("That address is reserved.");
    const hostname = normalizeHostname(`${body.slug}.${this.env.PLATFORM_ROOT_DOMAIN}`);
    if (!hostname) throw new BadRequestException("That address isn't valid.");
    const plan = await this.prisma.platformPlan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.isActive) throw new NotFoundException("Plan not found.");
    const [slugTaken, hostTaken] = await Promise.all([
      this.prisma.tenant.findUnique({ select: { id: true }, where: { slug: body.slug } }),
      this.prisma.tenantDomain.findUnique({ select: { id: true }, where: { hostname } })
    ]);
    if (slugTaken || hostTaken) throw new ConflictException("That address is already taken.");
    // Emails are unique across the platform until §D5 drops the global index.
    const emailTaken = await asPlatform("platform: is this email free platform-wide", () =>
      this.prisma.withDeleted.user.findFirst({ select: { id: true }, where: { email: body.superAdmin.email } })
    );
    if (emailTaken) {
      throw new ConflictException(
        "That email already has an account on the platform. Use another address for this academy's super admin."
      );
    }

    const tenantId = `tenant_${randomBytes(9).toString("hex")}`;
    const inviteToken = createOpaqueToken();
    const now = new Date();
    const trialing = plan.trialDays > 0;
    try {
      await runInTenant(tenantId, "platform:create-tenant", async () => {
        const [supportPassword, adminPassword] = await Promise.all([
          hashSecret(createOpaqueToken()),
          hashSecret(createOpaqueToken())
        ]);
        await this.prisma.$transaction(async (tx) => {
          await tx.tenant.create({
            data: {
              country: body.country,
              creationKey: body.idempotencyKey,
              id: tenantId,
              name: body.name,
              slug: body.slug,
              timezone: body.timezone
            }
          });
          await tx.tenantDomain.create({
            data: {
              hostname,
              isPrimary: true,
              kind: TenantDomainKind.SUBDOMAIN,
              status: TenantDomainStatus.ACTIVE,
              tenantId
            }
          });
          const subscription = await tx.tenantSubscription.create({
            data: {
              currentPeriodStart: now,
              planId: plan.id,
              status: trialing ? TenantSubscriptionStatus.TRIALING : TenantSubscriptionStatus.ACTIVE,
              tenantId,
              trialEndsAt: trialing ? new Date(now.getTime() + plan.trialDays * DAY_MS) : null
            }
          });
          await tx.tenantSubscriptionEvent.create({
            data: {
              actorUserId: actor.id,
              note: "Academy created",
              source: TenantSubscriptionEventSource.ADMIN,
              subscriptionId: subscription.id,
              tenantId,
              toPlanCode: plan.code,
              toStatus: subscription.status
            }
          });
          await tx.user.create({
            data: {
              email: `support+${tenantId}@platform.invalid`,
              firstName: "Platform",
              isEmailVerified: true,
              isPlatformSupport: true,
              lastName: "support",
              password: supportPassword,
              role: UserRole.SUPER_ADMIN,
              status: UserStatus.ACTIVE
            }
          });
          const admin = await tx.user.create({
            data: {
              email: body.superAdmin.email,
              firstName: body.superAdmin.firstName,
              isEmailVerified: true,
              lastName: body.superAdmin.lastName ?? null,
              password: adminPassword,
              role: UserRole.SUPER_ADMIN,
              status: UserStatus.ACTIVE
            }
          });
          await tx.passwordResetToken.create({
            data: {
              expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
              tokenHash: hashOpaqueToken(inviteToken),
              userId: admin.id
            }
          });
          await writePlatformAudit(tx, {
            action: "tenant.create",
            actorUserId: actor.id,
            details: { hostname, planCode: plan.code, slug: body.slug, superAdminEmail: body.superAdmin.email },
            targetTenantId: tenantId
          });
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.prisma.tenant.findUnique({ select: { id: true }, where: { creationKey: body.idempotencyKey } });
        if (raced) return { tenant: await this.detail(raced.id) };
        throw new ConflictException("That address or email is already taken.");
      }
      throw error;
    }

    this.resolver.invalidate(hostname);
    this.entitlements.invalidate(tenantId);
    const link = new URL("/reset-password", this.academyOrigin(hostname));
    link.searchParams.set("token", inviteToken);
    // No phone is collected for the first super admin, so in practice this is the email.
    void runInTenant(tenantId, "platform:invite", async () => {
      const sent = await this.notifier.send(
        "ACADEMY_ADMIN_INVITE",
        { email: body.superAdmin.email },
        { "links.reset": link.toString(), "recipient.firstName": body.superAdmin.firstName }
      );
      if (sent.outcomes.EMAIL === "FAILED") this.logger.error(`Invite email for ${tenantId} failed: ${sent.errors.EMAIL}`);
    }).catch((error: unknown) => this.logger.error(`Invite for ${tenantId} failed`, error as Error));
    return { tenant: await this.detail(tenantId) };
  }

  // ── edit, suspend, reactivate ───────────────────────────

  async update(
    accessToken: string | undefined,
    tenantId: string,
    body: UpdatePlatformTenantRequest
  ): Promise<PlatformTenantResponse> {
    const actor = await this.operator(accessToken);
    await this.tenantOrThrow(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({ data: body, where: { id: tenantId } });
      await writePlatformAudit(tx, { action: "tenant.update", actorUserId: actor.id, details: body, targetTenantId: tenantId });
    });
    this.entitlements.invalidate(tenantId);
    return { tenant: await this.detail(tenantId) };
  }

  /** Locks the academy (members can't use it; nothing is deleted). Nexa itself can't be suspended. */
  async suspend(accessToken: string | undefined, tenantId: string, body: PlatformTenantStatusRequest) {
    return this.setStatus(accessToken, tenantId, body, TenantStatus.SUSPENDED);
  }

  async reactivate(accessToken: string | undefined, tenantId: string, body: PlatformTenantStatusRequest) {
    return this.setStatus(accessToken, tenantId, body, TenantStatus.ACTIVE);
  }

  private async setStatus(
    accessToken: string | undefined,
    tenantId: string,
    body: PlatformTenantStatusRequest,
    status: TenantStatus
  ): Promise<PlatformTenantResponse> {
    const actor = await this.operator(accessToken);
    const tenant = await this.tenantOrThrow(tenantId);
    if (tenantId === DEFAULT_TENANT_ID) throw new BadRequestException("The platform's own academy can't be suspended.");
    if (tenant.status === TenantStatus.DEACTIVATED) throw new BadRequestException("This academy is deactivated.");
    if (tenant.status !== status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.tenant.update({ data: { status }, where: { id: tenantId } });
        await writePlatformAudit(tx, {
          action: status === TenantStatus.SUSPENDED ? "tenant.suspend" : "tenant.reactivate",
          actorUserId: actor.id,
          details: { from: tenant.status, to: status },
          reason: body.reason,
          targetTenantId: tenantId
        });
      });
      this.entitlements.invalidate(tenantId);
    }
    return { tenant: await this.detail(tenantId) };
  }

  // ── domains ─────────────────────────────────────────────

  /**
   * A full domain starts PENDING: the owner points it at the server by hand
   * (§H "Full domains"), and the domain check (Phase 5) or an operator makes it
   * ACTIVE. Nothing resolves to the academy until then.
   */
  async addDomain(
    accessToken: string | undefined,
    tenantId: string,
    body: AddPlatformTenantDomainRequest
  ): Promise<PlatformTenantResponse> {
    const actor = await this.operator(accessToken);
    await this.tenantOrThrow(tenantId);
    const hostname = normalizeHostname(body.hostname);
    if (!hostname || !hostname.includes(".")) throw new BadRequestException("That isn't a domain name.");
    if (hostname === this.env.PLATFORM_ROOT_DOMAIN || hostname.endsWith(`.${this.env.PLATFORM_ROOT_DOMAIN}`)) {
      throw new BadRequestException("Addresses under the platform's own domain are given by the academy's slug.");
    }
    // An academy's own domain is a plan feature (§F, owner decision N-9: each branding item is catalogued).
    if (!(await this.entitlements.getState(tenantId)).features.includes("customDomain")) {
      throw PlanRestrictionException.featureRequired("customDomain");
    }
    const existing = await this.prisma.tenantDomain.findUnique({ where: { hostname } });
    if (existing && existing.status !== TenantDomainStatus.REMOVED) throw new ConflictException("That domain is already in use.");
    // §H: a removed hostname is held for 30 days before another academy can claim it.
    if (existing && existing.tenantId !== tenantId && Date.now() - existing.updatedAt.getTime() < REMOVED_HOLD_MS) {
      throw new ConflictException("That domain was removed from another academy recently; it is held for 30 days.");
    }
    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.tenantDomain.update({
          data: { isPrimary: false, kind: TenantDomainKind.CUSTOM, status: TenantDomainStatus.PENDING, tenantId },
          where: { id: existing.id }
        });
      } else {
        await tx.tenantDomain.create({ data: { hostname, kind: TenantDomainKind.CUSTOM, tenantId } });
      }
      await writePlatformAudit(tx, { action: "domain.add", actorUserId: actor.id, details: { hostname }, targetTenantId: tenantId });
    });
    this.resolver.invalidate(hostname);
    return { tenant: await this.detail(tenantId) };
  }

  /**
   * The console's "check" (§H "Full domains"): proves the host's `/api` rule
   * reaches this deployment, then marks a PENDING domain ACTIVE. The result
   * is kept on the row either way.
   */
  async checkDomain(accessToken: string | undefined, tenantId: string, domainId: string): Promise<PlatformDomainCheckResponse> {
    const actor = await this.operator(accessToken);
    const domain = await this.domainOrThrow(tenantId, domainId);
    if (domain.status === TenantDomainStatus.REMOVED) throw new BadRequestException("That domain was removed.");
    const scheme = getFrontendUrl(this.env).startsWith("http://") ? "http" : "https";
    const outcome = await this.domainCheck.check(domain.hostname, scheme);
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantDomain.update({
        data: {
          lastCheckResult: outcome.result.slice(0, 500),
          lastCheckedAt: new Date(),
          ...(outcome.ok && domain.status === TenantDomainStatus.PENDING ? { status: TenantDomainStatus.ACTIVE } : {})
        },
        where: { id: domain.id }
      });
      await writePlatformAudit(tx, {
        action: "domain.check",
        actorUserId: actor.id,
        details: { hostname: domain.hostname, ok: outcome.ok },
        targetTenantId: tenantId
      });
    });
    this.resolver.invalidate(domain.hostname);
    return outcome;
  }

  async removeDomain(accessToken: string | undefined, tenantId: string, domainId: string): Promise<PlatformTenantResponse> {
    const actor = await this.operator(accessToken);
    const domain = await this.domainOrThrow(tenantId, domainId);
    if (domain.kind === TenantDomainKind.SUBDOMAIN) throw new BadRequestException("An academy keeps its platform subdomain.");
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantDomain.update({ data: { isPrimary: false, status: TenantDomainStatus.REMOVED }, where: { id: domain.id } });
      if (domain.isPrimary) await this.promoteSubdomain(tx, tenantId);
      await writePlatformAudit(tx, {
        action: "domain.remove",
        actorUserId: actor.id,
        details: { hostname: domain.hostname },
        targetTenantId: tenantId
      });
    });
    this.resolver.invalidate(domain.hostname);
    return { tenant: await this.detail(tenantId) };
  }

  async makePrimary(accessToken: string | undefined, tenantId: string, domainId: string): Promise<PlatformTenantResponse> {
    const actor = await this.operator(accessToken);
    const domain = await this.domainOrThrow(tenantId, domainId);
    if (domain.status !== TenantDomainStatus.ACTIVE) throw new BadRequestException("Only an active domain can be primary.");
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantDomain.updateMany({ data: { isPrimary: false }, where: { tenantId } });
      await tx.tenantDomain.update({ data: { isPrimary: true }, where: { id: domain.id } });
      await writePlatformAudit(tx, {
        action: "domain.primary",
        actorUserId: actor.id,
        details: { hostname: domain.hostname },
        targetTenantId: tenantId
      });
    });
    return { tenant: await this.detail(tenantId) };
  }

  // ── helpers ─────────────────────────────────────────────

  private async promoteSubdomain(tx: PrismaTransactionClient, tenantId: string) {
    const subdomain = await tx.tenantDomain.findFirst({
      where: { kind: TenantDomainKind.SUBDOMAIN, status: TenantDomainStatus.ACTIVE, tenantId }
    });
    if (subdomain) await tx.tenantDomain.update({ data: { isPrimary: true }, where: { id: subdomain.id } });
  }

  private async tenantOrThrow(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Academy not found.");
    return tenant;
  }

  private async domainOrThrow(tenantId: string, domainId: string): Promise<TenantDomain> {
    const domain = await this.prisma.tenantDomain.findFirst({ where: { id: domainId, tenantId } });
    if (!domain) throw new NotFoundException("Domain not found.");
    return domain;
  }

  /** The academy's web origin, on the scheme this deployment uses. */
  private academyOrigin(hostname: string): string {
    const scheme = getFrontendUrl(this.env).startsWith("http://") ? "http" : "https";
    return `${scheme}://${hostname}`;
  }

  private async detail(tenantId: string): Promise<PlatformTenantDetail> {
    const tenant = await this.prisma.tenant.findUnique({ include: TENANT_INCLUDE, where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Academy not found.");
    const [summary, state] = await Promise.all([this.summary(tenant), this.entitlements.getState(tenantId)]);
    return {
      ...summary,
      domains: tenant.domains
        .filter((domain) => domain.status !== TenantDomainStatus.REMOVED)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.hostname.localeCompare(b.hostname))
        .map(toDomainItem),
      limits: state.limits
    };
  }

  private async summary(tenant: TenantWithRelations): Promise<PlatformTenantSummary> {
    const [state, usage] = await Promise.all([
      this.entitlements.getState(tenant.id),
      runInTenant(tenant.id, "platform:usage", () => this.entitlements.getUsage())
    ]);
    const primary = tenant.domains.find((domain) => domain.isPrimary && domain.status === TenantDomainStatus.ACTIVE);
    return {
      accessMode: state.accessMode,
      country: tenant.country,
      createdAt: tenant.createdAt.toISOString(),
      id: tenant.id,
      name: tenant.name,
      plan: tenant.subscription ? { code: tenant.subscription.plan.code, name: tenant.subscription.plan.name } : null,
      primaryHost: primary?.hostname ?? null,
      slug: tenant.slug,
      status: tenant.status,
      subscriptionStatus: tenant.subscription?.status ?? null,
      timezone: tenant.timezone,
      usage
    };
  }
}

function toDomainItem(domain: TenantDomain): PlatformTenantDomainItem {
  return {
    hostname: domain.hostname,
    id: domain.id,
    isPrimary: domain.isPrimary,
    kind: domain.kind,
    lastCheckResult: domain.lastCheckResult,
    lastCheckedAt: domain.lastCheckedAt?.toISOString() ?? null,
    status: domain.status
  };
}
