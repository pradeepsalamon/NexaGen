import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  approvalListQuerySchema,
  approvalStatusSchema,
  createApprovalRequestSchema,
  decideApprovalRequestSchema,
  rejectApprovalRequestSchema,
  type CreateApprovalRequest,
  type DecideApprovalRequest,
  type RejectApprovalRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryString, queryEnum } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { ApprovalOptionsService } from "./approval-options.service";
import { ApprovalService } from "./approval.service";
import { RequestQueuesService } from "./request-queues.service";

@Controller()
export class ApprovalController {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly options: ApprovalOptionsService,
    private readonly queues: RequestQueuesService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── Requester ──

  @Post(API_ROUTES.approvals.create)
  create(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createApprovalRequestSchema)) body: CreateApprovalRequest
  ) {
    return this.approvals.create(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.approvals.mine)
  mine(@Req() request: Request, @Query("status") status?: unknown) {
    return this.approvals.listMine(
      this.getAccessToken(request),
      queryEnum(status, approvalStatusSchema.options, "status")
    );
  }

  @Get(API_ROUTES.approvals.studentOptions)
  studentOptions(@Req() request: Request, @Query("q") q?: unknown) {
    return this.options.students(this.getAccessToken(request), optionalQueryString(q, "q"));
  }

  @Get(API_ROUTES.approvals.substituteOptions())
  substituteOptions(@Req() request: Request, @Param("id") id: string) {
    return this.options.substitutes(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.approvals.get())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.approvals.get(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.approvals.cancel())
  cancel(@Req() request: Request, @Param("id") id: string) {
    return this.approvals.cancel(this.getAccessToken(request), id);
  }

  // ── Reviewer ──

  @Get(API_ROUTES.adminApprovals.list)
  list(@Req() request: Request, @Query() query: Record<string, unknown>) {
    const parsed = parseOrBadRequest(approvalListQuerySchema, query, "query");
    return this.approvals.list(this.getAccessToken(request), parsed);
  }

  // Registered before `get(:id)`, which would otherwise take "queues" as an id.
  @Get(API_ROUTES.adminApprovals.queues)
  async otherQueues(@Req() request: Request) {
    const reviewer = await this.approvals.authenticateReviewer(this.getAccessToken(request));
    return this.queues.list(reviewer);
  }

  @Get(API_ROUTES.adminApprovals.get())
  adminGet(@Req() request: Request, @Param("id") id: string) {
    return this.approvals.getAsReviewer(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminApprovals.approve())
  approve(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(decideApprovalRequestSchema)) body: DecideApprovalRequest
  ) {
    return this.approvals.approve(this.getAccessToken(request), id, body.note || undefined);
  }

  @Post(API_ROUTES.adminApprovals.reject())
  reject(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectApprovalRequestSchema)) body: RejectApprovalRequest
  ) {
    return this.approvals.reject(this.getAccessToken(request), id, body.reason);
  }
}
