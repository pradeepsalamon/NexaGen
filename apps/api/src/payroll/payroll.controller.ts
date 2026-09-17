import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { safeFilename, sendPdf } from "../payments/invoices.controller";
import { PrismaService } from "../prisma/prisma.service";
import { assertOwnerOrAdmin, authenticateUser } from "./payroll-auth.helper";
import { PayrollRecordService } from "./payroll-record.service";
import { PayslipGenerationService } from "./payslip-generation.service";

/**
 * Coach-facing payroll routes — read-only (§18/§19). A coach sees only their
 * own earnings; there is no coach-sees-coach case, matching the payments
 * module's "money is between the party and the academy" precedent.
 */
@Controller()
export class PayrollController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly records: PayrollRecordService,
    private readonly payslips: PayslipGenerationService
  ) {}

  @Get(API_ROUTES.payroll.mine)
  async mine(@Req() request: Request) {
    const user = await this.user(request);
    return this.records.listForCoach(user.id);
  }

  @Get(API_ROUTES.payroll.record())
  async getRecord(@Param("id") id: string, @Req() request: Request) {
    const user = await this.user(request);
    const owner = await this.records.getOrThrow(id);
    assertOwnerOrAdmin(user, owner.coachId);
    return { record: await this.records.get(id) };
  }

  @Get(API_ROUTES.payroll.payslips)
  async myPayslips(@Req() request: Request) {
    const user = await this.user(request);
    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRecord: { coachId: user.id } },
      orderBy: { issuedAt: "desc" }
    });
    return {
      payslips: payslips.map((p) => ({
        id: p.id,
        documentNumber: p.documentNumber,
        payrollRecordId: p.payrollRecordId,
        documentKind: p.documentKind,
        engagementTypeAtIssue: p.engagementTypeAtIssue,
        pdfStatus: p.pdfStatus,
        pdfError: p.pdfError,
        issuedAt: p.issuedAt.toISOString(),
        createdAt: p.createdAt.toISOString()
      }))
    };
  }

  @Get(API_ROUTES.payroll.payslipPdf())
  async payslipPdf(@Param("id") id: string, @Req() request: Request, @Res() response: Response) {
    const user = await this.user(request);
    const payslip = await this.prisma.payslip.findUniqueOrThrow({
      where: { id },
      include: { payrollRecord: { select: { coachId: true } } }
    });
    assertOwnerOrAdmin(user, payslip.payrollRecord.coachId);

    const pdf = await this.payslips.getPayslipPdf(id);
    sendPdf(response, `${safeFilename(payslip.documentNumber)}.pdf`, pdf);
  }

  private user(request: Request) {
    return authenticateUser(
      this.jwtService,
      this.prisma,
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
    );
  }
}
