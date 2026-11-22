import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  ACADEMY_CLOSURE_UNDO_DAYS,
  approveClosureSchema,
  closureNameMatches,
  closureNoteSchema,
  DEFAULT_TENANT_ID,
  operatorCloseAcademySchema,
  requestAcademyClosureSchema,
  TENANT_CLOSURE_CHOICE_LABELS,
  type AcademyClosureResponse,
  type AcademyPurgeReport,
  type TenantClosureResponse,
  type TenantClosuresResponse,
  type TenantClosureSummary
} from "@nexa-chess/types";
import {
  Prisma,
  TenantClosureChoice,
  TenantClosureStatus,
  TenantStatus,
  UserRole,
  UserStatus,
  type Tenant,
  type TenantClosure
} from "@prisma/client";
import type { Response } from "express";
import { authenticateUser } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { queryEnum, queryString } from "../common/query-params";
import { SystemNotifier } from "../mail/system-notifier.service";
import { isUniqueViolation } from "../payments/payments.util";
import { EntitlementService } from "../platform/entitlement.service";
import { assertPlatformOperator, writePlatformAudit } from "../platform/platform-operator";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { asPlatform, currentTenantId, runInTenant } from "../tenancy/tenant-context";
import { TenantResolverService } from "../tenancy/tenant-resolver.service";
import { AcademyExportService } from "./academy-export.service";

const DAY_MS = 24 * 60 * 60_000;

type ClosureWithTenant = TenantClosure & { tenant: Pick<Tenant, "name" | "slug"> };

/**
 * Closing an academy (docs/ACADEMY_CLOSURE.md). The academy's super admin asks
 * (keep the data, or delete it); a platform operator approves or declines. An
 * approval deactivates the academy at once. "Delete" also schedules the purge
 * after ACADEMY_CLOSURE_UNDO_DAYS, which an operator can still cancel; the
 * purge itself is `AcademyPurgeService`. Every decision is in the platform
 * audit log, in the same transaction as the change.
 */
