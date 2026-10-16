import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  createBatchPlanRequestSchema,
  createDiscountRequestSchema,
  createOfflinePaymentMethodRequestSchema,
  createPlanRequestSchema,
  createRefundRequestSchema,
  paymentListQuerySchema,
  rejectManualPaymentRequestSchema,
  updateDiscountRequestSchema,
  updateOfflinePaymentMethodRequestSchema,
  updatePlanRequestSchema,
  type CreateBatchPlanRequest,
  type CreateDiscountRequest,
  type CreateOfflinePaymentMethodRequest,
  type CreatePlanRequest,
  type CreateRefundRequest,
  manualPaymentReviewStatusSchema,
  type ManualPaymentReviewStatus,
  type RejectManualPaymentRequest,
  type UpdateDiscountRequest,
  type UpdateOfflinePaymentMethodRequest,
  type UpdatePlanRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryEnum } from "../common/query-params";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { BatchPricingService } from "./batch-pricing.service";
import { DiscountService } from "./discount.service";
import { InvoiceService } from "./invoice.service";
import { ManualPaymentService } from "./manual-payment.service";
import { OfflinePaymentMethodService } from "./offline-payment-method.service";
import { PaymentService } from "./payment.service";
import { PaymentsAdminService } from "./payments-admin.service";
import { assertAdmin, authenticateUser } from "./payments-auth.helper";
import { PlanService } from "./plan.service";
import { RefundService } from "./refund.service";
import { SubscriptionService } from "./subscription.service";

/** Admin payment dashboard, refunds, plan catalogue and routing config. */
@Controller()
export class PaymentsAdminController {
  constructor(
    private readonly admin: PaymentsAdminService,
    private readonly batchPricing: BatchPricingService,
    private readonly discounts: DiscountService,
    private readonly invoices: InvoiceService,
    private readonly jwtService: JwtService,
    private readonly manualPayments: ManualPaymentService,
    private readonly offlineMethods: OfflinePaymentMethodService,
    private readonly payments: PaymentService,
    private readonly plans: PlanService,
    private readonly prisma: PrismaService,
    private readonly refunds: RefundService,
    private readonly subscriptions: SubscriptionService
  ) {}

  @Get(API_ROUTES.adminPayments.overview)
  async overview(@Req() request: Request) {
    return this.admin.overview(await this.adminUser(request));
  }

  @Get(API_ROUTES.adminPayments.list)
  async list(@Query() query: unknown, @Req() request: Request) {
    const admin = await this.adminUser(request);
    return this.admin.list(admin, parseOrBadRequest(paymentListQuerySchema, query));
  }

  @Get(API_ROUTES.adminPayments.export)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="payments.csv"')
  async exportCsv(@Query() query: unknown, @Req() request: Request) {
    const admin = await this.adminUser(request);
    return this.admin.exportCsv(admin, parseOrBadRequest(paymentListQuerySchema, query));
  }

  @Get(API_ROUTES.adminPayments.refunds)
  async listRefunds(@Req() request: Request) {
    await this.adminUser(request);
    return { refunds: await this.refunds.list() };
  }

  @Get(API_ROUTES.adminPayments.subscriptions)
  async listSubscriptions(@Req() request: Request) {
    await this.adminUser(request);
    return { subscriptions: await this.subscriptions.listAll() };
  }

  @Get(API_ROUTES.adminPayments.invoices)
  async listInvoices(@Req() request: Request) {
    await this.adminUser(request);
    return { invoices: await this.invoices.listAll() };
  }

  @Get(API_ROUTES.adminPayments.providerHealth)
  async providerHealth(@Req() request: Request) {
    await this.adminUser(request);
    return this.admin.providerHealth();
  }

  @Get(API_ROUTES.adminPayments.routing)
  async getRouting(@Req() request: Request) {
    await this.adminUser(request);
    return this.admin.getRouting();
  }

  @Put(API_ROUTES.adminPayments.routing)
  async saveRouting(@Body() body: unknown, @Req() request: Request) {
    const admin = await this.adminUser(request);
    return this.admin.saveRouting(admin, body);
  }

  // ── Plans ──

  @Get(API_ROUTES.adminPayments.plans)
  async listPlans(@Req() request: Request) {
    const admin = await this.adminUser(request);
    return this.plans.list(admin);
  }

  @Post(API_ROUTES.adminPayments.plans)
  async createPlan(
    @Body(new ZodBodyPipe(createPlanRequestSchema)) body: CreatePlanRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.plans.create(body);
  }

