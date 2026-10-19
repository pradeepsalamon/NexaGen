import { BadRequestException, Body, NotFoundException, Controller, Get, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  cancelPayrollPeriodSchema,
  closeCompensationRateSchema,
  createCompensationRateSchema,
  createPayoutSchema,
  createPayrollAdjustmentSchema,
  createPayrollPeriodSchema,
  createPayrollRuleSchema,
  markPayoutPaidSchema,
  reversePayrollAdjustmentSchema,
  updateCompensationProfileSchema,
  updatePayrollRuleSchema,
  type CancelPayrollPeriodRequest,
  type CloseCompensationRateRequest,
  type CreateCompensationRateRequest,
  type CreatePayoutRequest,
  type CreatePayrollAdjustmentRequest,
  type CreatePayrollPeriodRequest,
  type CreatePayrollRuleRequest,
  type MarkPayoutPaidRequest,
  type ReversePayrollAdjustmentRequest,
  type UpdateCompensationProfileRequest,
  type UpdatePayrollRuleRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { optionalQueryString } from "../common/query-params";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { safeFilename, sendPdf } from "../payments/invoices.controller";
import { PrismaService } from "../prisma/prisma.service";
import { assertAdmin, authenticateUser } from "./payroll-auth.helper";
import { CompensationProfileService } from "./compensation-profile.service";
import { PayoutService } from "./payout.service";
import { PayrollAdjustmentService } from "./payroll-adjustment.service";
import { PayrollAuditService } from "./payroll-audit.service";
import { PayrollCalculationService } from "./payroll-calculation.service";
import { PayrollLifecycleService } from "./payroll-lifecycle.service";
import { PayrollPeriodService } from "./payroll-period.service";
import { PayrollRecordService } from "./payroll-record.service";
import { PayrollRuleService } from "./payroll-rule.service";
import { PayslipGenerationService } from "./payslip-generation.service";
import { RequireFeature } from "../platform/require-feature.decorator";

/**
 * Admin → Finance → Coach Payroll. Every route asserts an admin role
 * (`ADMIN`/`SUPER_ADMIN` — CLAUDE.md payroll notes: no granular Finance/
 * Payroll Admin role for now). Auth is the token-string pattern (§3.2): the
 * controller lifts the raw cookie, the service verifies.
 */
@RequireFeature("coachPayroll")
@Controller()
export class PayrollAdminController {
  constructor(
    private readonly adjustments: PayrollAdjustmentService,
    private readonly audit: PayrollAuditService,
    private readonly calculation: PayrollCalculationService,
    private readonly compensationProfiles: CompensationProfileService,
    private readonly jwtService: JwtService,
    private readonly lifecycle: PayrollLifecycleService,
    private readonly payouts: PayoutService,
    private readonly periods: PayrollPeriodService,
    private readonly prisma: PrismaService,
    private readonly records: PayrollRecordService,
    private readonly rules: PayrollRuleService,
    private readonly payslips: PayslipGenerationService
  ) {}

  // ── Periods ──

  @Get(API_ROUTES.adminPayroll.periods)
  async listPeriods(@Req() request: Request) {
    await this.admin(request);
    return this.periods.list();
  }

  @Post(API_ROUTES.adminPayroll.periods)
  async createPeriod(
    @Body(new ZodBodyPipe(createPayrollPeriodSchema)) dto: CreatePayrollPeriodRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { period: await this.periods.create(admin.id, dto) };
  }

  @Get(API_ROUTES.adminPayroll.period())
  async getPeriod(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    return { period: await this.periods.get(id) };
  }

  @Post(API_ROUTES.adminPayroll.calculatePeriod())
  async calculatePeriod(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    await this.calculation.calculatePeriod(id);
    return { period: await this.periods.get(id) };
  }

  @Post(API_ROUTES.adminPayroll.approvePeriod())
  async approvePeriod(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    return { period: await this.lifecycle.approve(id, admin.id) };
  }

  @Post(API_ROUTES.adminPayroll.finalizePeriod())
  async finalizePeriod(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    return { period: await this.lifecycle.finalize(id, admin.id) };
  }

  @Post(API_ROUTES.adminPayroll.markPaidPeriod())
  async markPeriodPaid(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    return { period: await this.lifecycle.markPaid(id, admin.id) };
  }

  @Post(API_ROUTES.adminPayroll.recalculatePeriod())
  async recalculatePeriod(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    return { period: await this.lifecycle.recalculate(id, admin.id) };
  }

  @Post(API_ROUTES.adminPayroll.cancelPeriod())
  async cancelPeriod(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(cancelPayrollPeriodSchema)) dto: CancelPayrollPeriodRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { period: await this.lifecycle.cancel(id, admin.id, dto.reason) };
  }

  // ── Records ──

  @Get(API_ROUTES.adminPayroll.records)
  async listRecords(@Query("periodId") periodId: unknown, @Req() request: Request) {
    await this.admin(request);
    return this.records.listForPeriod(this.requirePeriodId(periodId));
  }

  @Get(API_ROUTES.adminPayroll.record())
  async getRecord(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    return { record: await this.records.get(id) };
  }

  @Post(API_ROUTES.adminPayroll.recalculateRecord())
  async recalculateRecord(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    // Recalculation always runs for the whole period (the engine iterates
    // every in-scope coach together), never a single coach in isolation —
    // this endpoint is a convenience that resolves the record to its period.
    const record = await this.records.getOrThrow(id);
    await this.lifecycle.recalculate(record.periodId, admin.id);
    return { record: await this.records.get(id) };
  }

  @Get(API_ROUTES.adminPayroll.audit())
  async auditTrail(@Param("recordId") recordId: string, @Req() request: Request) {
    await this.admin(request);
    return { entries: await this.audit.listForRecord(recordId) };
  }

  // ── Adjustments ──

  @Get(API_ROUTES.adminPayroll.adjustments())
  async listAdjustments(@Param("recordId") recordId: string, @Req() request: Request) {
    await this.admin(request);
    return this.adjustments.list(recordId);
  }

  @Post(API_ROUTES.adminPayroll.adjustments())
  async createAdjustment(
    @Param("recordId") recordId: string,
    @Body(new ZodBodyPipe(createPayrollAdjustmentSchema)) dto: CreatePayrollAdjustmentRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { adjustment: await this.adjustments.create(recordId, admin.id, dto) };
  }

  @Post(API_ROUTES.adminPayroll.reverseAdjustment())
  async reverseAdjustment(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(reversePayrollAdjustmentSchema)) dto: ReversePayrollAdjustmentRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { adjustment: await this.adjustments.reverse(id, admin.id, dto) };
  }

  // ── Compensation profiles & rates ──

  @Get(API_ROUTES.adminPayroll.compensationProfiles)
  async listCompensationProfiles(@Req() request: Request) {
    await this.admin(request);
    return { profiles: await this.compensationProfiles.listProfiles() };
  }

  @Get(API_ROUTES.adminPayroll.compensationProfile())
  async getCompensationProfile(@Param("coachId") coachId: string, @Req() request: Request) {
    await this.admin(request);
    return { profile: await this.compensationProfiles.getProfile(coachId) };
  }

  @Put(API_ROUTES.adminPayroll.compensationProfile())
  async updateCompensationProfile(
    @Param("coachId") coachId: string,
    @Body(new ZodBodyPipe(updateCompensationProfileSchema)) dto: UpdateCompensationProfileRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { profile: await this.compensationProfiles.updateProfile(coachId, admin.id, dto) };
  }

  @Get(API_ROUTES.adminPayroll.compensationRates())
  async listCompensationRates(@Param("coachId") coachId: string, @Req() request: Request) {
    await this.admin(request);
    return { rates: await this.compensationProfiles.listRates(coachId) };
  }

  @Post(API_ROUTES.adminPayroll.compensationRates())
  async addCompensationRate(
    @Param("coachId") coachId: string,
    @Body(new ZodBodyPipe(createCompensationRateSchema)) dto: CreateCompensationRateRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { rate: await this.compensationProfiles.addRate(coachId, admin.id, dto) };
  }

  @Post(API_ROUTES.adminPayroll.closeCompensationRate())
  async closeCompensationRate(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(closeCompensationRateSchema)) dto: CloseCompensationRateRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { rate: await this.compensationProfiles.closeRate(id, admin.id, dto.effectiveTo) };
  }

  // ── Rules ──

  @Get(API_ROUTES.adminPayroll.rules)
  async listRules(@Req() request: Request) {
    await this.admin(request);
    return this.rules.list();
  }

  @Post(API_ROUTES.adminPayroll.rules)
  async createRule(
    @Body(new ZodBodyPipe(createPayrollRuleSchema)) dto: CreatePayrollRuleRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { rule: await this.rules.create(admin.id, dto) };
  }

  @Get(API_ROUTES.adminPayroll.rule())
  async getRule(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    return { rule: await this.rules.get(id) };
  }

  @Put(API_ROUTES.adminPayroll.rule())
  async updateRule(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updatePayrollRuleSchema)) dto: UpdatePayrollRuleRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { rule: await this.rules.update(id, admin.id, dto) };
  }

  // ── Payslips ──

  @Get(API_ROUTES.adminPayroll.payslipPdf())
  async payslipPdf(@Param("id") id: string, @Req() request: Request, @Res() response: Response) {
    await this.admin(request);
    const payslip = await this.prisma.payslip.findUnique({ where: { id } });
    if (!payslip) throw new NotFoundException("Payslip not found.");
    const pdf = await this.payslips.getPayslipPdf(id);
    sendPdf(response, `${safeFilename(payslip.documentNumber)}.pdf`, pdf);
  }

  @Post(API_ROUTES.adminPayroll.retryPayslipPdf())
  async retryPayslipPdf(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    await this.payslips.enqueue(id, { force: true });
    return { queued: true };
  }

  // ── Payouts ──

  @Get(API_ROUTES.adminPayroll.payouts)
  async listPayouts(@Query("periodId") periodId: unknown, @Req() request: Request) {
    await this.admin(request);
    return this.payouts.listForPeriod(this.requirePeriodId(periodId));
  }

  @Post(API_ROUTES.adminPayroll.payouts)
  async createPayout(
    @Body(new ZodBodyPipe(createPayoutSchema)) dto: CreatePayoutRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { payout: await this.payouts.createForRecord(dto.payrollRecordId, admin.id) };
  }

  @Get(API_ROUTES.adminPayroll.payout())
  async getPayout(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    return { payout: await this.payouts.get(id) };
  }

  @Post(API_ROUTES.adminPayroll.markPayoutPaid())
  async markPayoutPaid(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(markPayoutPaidSchema)) dto: MarkPayoutPaidRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return { payout: await this.payouts.markPaid(id, admin.id, dto) };
  }

  private requirePeriodId(value: unknown): string {
    const periodId = optionalQueryString(value, "periodId");
    if (!periodId) throw new BadRequestException("periodId is required.");
    return periodId;
  }

  private async admin(request: Request) {
    return assertAdmin(
      await authenticateUser(
        this.jwtService,
        this.prisma,
        request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
      )
    );
  }
}