@Injectable()
export class AcademyClosureService {
  private readonly logger = new Logger(AcademyClosureService.name);
  private readonly frontendUrl = getFrontendUrl(getApiEnv()).replace(/\/+$/, "");

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly exporter: AcademyExportService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly resolver: TenantResolverService,
    @Optional() private readonly notifier?: SystemNotifier
  ) {}

  // ── the academy's side ───────────────────────────────────────────────────

  /** The open request, else the latest one; null when the academy never asked. */
  async current(accessToken: string | undefined): Promise<AcademyClosureResponse> {
    const { tenantId } = await this.academySuperAdmin(accessToken);
    const rows = await asPlatform("academy closure: own requests", () =>
      this.prisma.tenantClosure.findMany({
        include: { tenant: { select: { name: true, slug: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
        where: { tenantId }
      })
    );
    return { closure: rows[0] ? toSummary(rows[0]) : null };
  }

  async request(accessToken: string | undefined, body: unknown): Promise<TenantClosureResponse> {
    const { tenantId, user } = await this.academySuperAdmin(accessToken);
    const input = parseOrBadRequest(requestAcademyClosureSchema, body);
    if (tenantId === DEFAULT_TENANT_ID) throw new BadRequestException("The platform's own academy can't be closed.");
    const tenant = await this.tenantOrThrow(tenantId);
    if (!closureNameMatches(input.confirmName, tenant.name)) {
      throw new BadRequestException("The name you typed doesn't match the academy's name.");
    }
    let created: TenantClosure;
    try {
      created = await this.prisma.$transaction((tx) =>
        asPlatform("academy closure: request", () =>
          tx.tenantClosure.create({
            data: {
              choice: input.choice,
              reason: input.reason,
              requestedByEmail: user.email,
              requestedByName: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
              requestedByUserId: user.id,
              tenantId
            }
          })
        )
      );
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("The academy already has an open request to close.");
      throw error;
    }
    void this.alertOperators(tenant, created);
    return { closure: await this.summary(created.id) };
  }

  async withdraw(accessToken: string | undefined): Promise<TenantClosureResponse> {
    const { tenantId } = await this.academySuperAdmin(accessToken);
    const open = await asPlatform("academy closure: withdraw", () =>
      this.prisma.tenantClosure.findFirst({ where: { status: TenantClosureStatus.REQUESTED, tenantId } })
    );
    if (!open) throw new NotFoundException("There is no request waiting to be withdrawn.");
    await this.claim(open.id, [TenantClosureStatus.REQUESTED], { status: TenantClosureStatus.WITHDRAWN });
    return { closure: await this.summary(open.id) };
  }

  /** The academy's own data, before it closes (it can't be signed in to afterwards). */
  async exportOwn(accessToken: string | undefined, res: Response): Promise<void> {
    const { tenantId } = await this.academySuperAdmin(accessToken);
    await this.exporter.stream(tenantId, res);
  }

  // ── the platform console ─────────────────────────────────────────────────

  async list(accessToken: string | undefined, query: Record<string, unknown> = {}): Promise<TenantClosuresResponse> {
    await this.operator(accessToken);
    const { page, pageSize, skip, take } = resolvePagination(query);
    const status = queryEnum(query.status, TenantClosureStatus, "status");
    const tenantId = queryString(query.tenantId, "tenantId");
    const where: Prisma.TenantClosureWhereInput = { ...(status ? { status } : {}), ...(tenantId ? { tenantId } : {}) };
    const [rows, total] = await asPlatform("academy closure: console list", () =>
      Promise.all([
        this.prisma.tenantClosure.findMany({
          include: { tenant: { select: { name: true, slug: true } } },
          orderBy: { createdAt: "desc" },
          skip,
          take,
          where
        }),
        this.prisma.tenantClosure.count({ where })
      ])
    );
    return { closures: rows.map(toSummary), pagination: paginationMeta(total, page, pageSize) };
  }

  async approve(accessToken: string | undefined, closureId: string, body: unknown): Promise<TenantClosureResponse> {
    const actor = await this.operator(accessToken);
    const input = parseOrBadRequest(approveClosureSchema, body);
    const closure = await this.closureOrThrow(closureId);
    if (closure.status !== TenantClosureStatus.REQUESTED) throw new ConflictException("This request was already decided.");
    if (!closureNameMatches(input.confirmName, closure.tenant.name)) {
      throw new BadRequestException("The name you typed doesn't match the academy's name.");
    }
    await this.prisma.$transaction(async (tx) => {
      await this.closeInTx(tx, closure, actor.id, input.note ?? null);
    });
    await this.afterClose(closure.tenantId);
    void this.tellRequester(closureId);
    return { closure: await this.summary(closureId) };
  }

  /** A request the academy made by email or phone, recorded and decided in one step. */
  async operatorClose(accessToken: string | undefined, tenantId: string, body: unknown): Promise<TenantClosureResponse> {
    const actor = await this.operator(accessToken);
    const input = parseOrBadRequest(operatorCloseAcademySchema, body);
    if (tenantId === DEFAULT_TENANT_ID) throw new BadRequestException("The platform's own academy can't be closed.");
    const tenant = await this.tenantOrThrow(tenantId);
    if (tenant.status === TenantStatus.DEACTIVATED) throw new ConflictException("This academy is already closed.");
    if (!closureNameMatches(input.confirmName, tenant.name)) {
      throw new BadRequestException("The name you typed doesn't match the academy's name.");
    }
    let closureId: string;
    try {
      closureId = await this.prisma.$transaction(async (tx) => {
        const created = await asPlatform("academy closure: operator records a request", () =>
          tx.tenantClosure.create({ data: { choice: input.choice, reason: input.reason, tenantId } })
        );
        await this.closeInTx(tx, { ...created, tenant: { name: tenant.name, slug: tenant.slug } }, actor.id, null);
        return created.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException("The academy already has an open request to close: approve or decline it instead.");
      }
      throw error;
    }
    await this.afterClose(tenantId);
    return { closure: await this.summary(closureId) };
  }

  async decline(accessToken: string | undefined, closureId: string, body: unknown): Promise<TenantClosureResponse> {
    const actor = await this.operator(accessToken);
    const { note } = parseOrBadRequest(closureNoteSchema, body);
    const closure = await this.closureOrThrow(closureId);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(closureId, [TenantClosureStatus.REQUESTED], this.decided(actor.id, note, TenantClosureStatus.DECLINED), tx);
      await writePlatformAudit(tx, {
        action: "tenant.closure.decline",
        actorUserId: actor.id,
        details: { choice: closure.choice, closureId },
        reason: note,
        targetTenantId: closure.tenantId
      });
    });
    void this.tellRequester(closureId);
    return { closure: await this.summary(closureId) };
  }

  /** Stops a scheduled deletion; the academy stays closed with its data (it can then be reopened). */
  async cancelPurge(accessToken: string | undefined, closureId: string, body: unknown): Promise<TenantClosureResponse> {
    const actor = await this.operator(accessToken);
    const { note } = parseOrBadRequest(closureNoteSchema, body);
    const closure = await this.closureOrThrow(closureId);
    await this.prisma.$transaction(async (tx) => {
      await this.claim(
        closureId,
        [TenantClosureStatus.PURGE_SCHEDULED],
        { ...this.decided(actor.id, note, TenantClosureStatus.CANCELLED), purgeAfter: null },
        tx
      );
      await writePlatformAudit(tx, {
        action: "tenant.closure.cancel-purge",
        actorUserId: actor.id,
        details: { closureId },
        reason: note,
        targetTenantId: closure.tenantId
      });
    });
    return { closure: await this.summary(closureId) };
  }

  /** Opens a closed academy again (its data was kept). Only the academy's latest closure can be reopened. */
  async reopen(accessToken: string | undefined, closureId: string, body: unknown): Promise<TenantClosureResponse> {
    const actor = await this.operator(accessToken);
    const { note } = parseOrBadRequest(closureNoteSchema, body);
    const closure = await this.closureOrThrow(closureId);
    const latest = await asPlatform("academy closure: latest", () =>
      this.prisma.tenantClosure.findFirst({ orderBy: { createdAt: "desc" }, where: { tenantId: closure.tenantId } })
    );
    if (latest?.id !== closureId) throw new ConflictException("Only the academy's latest closure can be reopened.");
    await this.prisma.$transaction(async (tx) => {
      await this.claim(
        closureId,
        [TenantClosureStatus.CLOSED, TenantClosureStatus.CANCELLED],
        this.decided(actor.id, note, TenantClosureStatus.REOPENED),
        tx
      );
      const reopened = await tx.tenant.updateMany({
        data: { status: TenantStatus.ACTIVE },
        where: { id: closure.tenantId, status: TenantStatus.DEACTIVATED }
      });
      if (reopened.count !== 1) throw new ConflictException("The academy isn't closed.");
      await writePlatformAudit(tx, {
        action: "tenant.reopen",
        actorUserId: actor.id,
        details: { closureId },
        reason: note,
        targetTenantId: closure.tenantId
      });
    });
    await this.invalidate(closure.tenantId);
    return { closure: await this.summary(closureId) };
  }

  /** Any academy's data, for a platform operator (also after it closed, until it is purged). */
  async exportTenant(accessToken: string | undefined, tenantId: string, res: Response): Promise<void> {
    const actor = await this.operator(accessToken);
    await this.tenantOrThrow(tenantId);
    await writePlatformAudit(this.prisma, { action: "tenant.export", actorUserId: actor.id, targetTenantId: tenantId });
    await this.exporter.stream(tenantId, res);
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Approving: KEEP_DATA → CLOSED, DELETE_DATA → PURGE_SCHEDULED; the academy is
   * deactivated (no address resolves, crons skip it, nobody can sign in) and its
   * sessions are revoked, all in the caller's transaction.
   */
  private async closeInTx(tx: PrismaTransactionClient, closure: ClosureWithTenant, actorId: string, note: string | null) {
    const deleting = closure.choice === TenantClosureChoice.DELETE_DATA;
    const now = new Date();
    await this.claim(
      closure.id,
      [TenantClosureStatus.REQUESTED],
      {
        ...this.decided(actorId, note, deleting ? TenantClosureStatus.PURGE_SCHEDULED : TenantClosureStatus.CLOSED),
        purgeAfter: deleting ? new Date(now.getTime() + ACADEMY_CLOSURE_UNDO_DAYS * DAY_MS) : null
      },
      tx
    );
    const closed = await tx.tenant.updateMany({
      data: { status: TenantStatus.DEACTIVATED },
      where: { id: closure.tenantId, status: { not: TenantStatus.DEACTIVATED } }
    });
    if (closed.count !== 1) throw new ConflictException("This academy is already closed.");
    await runInTenant(closure.tenantId, "academy closure: end sessions", () =>
      tx.authSession.updateMany({ data: { revokedAt: now }, where: { revokedAt: null } })
    );
    await writePlatformAudit(tx, {
      action: "tenant.close",
      actorUserId: actorId,
      details: { choice: closure.choice, closureId: closure.id, requestedBy: closure.requestedByUserId ? "academy" : "operator" },
      reason: note ?? closure.reason,
      targetTenantId: closure.tenantId
    });
  }

  private decided(actorId: string, note: string | null, status: TenantClosureStatus) {
    return { decidedAt: new Date(), decidedByUserId: actorId, decisionNote: note, status };
  }

  /** Status-filtered claim: a concurrent decision from the same state loses with a 409. */
  private async claim(
    closureId: string,
    from: TenantClosureStatus[],
    data: Prisma.TenantClosureUpdateManyMutationInput,
    tx: Pick<PrismaTransactionClient, "tenantClosure"> = this.prisma
  ) {
    const claimed = await asPlatform("academy closure: claim", () =>
      tx.tenantClosure.updateMany({ data, where: { id: closureId, status: { in: from } } })
    );
    if (claimed.count !== 1) throw new ConflictException("This request changed meanwhile; reload and try again.");
  }

  private async afterClose(tenantId: string) {
    await this.invalidate(tenantId);
    this.logger.log(`Academy ${tenantId} closed`);
  }

  private async invalidate(tenantId: string) {
    const domains = await asPlatform("academy closure: hosts", () =>
      this.prisma.tenantDomain.findMany({ select: { hostname: true }, where: { tenantId } })
    );
    for (const { hostname } of domains) this.resolver.invalidate(hostname);
    this.entitlements.invalidate(tenantId);
  }

  private async summary(closureId: string): Promise<TenantClosureSummary> {
    return toSummary(await this.closureOrThrow(closureId));
  }

  private async closureOrThrow(closureId: string): Promise<ClosureWithTenant> {
    const closure = await asPlatform("academy closure: read", () =>
      this.prisma.tenantClosure.findUnique({
        include: { tenant: { select: { name: true, slug: true } } },
        where: { id: closureId }
      })
    );
    if (!closure) throw new NotFoundException("Closure request not found.");
    return closure;
  }

  private async tenantOrThrow(tenantId: string): Promise<Tenant> {
    const tenant = await asPlatform("academy closure: tenant", () => this.prisma.tenant.findUnique({ where: { id: tenantId } }));
    if (!tenant) throw new NotFoundException("Academy not found.");
    return tenant;
  }

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  /** The academy's own super admin (its primary role; an admin acting as one can't close the academy). */
  private async academySuperAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN || user.isPlatformSupport) {
      throw new ForbiddenException("Only the academy's super admin can do this.");
    }
    const tenantId = currentTenantId() ?? user.tenantId;
    return { tenantId, user };
  }

  /** To Nexa's operators. Never throws: the stored request is the record. */
  private async alertOperators(tenant: Tenant, closure: TenantClosure): Promise<void> {
    if (!this.notifier) return;
    try {
      await runInTenant(DEFAULT_TENANT_ID, "academy closure: alert operators", async () => {
        const operators = await this.prisma.user.findMany({
          select: { email: true, id: true, phoneNumber: true },
          where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE }
        });
        if (operators.length === 0) return;
        await this.notifier!.send(
          "ACADEMY_CLOSURE_REQUESTED",
          operators.map((operator) => ({ email: operator.email, phone: operator.phoneNumber, userId: operator.id })),
          {
            "closure.academy": tenant.name,
            "closure.choice": TENANT_CLOSURE_CHOICE_LABELS[closure.choice],
            "closure.reason": closure.reason ?? "",
            "links.closures": `${this.frontendUrl}/admin/platform?tab=closures`
          },
          { dedupeKey: closure.id }
        );
      });
    } catch (error) {
      this.logger.error(`Closure alert for ${tenant.id} failed: ${(error as Error).message}`);
    }
  }

  /** Tells the super admin who asked what was decided (email, as switched on). Never throws. */
  private async tellRequester(closureId: string): Promise<void> {
    if (!this.notifier) return;
    try {
      const closure = await this.closureOrThrow(closureId);
      if (!closure.requestedByEmail) return;
      const outcome = describeOutcome(closure);
      if (!outcome) return;
      await runInTenant(closure.tenantId, "academy closure: tell requester", () =>
        this.notifier!.send(
          "ACADEMY_CLOSURE_DECIDED",
          { email: closure.requestedByEmail },
          { "closure.outcome": outcome, "recipient.firstName": closure.requestedByName?.split(" ")[0] ?? "" }
        )
      );
    } catch (error) {
      this.logger.error(`Closure decision email for ${closureId} failed: ${(error as Error).message}`);
    }
  }
}