  @Put(API_ROUTES.adminPayments.plan())
  async updatePlan(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updatePlanRequestSchema)) body: UpdatePlanRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.plans.update(id, body);
  }

  /** Archives. A plan carrying financial history is never actually deleted. */
  @Delete(API_ROUTES.adminPayments.plan())
  async archivePlan(@Param("id") id: string, @Req() request: Request) {
    await this.adminUser(request);
    return this.plans.archive(id);
  }

  // ── Discounts ──

  @Get(API_ROUTES.adminPayments.discounts)
  async listDiscounts(@Req() request: Request) {
    await this.adminUser(request);
    return { discounts: await this.discounts.list() };
  }

  @Post(API_ROUTES.adminPayments.discounts)
  async createDiscount(
    @Body(new ZodBodyPipe(createDiscountRequestSchema)) body: CreateDiscountRequest,
    @Req() request: Request
  ) {
    const admin = await this.adminUser(request);
    return this.discounts.create(admin, body);
  }

  @Put(API_ROUTES.adminPayments.discount())
  async updateDiscount(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateDiscountRequestSchema)) body: UpdateDiscountRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.discounts.update(id, body);
  }

  /** Deactivates instead of deleting once a code has been claimed. */
  @Delete(API_ROUTES.adminPayments.discount())
  async deleteDiscount(@Param("id") id: string, @Req() request: Request) {
    await this.adminUser(request);
    return this.discounts.remove(id);
  }

  // ── Per-batch pricing ──

  @Get(API_ROUTES.adminPayments.batchPricing())
  async getBatchPricing(@Param("batchId") batchId: string, @Req() request: Request) {
    await this.adminUser(request);
    return this.batchPricing.get(batchId);
  }

  @Post(API_ROUTES.adminPayments.batchPricing())
  async createBatchPlan(
    @Param("batchId") batchId: string,
    @Body(new ZodBodyPipe(createBatchPlanRequestSchema))
    body: CreateBatchPlanRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.batchPricing.create(batchId, body);
  }

  @Put(API_ROUTES.adminPayments.batchPlan())
  async updateBatchPlan(
    @Param("batchId") batchId: string,
    @Param("planId") planId: string,
    @Body(new ZodBodyPipe(updatePlanRequestSchema)) body: UpdatePlanRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.batchPricing.update(batchId, planId, body);
  }

  @Delete(API_ROUTES.adminPayments.batchPlan())
  async archiveBatchPlan(
    @Param("batchId") batchId: string,
    @Param("planId") planId: string,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.batchPricing.archive(batchId, planId);
  }

  // ── Manual / offline payments ──
  //
  // Registered before "One payment" below: /admin/payments/manual would
  // otherwise be shadowed by /admin/payments/:id (Nest/Express match routes
  // in registration order, and a dynamic segment matches "manual" as an id).

  @Get(API_ROUTES.adminPayments.manual.list)
  async listManualPayments(@Query("status") status: string | undefined, @Req() request: Request) {
    await this.adminUser(request);
    return this.manualPayments.listAll(
      queryEnum<ManualPaymentReviewStatus>(status, manualPaymentReviewStatusSchema.options, "status")
    );
  }

  @Post(API_ROUTES.adminPayments.manual.approve())
  async approveManualPayment(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.adminUser(request);
    return this.manualPayments.approve(admin, id);
  }

  @Post(API_ROUTES.adminPayments.manual.reject())
  async rejectManualPayment(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectManualPaymentRequestSchema))
    body: RejectManualPaymentRequest,
    @Req() request: Request
  ) {
    const admin = await this.adminUser(request);
    return this.manualPayments.reject(admin, id, body.reason);
  }

  @Get(API_ROUTES.adminPayments.manual.methods)
  async listOfflineMethods(@Req() request: Request) {
    await this.adminUser(request);
    return { methods: await this.offlineMethods.list() };
  }

  @Post(API_ROUTES.adminPayments.manual.methods)
  async createOfflineMethod(
    @Body(new ZodBodyPipe(createOfflinePaymentMethodRequestSchema))
    body: CreateOfflinePaymentMethodRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.offlineMethods.create(body);
  }

  @Put(API_ROUTES.adminPayments.manual.method())
  async updateOfflineMethod(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateOfflinePaymentMethodRequestSchema))
    body: UpdateOfflinePaymentMethodRequest,
    @Req() request: Request
  ) {
    await this.adminUser(request);
    return this.offlineMethods.update(id, body);
  }

  // ── One payment ──

  @Get(API_ROUTES.adminPayments.get())
  async getPayment(@Param("id") id: string, @Req() request: Request) {
    await this.adminUser(request);
    return this.admin.getPayment(id);
  }

  /** Re-reads a payment from its gateway. The safe first move on any dispute. */
  @Post(API_ROUTES.adminPayments.reconcile())
  async reconcile(@Param("id") id: string, @Req() request: Request) {
    await this.adminUser(request);
    await this.payments.reconcile(id);
    return this.payments.buildStatus(await this.payments.requirePayment(id));
  }

  @Post(API_ROUTES.adminPayments.refund())
  async refund(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(createRefundRequestSchema)) body: CreateRefundRequest,
    @Req() request: Request
  ) {
    const admin = await this.adminUser(request);
    return this.refunds.create(admin, id, body);
  }

  private async adminUser(request: Request) {
    return assertAdmin(
      await authenticateUser(
        this.jwtService,
        this.prisma,
        request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
      )
    );
  }
}
