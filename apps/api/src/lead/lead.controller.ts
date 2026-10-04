import { randomUUID } from "crypto";
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { getApiEnv, getCookieBaseOptions } from "@nexa-chess/config/api";
import {
  API_ROUTES,
  assignLeadDemoClassRequestSchema,
  createLeadNoteRequestSchema,
  createLeadRequestSchema,
  trackVisitRequestSchema,
  updateLeadStatusRequestSchema,
  type AssignLeadDemoClassRequest,
  type CreateLeadNoteRequest,
  type CreateLeadRequest,
  type PaginatedQuery,
  type TrackVisitRequest,
  type UpdateLeadStatusRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LeadService } from "./lead.service";
import { TRACKING_COOKIE_NAMES, TRACKING_COOKIE_PATH, VISITOR_ID_MAX_AGE } from "./types/tracking-cookie.types";

@Controller()
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  private getClientIp(request: Request): string {
    return (
      request.ip ||
      request.socket.remoteAddress ||
      (request.headers["x-forwarded-for"] as string | undefined) ||
      "unknown"
    );
  }

  // ── Public ──

  @Post(API_ROUTES.leads.create)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createLead(
    @Body(new ZodBodyPipe(createLeadRequestSchema)) body: CreateLeadRequest,
    @Req() request: Request
  ) {
    return this.leadService.createLead(body, {
      sessionId: request.cookies?.[TRACKING_COOKIE_NAMES.sessionId]
    });
  }

  @Post(API_ROUTES.leads.tracking)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async trackVisit(
    @Body(new ZodBodyPipe(trackVisitRequestSchema)) body: TrackVisitRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ) {
    const existingVisitorId = request.cookies?.[TRACKING_COOKIE_NAMES.visitorId];
    const existingSessionId = request.cookies?.[TRACKING_COOKIE_NAMES.sessionId];
    const visitorId = existingVisitorId ?? randomUUID();
    const sessionId = existingSessionId ?? randomUUID();

    await this.leadService.trackVisit({
      visitorId,
      sessionId,
      url: body.url,
      referrer: body.referrer,
      userAgent: request.headers["user-agent"],
      ipAddress: this.getClientIp(request)
    });

    if (!existingVisitorId || !existingSessionId) {
      this.setTrackingCookies(response, visitorId, sessionId);
    }

    return { ok: true };
  }

  private setTrackingCookies(response: Response, visitorId: string, sessionId: string) {
    const base = getCookieBaseOptions(getApiEnv());

    response.cookie(TRACKING_COOKIE_NAMES.visitorId, visitorId, {
      ...base,
      httpOnly: true,
      maxAge: VISITOR_ID_MAX_AGE,
      path: TRACKING_COOKIE_PATH
    });
    // Session cookie — no `maxAge`, expires when the browser session ends.
    response.cookie(TRACKING_COOKIE_NAMES.sessionId, sessionId, {
      ...base,
      httpOnly: true,
      path: TRACKING_COOKIE_PATH
    });
  }

  // ── Admin ──

  @Get(API_ROUTES.adminLeads.list)
  list(@Req() request: Request, @Query() query: PaginatedQuery & { status?: string }) {
    return this.leadService.list(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.adminLeads.metrics)
  getMetrics(@Req() request: Request) {
    return this.leadService.getMetrics(this.getAccessToken(request));
  }

  @Get(API_ROUTES.adminLeads.get())
  getDetails(@Param("id") id: string, @Req() request: Request) {
    return this.leadService.getDetails(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.adminLeads.updateStatus())
  updateStatus(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateLeadStatusRequestSchema)) body: UpdateLeadStatusRequest
  ) {
    return this.leadService.updateStatus(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminLeads.assignDemoClass())
  assignDemoClass(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(assignLeadDemoClassRequestSchema)) body: AssignLeadDemoClassRequest
  ) {
    return this.leadService.assignDemoClass(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminLeads.notes())
  addNote(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(createLeadNoteRequestSchema)) body: CreateLeadNoteRequest
  ) {
    return this.leadService.addNote(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminLeads.delete())
  delete(@Param("id") id: string, @Req() request: Request) {
    return this.leadService.delete(this.getAccessToken(request), id);
  }
}
