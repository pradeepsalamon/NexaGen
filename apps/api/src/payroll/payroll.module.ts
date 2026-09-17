import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { CompensationProfileService } from "./compensation-profile.service";
import { CompensationRateResolutionService } from "./compensation-rate-resolution.service";
import { PayoutService } from "./payout.service";
import { PayrollAdjustmentService } from "./payroll-adjustment.service";
import { PayrollAdminController } from "./payroll-admin.controller";
import { PayrollAuditService } from "./payroll-audit.service";
import { PayrollCalculationService } from "./payroll-calculation.service";
import { PayrollController } from "./payroll.controller";
import { PayrollLifecycleService } from "./payroll-lifecycle.service";
import { PayrollPeriodService } from "./payroll-period.service";
import { PayrollRecordService } from "./payroll-record.service";
import { PayrollRuleService } from "./payroll-rule.service";
import { PayslipGenerationService } from "./payslip-generation.service";
import { PayslipPdfService } from "./payslip-pdf.service";
import { PAYSLIP_QUEUE } from "./payslip-queue";
import { PayslipStorageService } from "./payslip-storage.service";
import { PayslipProcessor } from "./payslip.processor";
import { TeachingDataAggregationService } from "./teaching-data-aggregation.service";

/**
 * Coach payroll & payslips (CLAUDE.md payroll notes). Separate from
 * PaymentsModule — this is what the academy owes a COACH, computed from
 * teaching activity, not a customer checkout.
 *
 * Payslip PDFs render off the request path on their own queue, exactly like
 * `payments/invoice-generation.service.ts` — with `REDIS_URL` unset,
 * `QueueModule.registerQueue` resolves to the disabled stand-in and
 * `PayslipGenerationService` falls back to rendering inline.
 */
@Module({
  controllers: [PayrollAdminController, PayrollController],
  imports: [JwtModule, MessagingModule, PrismaModule, QueueModule.registerQueue(PAYSLIP_QUEUE)],
  providers: [
    CompensationProfileService,
    CompensationRateResolutionService,
    PayoutService,
    PayrollAdjustmentService,
    PayrollAuditService,
    PayrollCalculationService,
    PayrollLifecycleService,
    PayrollPeriodService,
    PayrollRecordService,
    PayrollRuleService,
    PayslipGenerationService,
    PayslipPdfService,
    PayslipProcessor,
    PayslipStorageService,
    TeachingDataAggregationService
  ],
  exports: [PayrollCalculationService, PayrollPeriodService, PayrollRecordService]
})
export class PayrollModule {}
