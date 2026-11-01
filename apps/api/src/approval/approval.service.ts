import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  APPROVAL_ACTIONS,
  type ApprovalActionType,
  type ApprovalListQuery,
  type ApprovalRequestDto,
  type ApprovalRequestListResponse,
  type ApprovalRequestResponse,
  type CreateApprovalRequest
} from "@nexa-chess/types";
import { ApprovalStatus, Prisma, UserRole, type ApprovalRequest } from "@prisma/client";
import { authenticateUser, isAdminRole } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { APPROVAL_HANDLERS, type ApprovalActor, type ApprovalHandler } from "./approval-handler";

const requestInclude = {
  batch: { select: { name: true } },
  class: { select: { title: true, topic: true } },
  requester: { select: { firstName: true, lastName: true } },
  reviewer: { select: { firstName: true, lastName: true } },
  subjectUser: { select: { firstName: true, lastName: true } }
} satisfies Prisma.ApprovalRequestInclude;

type RequestRow = Prisma.ApprovalRequestGetPayload<{ include: typeof requestInclude }>;

const fullName = (u: { firstName: string; lastName: string | null } | null) =>
  u ? `${u.firstName} ${u.lastName ?? ""}`.trim() : null;

const HOUR = 3_600_000;

/**
 * The generic admin-approval engine (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
 * §2.3). Guarantees, enforced here once for every action:
 *  - only the catalogue's requester roles ask, only its reviewer roles decide;
 *  - nobody decides their own request (claim filter + DB CHECK);
 *  - one PENDING request per operation (DB partial unique index → 409);
 *  - an expired, cancelled or already-decided request can't be approved
 *    (status- and expiry-filtered claim → 409; no replay);
 *  - approval = claim + handler.revalidate + handler.execute + event row in ONE
 *    transaction, so a changed state (requester lost authority, target moved)
 *    executes nothing and leaves the request PENDING.
 */
