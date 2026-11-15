import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  addContentPackItemRequestSchema,
  API_ROUTES,
  changeTenantPlanRequestSchema,
  contentPackRequestSchema,
  createPlatformPlanRequestSchema,
  duplicatePlatformPlanRequestSchema,
  platformDealRequestSchema,
  recordPlatformPaymentRequestSchema,
  startSupportSessionRequestSchema,
  transitionTenantSubscriptionRequestSchema,
  type AddContentPackItemRequest,
  type ChangeTenantPlanRequest,
  type ContentPackRequest,
  type CreatePlatformPlanRequest,
  type DuplicatePlatformPlanRequest,
  type PlatformDealRequest,
  type RecordPlatformPaymentRequest,
  type StartSupportSessionRequest,
  type TransitionTenantSubscriptionRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryString } from "../common/query-params";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { ContentPacksService } from "./content-packs.service";
import { PlatformPlansService } from "./platform-plans.service";
import { PlatformSubscriptionsService } from "./platform-subscriptions.service";
import { PlatformSupportService } from "./platform-support.service";

/** Platform console: plans, subscriptions, support visits, content packs (docs/SAAS_MULTI_TENANCY.md §G, §I). */
@Controller()
export class PlatformConsoleController {
  constructor(
    private readonly packs: ContentPacksService,
    private readonly plans: PlatformPlansService,
    private readonly subscriptions: PlatformSubscriptionsService,
    private readonly support: PlatformSupportService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── plans ──

  @Post(API_ROUTES.platform.plans)
  createPlan(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createPlatformPlanRequestSchema)) body: CreatePlatformPlanRequest
  ) {
    return this.plans.create(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.platform.planDuplicate())
  duplicatePlan(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(duplicatePlatformPlanRequestSchema)) body: DuplicatePlatformPlanRequest
  ) {
    return this.plans.duplicate(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.platform.planRetire())
  retirePlan(@Req() request: Request, @Param("id") id: string) {
    return this.plans.retire(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.platform.planApplyToExisting())
  applyPlanToExisting(@Req() request: Request, @Param("id") id: string) {
    return this.plans.applyToExisting(this.getAccessToken(request), id);
  }

  // ── an academy's subscription ──

  @Post(API_ROUTES.platform.tenantPlan())
  changePlan(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(changeTenantPlanRequestSchema)) body: ChangeTenantPlanRequest
  ) {
    return this.subscriptions.changePlan(this.getAccessToken(request), tenantId, body);
  }

  @Post(API_ROUTES.platform.tenantTransition())
  transition(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(transitionTenantSubscriptionRequestSchema)) body: TransitionTenantSubscriptionRequest
  ) {
    return this.subscriptions.transition(this.getAccessToken(request), tenantId, body);
  }

  @Post(API_ROUTES.platform.tenantPayments())
  recordPayment(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(recordPlatformPaymentRequestSchema)) body: RecordPlatformPaymentRequest
  ) {
    return this.subscriptions.recordPayment(this.getAccessToken(request), tenantId, body);
  }

  @Put(API_ROUTES.platform.tenantDeal())
  setDeal(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(platformDealRequestSchema)) body: PlatformDealRequest
  ) {
    return this.subscriptions.setDeal(this.getAccessToken(request), tenantId, body);
  }

  // ── support visits ──

  @Post(API_ROUTES.platform.tenantSupport())
  startSupport(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(startSupportSessionRequestSchema)) body: StartSupportSessionRequest
  ) {
    return this.support.start(this.getAccessToken(request), tenantId, body);
  }

  @Get(API_ROUTES.platform.supportSessions)
  supportSessions(@Req() request: Request, @Query() query: Record<string, unknown>) {
    return this.support.listForPlatform(this.getAccessToken(request), queryString(query.tenantId, "tenantId"));
  }

  @Post(API_ROUTES.platform.supportSessionEnd())
  endSupport(@Req() request: Request, @Param("id") id: string) {
    return this.support.end(this.getAccessToken(request), id);
  }

  // ── content packs ──

  @Get(API_ROUTES.platform.contentPacks)
  listPacks(@Req() request: Request) {
    return this.packs.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.platform.contentPacks)
  createPack(@Req() request: Request, @Body(new ZodBodyPipe(contentPackRequestSchema)) body: ContentPackRequest) {
    return this.packs.create(this.getAccessToken(request), body);
  }

  @Put(API_ROUTES.platform.contentPack())
  updatePack(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(contentPackRequestSchema)) body: ContentPackRequest
  ) {
    return this.packs.update(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.platform.contentPackItems())
  addPackItem(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(addContentPackItemRequestSchema)) body: AddContentPackItemRequest
  ) {
    return this.packs.addItem(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.platform.contentPackItem())
  removePackItem(@Req() request: Request, @Param("id") id: string, @Param("itemId") itemId: string) {
    return this.packs.removeItem(this.getAccessToken(request), id, itemId);
  }
}

/** The academy's side: its support-visit history and the content packs its plan includes. */
@Controller()
export class AcademyPlatformController {
  constructor(
    private readonly packs: ContentPacksService,
    private readonly support: PlatformSupportService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.subscription.supportVisits)
  supportVisits(@Req() request: Request) {
    return this.support.listForAcademy(this.getAccessToken(request));
  }

  @Get(API_ROUTES.subscription.contentPacks)
  contentPacks(@Req() request: Request) {
    return this.packs.listForAcademy(this.getAccessToken(request));
  }

  @Get(API_ROUTES.subscription.contentPackFolder())
  contentPackFolder(@Req() request: Request, @Param("packId") packId: string, @Param("itemId") itemId: string) {
    return this.packs.folder(this.getAccessToken(request), packId, itemId);
  }

  @Post(API_ROUTES.subscription.contentPackFolderCopy())
  copyContentPackFolder(@Req() request: Request, @Param("packId") packId: string, @Param("itemId") itemId: string) {
    return this.packs.copyFolder(this.getAccessToken(request), packId, itemId);
  }
}
