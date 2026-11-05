import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  computeTax,
  DEFAULT_TENANT_ID,
  extendPlatformPeriod,
  financialYear,
  formatDocumentNumber,
  PLATFORM_CHECKOUT_TTL_DAYS,
  platformPriceFor,
  platformSellerDetailsSchema,
  stateCodeFromGstin,
  type AcademyBillingResponse,
  type ConfirmPlatformCheckoutRequest,
  type CreatePlatformPayLinkRequest,
  type PlatformBillingPeriod,
  type PlatformCheckoutView,
  type PlatformInvoiceView,
  type PlatformSellerDetails,
  type StartPlatformCheckoutRequest,
  type TaxBreakdown,
  type UpdatePlatformSellerDetailsRequest
} from "@nexa-chess/types";
import {
  PlatformCheckoutStatus,
  PlatformPaymentMethod,
  Prisma,
  TenantStatus,
  TenantSubscriptionEventSource,
  TenantSubscriptionStatus,
  UserRole,
  type PlatformCheckout,
  type PlatformInvoice,
  type PlatformPlan
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { EntitlementService } from "../platform/entitlement.service";
import { assertPlatformOperator, writePlatformAudit } from "../platform/platform-operator";
import { applyPaidPeriod } from "../platform/platform-subscriptions.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { PlatformRazorpayClient, type PlatformGatewayPayment } from "./platform-razorpay.client";

const DAY_MS = 24 * 60 * 60_000;
const SELLER_ROW_ID = "platform";
/** Statuses a subscription can be paid out of (CANCELLED is final). */
const PAYABLE: TenantSubscriptionStatus[] = [
  TenantSubscriptionStatus.TRIALING,
  TenantSubscriptionStatus.ACTIVE,
  TenantSubscriptionStatus.PAST_DUE,
  TenantSubscriptionStatus.GRACE,
  TenantSubscriptionStatus.CANCEL_SCHEDULED,
  TenantSubscriptionStatus.EXPIRED
];

type Buyer = PlatformInvoiceView["buyer"] & { country: string };
type CheckoutWithPlan = PlatformCheckout & { plan: PlatformPlan };
type InvoiceSnapshot = Omit<PlatformInvoiceView, "id" | "issuedAt" | "number" | "tenantId">;

/**
 * Academies paying the platform (docs/SAAS_MULTI_TENANCY.md §G "Two money
 * flows" 1; Phase 6). The owner's Razorpay account, GST invoices from the
 * owner, and the paid-up period through the subscription funnel.
 *
 * Money rules (same as student payments): integer minor units; the price is
 * frozen on the checkout; only a provider read (the signed webhook, or the
 * reconcile the browser's callback asks for) marks a checkout PAID, through a
 * status-filtered claim, so a forged or repeated callback is a no-op.
 */
@Injectable()
export class PlatformBillingService {
  private readonly logger = new Logger(PlatformBillingService.name);

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly gateway: PlatformRazorpayClient,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── Academy side ─────────────────────────────────────────────────────────

  private async academySuperAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException("Only the academy's super admin can pay for its plan.");
    return user;
  }

  private async academyAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only administrators can view the academy's billing.");
    }
    return user;
  }

  async billing(accessToken: string | undefined): Promise<AcademyBillingResponse> {
    await this.academyAdmin(accessToken);
    const tenantId = requireTenantId("platformBilling");
    const [checkouts, invoices] = await Promise.all([
      this.prisma.platformCheckout.findMany({
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        where: { expiresAt: { gt: new Date() }, status: PlatformCheckoutStatus.CREATED, tenantId }
      }),
      this.prisma.platformInvoice.findMany({ orderBy: { issuedAt: "desc" }, take: 50, where: { tenantId } })
    ]);
    return {
      gatewayReady: this.gateway.isConfigured(),
      invoices: invoices.map(toInvoiceView),
      openCheckouts: checkouts.map((checkout) => this.toCheckoutView(checkout))
    };
  }

  async startCheckout(accessToken: string | undefined, body: StartPlatformCheckoutRequest): Promise<PlatformCheckoutView> {
    const user = await this.academySuperAdmin(accessToken);
    const tenantId = requireTenantId("platformBilling");
    if (tenantId === DEFAULT_TENANT_ID) throw new BadRequestException("NexaChess's own academy doesn't pay for a plan.");
    if (!this.gateway.isConfigured()) {
      throw new ServiceUnavailableException("Online payment isn't set up yet. Contact NexaChess to pay for your plan.");
    }
    const checkout = await this.createCheckout({ createdById: user.id, createdByPlatform: false, period: body.period, planCode: body.planCode, tenantId });
    return this.toCheckoutView(checkout);
  }

  async getCheckout(accessToken: string | undefined, id: string): Promise<PlatformCheckoutView> {
    await this.academyAdmin(accessToken);
    return this.toCheckoutView(await this.ownCheckout(id));
  }

  /**
   * The browser's "paid" callback. It only triggers a read of the order from
   * Razorpay; the handshake signature is checked for the log, never trusted.
   */
  async confirm(accessToken: string | undefined, id: string, body: ConfirmPlatformCheckoutRequest): Promise<PlatformCheckoutView> {
    await this.academySuperAdmin(accessToken);
    const checkout = await this.ownCheckout(id);
    if (body.razorpayOrderId && body.razorpayPaymentId && body.razorpaySignature) {
      const valid =
        body.razorpayOrderId === checkout.providerOrderId &&
        this.gateway.verifyCheckoutSignature(body.razorpayOrderId, body.razorpayPaymentId, body.razorpaySignature);
      if (!valid) this.logger.warn(`Checkout ${checkout.id}: the browser's handshake did not verify; reading the order anyway.`);
    }
    await this.reconcile(checkout.id);
    return this.toCheckoutView(await this.ownCheckout(id));
  }

  async invoice(accessToken: string | undefined, id: string): Promise<PlatformInvoiceView> {
    await this.academyAdmin(accessToken);
    const tenantId = requireTenantId("platformBilling");
    // Platform table: the academy filter is written here, not added by the extension.
    const row = await this.prisma.platformInvoice.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("Invoice not found.");
    return toInvoiceView(row);
  }

  private async ownCheckout(id: string): Promise<CheckoutWithPlan> {
    const tenantId = requireTenantId("platformBilling");
    const checkout = await this.prisma.platformCheckout.findFirst({ include: { plan: true }, where: { id, tenantId } });
    if (!checkout) throw new NotFoundException("Payment not found.");
    return checkout;
  }

  // ── Platform console ─────────────────────────────────────────────────────

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  /** The owner sends an academy a pay link: a checkout the academy's super admin opens from its subscription page. */
  async createPayLink(
    accessToken: string | undefined,
    tenantId: string,
    body: CreatePlatformPayLinkRequest
  ): Promise<PlatformCheckoutView & { payPath: string }> {
    const actor = await this.operator(accessToken);
    if (tenantId === DEFAULT_TENANT_ID) throw new BadRequestException("NexaChess's own academy doesn't pay for a plan.");
    const checkout = await this.createCheckout({
      createdById: actor.id,
      createdByPlatform: true,
      note: body.note ?? null,
      period: body.period,
      planCode: body.planCode,
      subtotalOverride: body.subtotalMinor,
      tenantId
    });
    await writePlatformAudit(this.prisma, {
      action: "billing.pay-link",
      actorUserId: actor.id,
      details: { amountMinor: checkout.amountMinor, checkoutId: checkout.id, period: checkout.period, planCode: checkout.plan.code },
      reason: body.note ?? null,
      targetTenantId: tenantId
    });
    return { ...this.toCheckoutView(checkout), payPath: `/admin/subscription?checkout=${checkout.id}` };
  }

  async listInvoices(accessToken: string | undefined, tenantId?: string): Promise<{ invoices: PlatformInvoiceView[] }> {
    await this.operator(accessToken);
    const rows = await this.prisma.platformInvoice.findMany({
      orderBy: { issuedAt: "desc" },
      take: 200,
      where: tenantId ? { tenantId } : {}
    });
    return { invoices: rows.map(toInvoiceView) };
  }

  async getInvoice(accessToken: string | undefined, id: string): Promise<PlatformInvoiceView> {
    await this.operator(accessToken);
    const row = await this.prisma.platformInvoice.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Invoice not found.");
    return toInvoiceView(row);
  }

  async getSellerDetails(accessToken: string | undefined): Promise<{ seller: PlatformSellerDetails; saved: boolean }> {
    await this.operator(accessToken);
    const row = await this.prisma.platformSellerSettings.findUnique({ where: { id: SELLER_ROW_ID } });
    return { saved: Boolean(row), seller: await this.sellerDetails() };
  }

  async updateSellerDetails(
    accessToken: string | undefined,
    body: UpdatePlatformSellerDetailsRequest
  ): Promise<{ seller: PlatformSellerDetails; saved: boolean }> {
    const actor = await this.operator(accessToken);
    const merged = platformSellerDetailsSchema.parse({ ...(await this.sellerDetails()), ...body });
    if (merged.gstin && !stateCodeFromGstin(merged.gstin)) throw new BadRequestException("That GSTIN isn't valid.");
    const details = merged as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSellerSettings.upsert({
        create: { details, id: SELLER_ROW_ID, updatedById: actor.id },
        update: { details, updatedById: actor.id },
        where: { id: SELLER_ROW_ID }
      });
      await writePlatformAudit(tx, { action: "billing.seller-details", actorUserId: actor.id, details: { fields: Object.keys(body) } });
    });
    return { saved: true, seller: merged };
  }

  // ── Checkout creation ────────────────────────────────────────────────────

  private async createCheckout(input: {
    tenantId: string;
    period: PlatformBillingPeriod;
    planCode?: string;
    createdById: string;
    createdByPlatform: boolean;
    note?: string | null;
    subtotalOverride?: number;
  }): Promise<CheckoutWithPlan> {
    const [tenant, sub] = await asPlatform("platform-billing:checkout", () =>
      Promise.all([
        this.prisma.tenant.findUnique({ where: { id: input.tenantId } }),
        this.prisma.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId: input.tenantId } })
      ])
    );
    if (!tenant) throw new NotFoundException("Academy not found.");
    if (tenant.status === TenantStatus.DEACTIVATED) throw new ConflictException("This academy is deactivated.");
    if (!sub) throw new NotFoundException("This academy has no subscription.");
    if (!PAYABLE.includes(sub.status)) throw new ConflictException("This subscription was cancelled; NexaChess has to reopen it first.");

    const plan = input.planCode
      ? await this.prisma.platformPlan.findUnique({ where: { code: input.planCode } })
      : sub.plan;
    if (!plan) throw new NotFoundException("Plan not found.");
    const isCurrentPlan = plan.id === sub.planId;
    if (!isCurrentPlan && (!plan.isActive || (!plan.isPublic && !input.createdByPlatform))) {
      throw new BadRequestException("That plan can't be bought.");
    }
    const subtotalMinor =
      input.subtotalOverride ?? platformPriceFor(plan, input.period, isCurrentPlan ? sub.customPriceMinor : null);
    if (subtotalMinor == null || subtotalMinor <= 0) {
      throw new BadRequestException("This plan has no online price. Contact NexaChess to arrange payment.");
    }

    const [seller, buyer] = await Promise.all([this.sellerDetails(), this.buyerDetails(input.tenantId, tenant.name)]);
    const tax = this.taxFor(subtotalMinor, seller, buyer);
    const amountMinor = subtotalMinor + tax.taxTotal;

    // Reuse an open checkout for the same thing: a double click or a reload
    // never opens a second order.
    const open = await this.prisma.platformCheckout.findFirst({
      include: { plan: true },
      where: {
        amountMinor,
        expiresAt: { gt: new Date(Date.now() + DAY_MS) },
        period: input.period,
        planId: plan.id,
        status: PlatformCheckoutStatus.CREATED,
        tenantId: input.tenantId
      }
    });
    if (open?.providerOrderId) return open;

    const checkout =
      open ??
      (await this.prisma.platformCheckout.create({
        data: {
          amountMinor,
          createdById: input.createdById,
          createdByPlatform: input.createdByPlatform,
          currency: plan.currency,
          expiresAt: new Date(Date.now() + PLATFORM_CHECKOUT_TTL_DAYS * DAY_MS),
          note: input.note ?? null,
          period: input.period,
          planId: plan.id,
          subtotalMinor,
          taxBreakdown: tax as unknown as Prisma.InputJsonValue,
          taxMinor: tax.taxTotal,
          tenantId: input.tenantId
        },
        include: { plan: true }
      }));
    if (!this.gateway.isConfigured()) return checkout;
    // Our row first, then the order: a failed order call leaves a checkout
    // that the next attempt reuses, never an order we have no row for.
    const order = await this.gateway.createOrder({
      amountMinor,
      currency: checkout.currency,
      notes: { checkoutId: checkout.id, tenantId: input.tenantId },
      receipt: checkout.id
    });
    return this.prisma.platformCheckout.update({ data: { providerOrderId: order.id }, include: { plan: true }, where: { id: checkout.id } });
  }

  // ── Settlement (webhook and reconcile) ───────────────────────────────────

  /** Reads the order's payments from Razorpay and settles a captured one. Returns true when the checkout is (now) paid. */
  async reconcile(checkoutId: string): Promise<boolean> {
    const checkout = await asPlatform("platform-billing:reconcile", () => this.prisma.platformCheckout.findUnique({ where: { id: checkoutId } }));
    if (!checkout) return false;
    if (checkout.status === PlatformCheckoutStatus.PAID) return true;
    if (!checkout.providerOrderId || !this.gateway.isConfigured()) return false;
    const payments = await this.gateway.orderPayments(checkout.providerOrderId);
    const captured = payments.find((payment) => payment.status === "captured");
    if (!captured) return false;
    return this.settle(checkout.providerOrderId, captured);
  }

  /**
   * Applies one captured payment to the checkout its order belongs to: claim
   * the checkout, record the payment, extend the period, issue the invoice —
   * one transaction. Idempotent on the checkout status and on the gateway's
   * payment id. Returns false when the payment doesn't match (wrong amount or
   * currency, unknown order).
   */
  async settle(providerOrderId: string, payment: PlatformGatewayPayment): Promise<boolean> {
    return asPlatform("platform-billing:settle", async () => {
      const checkout = await this.prisma.platformCheckout.findUnique({ include: { plan: true }, where: { providerOrderId } });
      if (!checkout) return false;
      if (checkout.status === PlatformCheckoutStatus.PAID) return true;
      if (payment.status !== "captured") return false;
      if (payment.amountMinor < checkout.amountMinor || payment.currency.toUpperCase() !== checkout.currency.toUpperCase()) {
        this.logger.warn(`Checkout ${checkout.id}: payment ${payment.id} does not match the order (amount or currency); not applied.`);
        return false;
      }
      const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: checkout.tenantId } });
      const [seller, buyer] = await Promise.all([this.sellerDetails(), this.buyerDetails(checkout.tenantId, tenant.name)]);

      const settled = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.platformCheckout.updateMany({
          data: { paidAt: new Date(), status: PlatformCheckoutStatus.PAID },
          where: { id: checkout.id, status: { not: PlatformCheckoutStatus.PAID } }
        });
        if (claim.count !== 1) return false;
        const sub = await tx.tenantSubscription.findUniqueOrThrow({ where: { tenantId: checkout.tenantId } });
        const now = new Date();
        const periodStart = sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime() ? sub.currentPeriodEnd : now;
        const periodEnd = extendPlatformPeriod(sub.currentPeriodEnd, checkout.period, now);
        const record = await tx.platformPayment.create({
          data: {
            amountMinor: payment.amountMinor,
            checkoutId: checkout.id,
            currency: checkout.currency,
            gatewayPaymentId: payment.id,
            method: PlatformPaymentMethod.RAZORPAY,
            note: checkout.note,
            periodEnd,
            reference: payment.id,
            tenantId: checkout.tenantId
          }
        });
        const planChange =
          checkout.planId !== sub.planId
            ? { pendingPlanId: null, planId: checkout.planId, planVersion: checkout.plan.version }
            : {};
        const changes = {
          amountMinor: payment.amountMinor,
          checkoutId: checkout.id,
          paymentId: record.id,
          periodEnd: periodEnd.toISOString(),
          ...(checkout.planId !== sub.planId ? { planCode: checkout.plan.code } : {})
        };
        await applyPaidPeriod(tx, {
          actorUserId: null,
          changes,
          data: {
            currentPeriodEnd: periodEnd,
            currentPeriodStart: periodStart,
            graceEndsAt: null,
            trialEndsAt: null,
            ...planChange
          },
          note: "Paid online",
          source: TenantSubscriptionEventSource.WEBHOOK,
          tenantId: checkout.tenantId
        });
        await this.issueInvoice(tx, { buyer, checkout, payment: record, periodEnd, periodStart, seller, tenantName: tenant.name });
        return true;
      });
      if (settled) this.entitlements.invalidate(checkout.tenantId);
      return settled || (await this.prisma.platformCheckout.findUnique({ where: { id: checkout.id } }))?.status === PlatformCheckoutStatus.PAID;
    });
  }

  private async issueInvoice(
    tx: PrismaTransactionClient,
    input: {
      checkout: CheckoutWithPlan;
      payment: { id: string; reference: string | null };
      seller: PlatformSellerDetails;
      buyer: Buyer;
      tenantName: string;
      periodStart: Date;
      periodEnd: Date;
    }
  ): Promise<PlatformInvoice> {
    const issuedAt = new Date();
    const fy = financialYear(issuedAt);
    // An atomic increment on the year's counter row: gapless, never reused.
    const counter = await tx.platformInvoiceCounter.upsert({
      create: { financialYear: fy, lastSequence: 1 },
      update: { lastSequence: { increment: 1 } },
      where: { financialYear: fy }
    });
    const tax = input.checkout.taxBreakdown as unknown as TaxBreakdown;
    const { country: _country, ...buyer } = input.buyer;
    const snapshot: InvoiceSnapshot = {
      buyer,
      cgstMinor: tax.cgstAmount ?? 0,
      currency: input.checkout.currency,
      igstMinor: tax.igstAmount ?? 0,
      lines: [
        {
          amountMinor: input.checkout.subtotalMinor,
          description: `${input.checkout.plan.name} plan, ${input.checkout.period === "MONTHLY" ? "monthly" : "yearly"} subscription`
        }
      ],
      paymentReference: input.payment.reference,
      periodEnd: input.periodEnd.toISOString(),
      periodStart: input.periodStart.toISOString(),
      seller: input.seller,
      sgstMinor: tax.sgstAmount ?? 0,
      subtotalMinor: input.checkout.subtotalMinor,
      taxTreatment: tax.treatment ?? "NONE",
      tenantName: input.tenantName,
      totalMinor: input.checkout.amountMinor
    };
    return tx.platformInvoice.create({
      data: {
        currency: input.checkout.currency,
        financialYear: fy,
        issuedAt,
        number: formatDocumentNumber(input.seller.invoicePrefix, fy, counter.lastSequence),
        paymentId: input.payment.id,
        sequence: counter.lastSequence,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        tenantId: input.checkout.tenantId,
        totalMinor: input.checkout.amountMinor
      }
    });
  }

  // ── Seller, buyer and tax ────────────────────────────────────────────────

  /** The owner's details: the console's saved row, else Nexa's own academy's invoice details. */
  async sellerDetails(): Promise<PlatformSellerDetails> {
    const row = await this.prisma.platformSellerSettings.findUnique({ where: { id: SELLER_ROW_ID } });
    if (row) return platformSellerDetailsSchema.parse(row.details ?? {});
    const nexa = await runInTenant(DEFAULT_TENANT_ID, "platform-billing:seller", () =>
      this.prisma.invoiceSettings.findUnique({ where: { tenantId: DEFAULT_TENANT_ID } })
    );
    const gstin = nexa?.gstin ?? "";
    return platformSellerDetailsSchema.parse({
      address: joinAddress(nexa),
      email: nexa?.email ?? "",
      gstin,
      legalName: nexa?.legalName ?? "NexaChess",
      stateCode: stateCodeFromGstin(gstin) ?? ""
    });
  }

  private async buyerDetails(tenantId: string, tenantName: string): Promise<Buyer> {
    const row = await runInTenant(tenantId, "platform-billing:buyer", () => this.prisma.invoiceSettings.findUnique({ where: { tenantId } }));
    const gstin = row?.gstin?.trim() || null;
    return {
      address: joinAddress(row) || null,
      country: row?.country ?? "IN",
      gstin,
      name: row?.legalName?.trim() || row?.tradeName?.trim() || tenantName,
      stateCode: stateCodeFromGstin(gstin)
    };
  }

  private taxFor(subtotalMinor: number, seller: PlatformSellerDetails, buyer: Buyer): TaxBreakdown {
    const sellerStateCode = seller.gstin ? (stateCodeFromGstin(seller.gstin) ?? (seller.stateCode || null)) : null;
    return computeTax(subtotalMinor, {
      buyerCountry: buyer.country,
      buyerHasGstin: Boolean(buyer.gstin),
      buyerStateCode: buyer.stateCode,
      ratePercent: seller.gstRateBps / 100,
      sellerCountry: "IN",
      sellerStateCode
    });
  }

  private toCheckoutView(checkout: CheckoutWithPlan): PlatformCheckoutView {
    const keyId = this.gateway.keyId();
    const expired = checkout.status === PlatformCheckoutStatus.CREATED && checkout.expiresAt.getTime() <= Date.now();
    return {
      amountMinor: checkout.amountMinor,
      createdByPlatform: checkout.createdByPlatform,
      currency: checkout.currency,
      expiresAt: checkout.expiresAt.toISOString(),
      gateway:
        keyId && checkout.providerOrderId && checkout.status === PlatformCheckoutStatus.CREATED && !expired
          ? { keyId, merchantName: "NexaChess", orderId: checkout.providerOrderId, provider: "RAZORPAY" }
          : null,
      id: checkout.id,
      note: checkout.note,
      paidAt: checkout.paidAt?.toISOString() ?? null,
      period: checkout.period,
      planCode: checkout.plan.code,
      planName: checkout.plan.name,
      status: expired ? "EXPIRED" : checkout.status,
      subtotalMinor: checkout.subtotalMinor,
      taxMinor: checkout.taxMinor
    };
  }
}

function joinAddress(row: { addressLine1?: string | null; addressLine2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null } | null): string {
  if (!row) return "";
  return [row.addressLine1, row.addressLine2, row.city, row.state, row.postalCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

export function toInvoiceView(row: PlatformInvoice): PlatformInvoiceView {
  const snapshot = row.snapshot as unknown as InvoiceSnapshot;
  return {
    ...snapshot,
    id: row.id,
    issuedAt: row.issuedAt.toISOString(),
    number: row.number,
    tenantId: row.tenantId
  };
}