@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);
  private readonly handlers: Map<ApprovalActionType, ApprovalHandler>;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    @Inject(APPROVAL_HANDLERS) handlers: ApprovalHandler[]
  ) {
    this.handlers = new Map(handlers.map((handler) => [handler.actionType, handler]));
  }

  /** Action types that can actually be requested right now. */
  registeredActionTypes(): ApprovalActionType[] {
    return [...this.handlers.keys()];
  }

  // ── Requester side ──

  async create(accessToken: string | undefined, dto: CreateApprovalRequest): Promise<ApprovalRequestResponse> {
    const user = await this.authenticate(accessToken);
    const meta = APPROVAL_ACTIONS[dto.actionType];
    const handler = this.handlers.get(dto.actionType);
    if (!meta || !handler) {
      throw new BadRequestException("This kind of request isn't available yet.");
    }
    if (!(meta.requesterRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException("Your role can't make this request.");
    }
    const payload = parseOrBadRequest(handler.payloadSchema, dto.payload, "payload");

    let created: ApprovalRequest;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const prepared = await handler.prepare(tx, user, payload);
        const ttlExpiry = new Date(Date.now() + meta.defaultTtlHours * HOUR);
        const expiresAt =
          prepared.expiresAt && prepared.expiresAt < ttlExpiry ? prepared.expiresAt : ttlExpiry;
        if (expiresAt.getTime() <= Date.now()) {
          throw new ConflictException("It's too late to ask for this.");
        }
        const row = await tx.approvalRequest.create({
          data: {
            actionType: dto.actionType,
            batchId: prepared.batchId ?? null,
            category: meta.category,
            classId: prepared.classId ?? null,
            currentValue: prepared.currentValue ?? Prisma.JsonNull,
            dedupeKey: prepared.dedupeKey,
            details: prepared.details ?? Prisma.JsonNull,
            expiresAt,
            reason: dto.reason,
            requestedValue: prepared.requestedValue,
            requesterId: user.id,
            requesterRole: user.role,
            subjectUserId: prepared.subjectUserId ?? null,
            urgent: Boolean(prepared.urgent || dto.urgent)
          }
        });
        await tx.approvalEvent.create({ data: { actorId: user.id, requestId: row.id, type: "CREATED" } });
        return row;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("There is already a pending request for this.");
      }
      throw error;
    }

    this.runAfterCommit(handler, created, "CREATED");
    return { request: await this.load(created.id) };
  }

  async listMine(accessToken: string | undefined, status?: ApprovalStatus): Promise<ApprovalRequestListResponse> {
    const user = await this.authenticate(accessToken);
    const rows = await this.prisma.approvalRequest.findMany({
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      where: { requesterId: user.id, ...(status ? { status } : {}) }
    });
    return { requests: rows.map((row) => this.toDto(row)) };
  }

  /** The requester reads their own request; reviewers read any. Others get a 404. */
  async get(accessToken: string | undefined, id: string): Promise<ApprovalRequestResponse> {
    const user = await this.authenticate(accessToken);
    const row = await this.prisma.approvalRequest.findUnique({ select: { requesterId: true }, where: { id } });
    if (!row || (!isAdminRole(user.role) && row.requesterId !== user.id)) {
      throw new NotFoundException("Request not found.");
    }
    return { request: await this.load(id, true) };
  }

  /** Reviewer read (the /admin route): 403 for everyone else, even the requester. */
  async getAsReviewer(accessToken: string | undefined, id: string): Promise<ApprovalRequestResponse> {
    await this.authenticateReviewer(accessToken);
    const exists = await this.prisma.approvalRequest.findUnique({ select: { id: true }, where: { id } });
    if (!exists) throw new NotFoundException("Request not found.");
    return { request: await this.load(id, true) };
  }

  async cancel(accessToken: string | undefined, id: string): Promise<ApprovalRequestResponse> {
    const user = await this.authenticate(accessToken);
    const existing = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!existing || existing.requesterId !== user.id) throw new NotFoundException("Request not found.");

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.approvalRequest.updateMany({
        data: { decidedAt: new Date(), status: ApprovalStatus.CANCELLED },
        where: { id, status: ApprovalStatus.PENDING }
      });
      if (count === 0) throw new ConflictException(`This request is already ${existing.status.toLowerCase()}.`);
      await tx.approvalEvent.create({ data: { actorId: user.id, requestId: id, type: "CANCELLED" } });
    });

    const handler = this.handlers.get(existing.actionType as ApprovalActionType);
    if (handler) this.runAfterCommit(handler, { ...existing, status: ApprovalStatus.CANCELLED }, "CANCELLED");
    return { request: await this.load(id, true) };
  }

  // ── Reviewer side ──

  async list(accessToken: string | undefined, query: ApprovalListQuery): Promise<ApprovalRequestListResponse> {
    await this.authenticateReviewer(accessToken);
    const rows = await this.prisma.approvalRequest.findMany({
      include: requestInclude,
      // Pending + urgent first, then the soonest to expire, then newest.
      orderBy: [{ status: "asc" }, { urgent: "desc" }, { expiresAt: "asc" }, { createdAt: "desc" }],
      take: 300,
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.actionType ? { actionType: query.actionType } : {}),
        ...(query.requesterId ? { requesterId: query.requesterId } : {}),
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.urgent ? { urgent: query.urgent === "true" } : {})
      }
    });
    return { requests: rows.map((row) => this.toDto(row)) };
  }

  async approve(accessToken: string | undefined, id: string, note?: string): Promise<ApprovalRequestResponse> {
    const reviewer = await this.authenticateReviewer(accessToken);
    const { handler, request } = await this.loadForDecision(id, reviewer);

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.claim(tx, request, reviewer.id, ApprovalStatus.APPROVED);
        await handler.revalidate(tx, request);
        const result = await handler.execute(tx, request, reviewer);
        await tx.approvalRequest.update({
          data: { executionResult: result ?? Prisma.JsonNull },
          where: { id }
        });
        await tx.approvalEvent.create({
          data: { actorId: reviewer.id, metadata: note ? { note } : Prisma.JsonNull, requestId: id, type: "APPROVED" }
        });
      });
    } catch (error) {
      // The transaction rolled back (claim included), so the request is still
      // PENDING. Record why the approval didn't go through, outside it.
      if (error instanceof ConflictException && !(error as { claimLost?: boolean }).claimLost) {
        await this.prisma.approvalEvent
          .create({
            data: {
              actorId: reviewer.id,
              metadata: { message: String((error.getResponse() as { message?: unknown }).message ?? error.message) },
              requestId: id,
              type: "REVALIDATION_FAILED"
            }
          })
          .catch((e: unknown) => this.logger.warn(`Could not record failed approval of ${id}: ${String(e)}`));
      }
      throw error;
    }

    const decided = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    this.runAfterCommit(handler, decided, "APPROVED");
    return { request: await this.load(id, true) };
  }

  async reject(accessToken: string | undefined, id: string, reason: string): Promise<ApprovalRequestResponse> {
    const reviewer = await this.authenticateReviewer(accessToken);
    const { handler, request } = await this.loadForDecision(id, reviewer);

    await this.prisma.$transaction(async (tx) => {
      await this.claim(tx, request, reviewer.id, ApprovalStatus.REJECTED, reason);
      await tx.approvalEvent.create({
        data: { actorId: reviewer.id, metadata: { reason }, requestId: id, type: "REJECTED" }
      });
    });

    const decided = await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
    this.runAfterCommit(handler, decided, "REJECTED");
    return { request: await this.load(id, true) };
  }

  // ── Expiry ──

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireOverdue(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.approvalExpiry, () => this.expireOverdueNow());
  }

  /** Marks every PENDING request past `expiresAt` EXPIRED, with an event each. */
  async expireOverdueNow(now = new Date()): Promise<number> {
    const overdue = await this.prisma.approvalRequest.findMany({
      select: { id: true },
      take: 500,
      where: { expiresAt: { lte: now }, status: ApprovalStatus.PENDING }
    });
    let expired = 0;
    for (const { id } of overdue) {
      await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.approvalRequest.updateMany({
          data: { decidedAt: now, status: ApprovalStatus.EXPIRED },
          where: { expiresAt: { lte: now }, id, status: ApprovalStatus.PENDING }
        });
        if (count === 1) {
          await tx.approvalEvent.create({ data: { requestId: id, type: "EXPIRED" } });
          expired += 1;
        }
      });
    }
    return expired;
  }

  // ── internals ──

  private async loadForDecision(id: string, reviewer: ApprovalActor) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Request not found.");
    const actionType = request.actionType as ApprovalActionType;
    const meta = APPROVAL_ACTIONS[actionType];
    const handler = this.handlers.get(actionType);
    if (!meta || !handler) throw new ConflictException("This kind of request can no longer be decided.");
    if (!(meta.reviewerRoles as readonly string[]).includes(reviewer.role)) {
      throw new ForbiddenException("Your role can't decide this request.");
    }
    if (request.requesterId === reviewer.id) {
      throw new ForbiddenException("You can't decide your own request.");
    }
    return { handler, request };
  }

  /**
   * The double-decision / expiry / self-review guard. A lost claim is tagged so
   * the caller doesn't log it as a revalidation failure.
   */
  private async claim(
    tx: PrismaTransactionClient,
    request: ApprovalRequest,
    reviewerId: string,
    status: ApprovalStatus,
    rejectionReason?: string
  ): Promise<void> {
    const now = new Date();
    const { count } = await tx.approvalRequest.updateMany({
      data: { decidedAt: now, rejectionReason: rejectionReason ?? null, reviewerId, status },
      where: {
        expiresAt: { gt: now },
        id: request.id,
        status: ApprovalStatus.PENDING,
        // Belt and braces: the DB CHECK refuses it too.
        NOT: { requesterId: reviewerId }
      }
    });
    if (count === 0) {
      const lost = new ConflictException(
        request.status !== ApprovalStatus.PENDING
          ? `This request is already ${request.status.toLowerCase()}.`
          : request.expiresAt <= now
            ? "This request has expired."
            : "This request was decided by someone else."
      );
      Object.assign(lost, { claimLost: true });
      throw lost;
    }
  }

  private runAfterCommit(
    handler: ApprovalHandler,
    request: ApprovalRequest,
    outcome: "CREATED" | "APPROVED" | "REJECTED" | "CANCELLED"
  ) {
    if (!handler.afterCommit) return;
    try {
      // A handler may be async; its rejection must be logged, not left unhandled.
      const result: unknown = handler.afterCommit(request, outcome);
      void Promise.resolve(result).catch((error: unknown) =>
        this.logger.warn(`afterCommit(${outcome}) failed for ${request.id}: ${String(error)}`)
      );
    } catch (error) {
      this.logger.warn(`afterCommit(${outcome}) failed for ${request.id}: ${String(error)}`);
    }
  }

  private async load(id: string, withEvents = false): Promise<ApprovalRequestDto> {
    const row = await this.prisma.approvalRequest.findUniqueOrThrow({ include: requestInclude, where: { id } });
    const dto = this.toDto(row);
    if (withEvents) {
      const events = await this.prisma.approvalEvent.findMany({
        include: { actor: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
        where: { requestId: id }
      });
      dto.events = events.map((event) => ({
        actorName: fullName(event.actor),
        createdAt: event.createdAt.toISOString(),
        id: event.id,
        metadata: (event.metadata as Record<string, unknown> | null) ?? null,
        type: event.type
      }));
    }
    return dto;
  }

  private toDto(row: RequestRow): ApprovalRequestDto {
    const actionType = row.actionType as ApprovalActionType;
    return {
      actionLabel: APPROVAL_ACTIONS[actionType]?.label ?? row.actionType,
      actionType,
      batchId: row.batchId,
      batchName: row.batch?.name ?? null,
      category: row.category as ApprovalRequestDto["category"],
      classId: row.classId,
      classTitle: row.class ? row.class.title || row.class.topic || "Untitled class" : null,
      createdAt: row.createdAt.toISOString(),
      currentValue: row.currentValue,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      details: row.details,
      expiresAt: row.expiresAt.toISOString(),
      id: row.id,
      reason: row.reason,
      rejectionReason: row.rejectionReason,
      requestedValue: row.requestedValue,
      requesterId: row.requesterId,
      requesterName: fullName(row.requester),
      requesterRole: row.requesterRole,
      reviewerName: fullName(row.reviewer),
      status: row.status,
      subjectUserId: row.subjectUserId,
      subjectUserName: fullName(row.subjectUser),
      urgent: row.urgent
    };
  }

  private authenticate(accessToken: string | undefined): Promise<ApprovalActor> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private async authenticateReviewer(accessToken: string | undefined): Promise<ApprovalActor> {
    const user = await this.authenticate(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only admins can review requests.");
    }
    return user;
  }
}
