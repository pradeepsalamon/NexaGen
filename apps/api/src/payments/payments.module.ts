import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { BatchPricingService } from "./batch-pricing.service";
import { DiscountService } from "./discount.service";
import { EntitlementService } from "./entitlement.service";
import { InvoiceService } from "./invoice.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { PaymentRouterService } from "./payment-router.service";
import { PaymentWebhookService } from "./payment-webhook.service";
import { PaymentService } from "./payment.service";
import { PaymentsAdminController } from "./payments-admin.controller";
import { PaymentsAdminService } from "./payments-admin.service";
import { PaymentsWebhookController } from "./payments-webhook.controller";
import { PaymentsController } from "./payments.controller";
import { PlanService } from "./plan.service";
import { ProviderHealthService } from "./provider-health.service";
import { CashfreeProvider } from "./providers/cashfree.provider";
import { ProviderRegistry } from "./providers/provider-registry.service";
import { RazorpayProvider } from "./providers/razorpay.provider";
import { StripeProvider } from "./providers/stripe.provider";
import { RefundService } from "./refund.service";
import { SubscriptionService } from "./subscription.service";

/**
 * Payments.
 *
 * Other feature modules import this for {@link PaymentService} and
 * {@link EntitlementService} — the two public surfaces. Everything else,
 * including every gateway adapter, is internal: nothing outside this module
 * should know that Razorpay, Cashfree or Stripe exist.
 *
 * MessagingModule supplies the receipt/failure/refund messages, which ride the
 * same admin-configurable rules as every other outbound message.
 */
@Module({
  controllers: [
    PaymentsController,
    PaymentsAdminController,
    PaymentsWebhookController
  ],
  imports: [JwtModule, MessagingModule, PrismaModule],
  providers: [
    BatchPricingService,
    CashfreeProvider,
    DiscountService,
    EntitlementService,
    InvoiceService,
    PaymentReconciliationService,
    PaymentRouterService,
    PaymentService,
    PaymentWebhookService,
    PaymentsAdminService,
    PlanService,
    ProviderHealthService,
    ProviderRegistry,
    RazorpayProvider,
    RefundService,
    StripeProvider,
    SubscriptionService
  ],
  exports: [BatchPricingService, EntitlementService, PaymentService, PlanService]
})
export class PaymentsModule {}
