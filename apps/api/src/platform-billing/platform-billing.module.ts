import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "../prisma/prisma.module";
import { PlatformBillingWebhookService } from "./platform-billing-webhook.service";
import {
  AcademyBillingController,
  PlatformBillingConsoleController,
  PlatformBillingWebhookController
} from "./platform-billing.controller";
import { PlatformBillingService } from "./platform-billing.service";
import { PlatformRazorpayClient } from "./platform-razorpay.client";
import { TenantUsageService } from "./tenant-usage.service";

/**
 * Academies paying the platform, platform GST invoices and usage counters
 * (docs/SAAS_MULTI_TENANCY.md §G; Phase 6). Its own tables and webhook route;
 * it never touches `PaymentService`, student entitlements or student invoices.
 * `EntitlementService` (plans) comes from the global PlatformModule.
 */
@Module({
  controllers: [AcademyBillingController, PlatformBillingConsoleController, PlatformBillingWebhookController],
  exports: [PlatformBillingService],
  imports: [JwtModule.register({}), PrismaModule],
  providers: [PlatformBillingService, PlatformBillingWebhookService, PlatformRazorpayClient, TenantUsageService]
})
export class PlatformBillingModule {}