function describeOutcome(closure: TenantClosure): string | null {
  const note = closure.decisionNote ? `\n\nNote from the platform: ${closure.decisionNote}` : "";
  if (closure.status === TenantClosureStatus.CLOSED) {
    return `Your academy is now closed. Its data is kept, and the platform can reopen it if you ask.${note}`;
  }
  if (closure.status === TenantClosureStatus.PURGE_SCHEDULED && closure.purgeAfter) {
    return (
      `Your academy is now closed. Its data will be deleted after ${closure.purgeAfter.toISOString().slice(0, 10)} (UTC); ` +
      `until then the platform can still stop it if you ask. Invoices and payment records are kept as the law requires.${note}`
    );
  }
  if (closure.status === TenantClosureStatus.DECLINED) {
    return `Your request to close the academy was declined, so the academy carries on as before.${note}`;
  }
  return null;
}

function toSummary(row: ClosureWithTenant): TenantClosureSummary {
  return {
    choice: row.choice,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionNote: row.decisionNote,
    id: row.id,
    purgeAfter: row.purgeAfter?.toISOString() ?? null,
    purgedAt: row.purgedAt?.toISOString() ?? null,
    purgeReport: (row.purgeReport as AcademyPurgeReport | null) ?? null,
    reason: row.reason,
    requestedAt: row.requestedAt.toISOString(),
    requestedByEmail: row.requestedByEmail,
    requestedByName: row.requestedByName,
    status: row.status,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    tenantSlug: row.tenant.slug
  };
}
