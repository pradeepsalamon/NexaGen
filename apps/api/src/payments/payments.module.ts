import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { MailModule } from "../mail/mail.module";
import { MessagingModule } from "../messaging/messaging.module";
import { PrismaModule } from "../prisma/prisma.module";
import { QueueModule } from "../queue/queue.module";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { BatchPricingService } from "./batch-pricing.service";
import { BillingProfileService } from "./billing-profile.service";
import { CreditNoteService } from "./credit-note.service";
import { DiscountService } from "./discount.service";
import { EntitlementService } from "./entitlement.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceEmailService } from "./invoice-email.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { INVOICE_QUEUE } from "./invoice-queue";
import { InvoiceStorageService } from "./invoice-storage.service";
import { InvoiceService } from "./invoice.service";
import { InvoiceProcessor } from "./invoice.processor";
import { InvoicesAdminController } from "./invoices-admin.controller";
import { InvoicesController } from "./invoices.controller";
import { ManualPaymentAttachmentStorage } from "./manual-payment-attachment.storage";
import { ManualPaymentController } from "./manual-payment.controller";
import { ManualPaymentService } from "./manual-payment.service";
import { OfflinePaymentMethodService } from "./offline-payment-method.service";
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
    InvoicesAdminController,
    InvoicesController,
    ManualPaymentController,
    PaymentsController,
    PaymentsAdminController,
    PaymentsWebhookController
  ],
  imports: [
    JwtModule,
    MailModule,
    MessagingModule,
    PrismaModule,
    // Invoice PDFs render off the request path. With REDIS_URL unset this
    // resolves to the disabled stand-in and the service falls back to inline
    // rendering, so the API still boots without Docker.
    QueueModule.registerQueue(INVOICE_QUEUE),
    WhatsAppModule
  ],
  providers: [
    BatchPricingService,
    BillingProfileService,
    CashfreeProvider,
    CreditNoteService,
    DiscountService,
    EntitlementService,
    InvoiceAuditService,
    InvoiceEmailService,
    InvoiceGenerationService,
    InvoicePdfService,
    InvoiceProcessor,
    InvoiceService,
    InvoiceSettingsService,
    InvoiceStorageService,
    ManualPaymentAttachmentStorage,
    ManualPaymentService,
    OfflinePaymentMethodService,
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
  exports: [
    BatchPricingService,
    EntitlementService,
    InvoiceService,
    PaymentService,
    PlanService
  ]
})
export class PaymentsModule {}
