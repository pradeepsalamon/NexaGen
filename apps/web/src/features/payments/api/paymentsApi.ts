import { API_ROUTES } from "@nexa-chess/types";
import type {
  ApplyDiscountRequest,
  ApplyDiscountResponse,
  BatchPricingResponse,
  CancelSubscriptionRequest,
  CreateBatchPlanRequest,
  CreateDiscountRequest,
  DiscountListResponse,
  DiscountItem,
  UpdateDiscountRequest,
  CheckoutConfigResponse,
  CheckoutResponse,
  CreateCheckoutRequest,
  CreatePlanRequest,
  CreateRefundRequest,
  InvoiceItem,
  InvoiceListResponse,
  MyBillingResponse,
  PaymentListQuery,
  PaymentListResponse,
  PaymentMethodKind,
  PaymentOverviewResponse,
  PaymentRoutingConfig,
  PaymentStatusResponse,
  PlanItem,
  PlanListResponse,
  ProviderHealthResponse,
  RefundItem,
  RefundListResponse,
  SubscriptionItem,
  SubscriptionListResponse,
  UpdatePlanRequest,
  VerifyPaymentRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// ── Student / checkout ──

export function getPlans(): Promise<PlanListResponse> {
  return apiFetch(API_ROUTES.payments.plans);
}

export function getCheckoutConfig(
  planId: string
): Promise<CheckoutConfigResponse> {
  return apiFetch(API_ROUTES.payments.checkoutConfig(planId));
}

export function createCheckout(
  data: CreateCheckoutRequest
): Promise<CheckoutResponse> {
  return apiFetch(API_ROUTES.payments.checkout, { method: "POST", body: data });
}

/**
 * Tells the server what the gateway told the browser. Advisory only — the
 * response is the server's own view, which is the one that counts.
 */
export function verifyPayment(
  paymentId: string,
  data: VerifyPaymentRequest
): Promise<PaymentStatusResponse> {
  return apiFetch(API_ROUTES.payments.verify(paymentId), {
    method: "POST",
    body: data
  });
}

/** The "Check payment status" button. Reconciles server-side; never asserts. */
export function getPaymentStatus(
  paymentId: string
): Promise<PaymentStatusResponse> {
  return apiFetch(API_ROUTES.payments.status(paymentId));
}

export function retryPayment(
  paymentId: string,
  method?: PaymentMethodKind
): Promise<CheckoutResponse> {
  return apiFetch(API_ROUTES.payments.retry(paymentId), {
    method: "POST",
    body: method ? { method } : {}
  });
}

/** Prices a code against a plan + method. A preview, never a hold. */
export function previewDiscount(
  data: ApplyDiscountRequest
): Promise<ApplyDiscountResponse> {
  return apiFetch(API_ROUTES.payments.previewDiscount, {
    method: "POST",
    body: data
  });
}

export function getMyBilling(): Promise<MyBillingResponse> {
  return apiFetch(API_ROUTES.payments.mine);
}

export function getInvoice(id: string): Promise<InvoiceItem> {
  return apiFetch(API_ROUTES.payments.invoice(id));
}

export function getMySubscriptions(): Promise<SubscriptionListResponse> {
  return apiFetch(API_ROUTES.payments.mySubscriptions);
}

export function cancelSubscription(
  id: string,
  data: CancelSubscriptionRequest
): Promise<SubscriptionItem> {
  return apiFetch(API_ROUTES.payments.cancelSubscription(id), {
    method: "POST",
    body: data
  });
}

// ── Admin ──

export function getPaymentOverview(): Promise<PaymentOverviewResponse> {
  return apiFetch(API_ROUTES.adminPayments.overview);
}

export function getAdminPayments(
  params: Partial<PaymentListQuery> = {}
): Promise<PaymentListResponse> {
  return apiFetch(withQuery(API_ROUTES.adminPayments.list, params));
}

export function getAdminPayment(id: string): Promise<AdminPaymentDetail> {
  return apiFetch(API_ROUTES.adminPayments.get(id));
}

export function refundPayment(
  id: string,
  data: CreateRefundRequest
): Promise<RefundItem> {
  return apiFetch(API_ROUTES.adminPayments.refund(id), {
    method: "POST",
    body: data
  });
}

export function reconcilePayment(id: string): Promise<PaymentStatusResponse> {
  return apiFetch(API_ROUTES.adminPayments.reconcile(id), { method: "POST" });
}

export function getRefunds(): Promise<RefundListResponse> {
  return apiFetch(API_ROUTES.adminPayments.refunds);
}

export function getAdminSubscriptions(): Promise<SubscriptionListResponse> {
  return apiFetch(API_ROUTES.adminPayments.subscriptions);
}

export function getAdminInvoices(): Promise<InvoiceListResponse> {
  return apiFetch(API_ROUTES.adminPayments.invoices);
}

export function getProviderHealth(): Promise<ProviderHealthResponse> {
  return apiFetch(API_ROUTES.adminPayments.providerHealth);
}

export type RoutingResponse = {
  config: PaymentRoutingConfig;
  configured: Record<string, boolean>;
};

export function getRouting(): Promise<RoutingResponse> {
  return apiFetch(API_ROUTES.adminPayments.routing);
}

export function saveRouting(
  config: PaymentRoutingConfig
): Promise<RoutingResponse> {
  return apiFetch(API_ROUTES.adminPayments.routing, {
    method: "PUT",
    body: config
  });
}

export function getAdminPlans(): Promise<PlanListResponse> {
  return apiFetch(API_ROUTES.adminPayments.plans);
}

export function createPlan(data: CreatePlanRequest): Promise<PlanItem> {
  return apiFetch(API_ROUTES.adminPayments.plans, { method: "POST", body: data });
}

export function updatePlan(
  id: string,
  data: UpdatePlanRequest
): Promise<PlanItem> {
  return apiFetch(API_ROUTES.adminPayments.plan(id), { method: "PUT", body: data });
}

export function archivePlan(id: string): Promise<PlanItem> {
  return apiFetch(API_ROUTES.adminPayments.plan(id), { method: "DELETE" });
}

// ── Discounts ──

export function getDiscounts(): Promise<DiscountListResponse> {
  return apiFetch(API_ROUTES.adminPayments.discounts);
}

export function createDiscount(
  data: CreateDiscountRequest
): Promise<DiscountItem> {
  return apiFetch(API_ROUTES.adminPayments.discounts, {
    method: "POST",
    body: data
  });
}

export function updateDiscount(
  id: string,
  data: UpdateDiscountRequest
): Promise<DiscountItem> {
  return apiFetch(API_ROUTES.adminPayments.discount(id), {
    method: "PUT",
    body: data
  });
}

export function deleteDiscount(id: string): Promise<{ deleted: boolean }> {
  return apiFetch(API_ROUTES.adminPayments.discount(id), { method: "DELETE" });
}

// ── Per-batch pricing ──

export function getBatchPricing(batchId: string): Promise<BatchPricingResponse> {
  return apiFetch(API_ROUTES.adminPayments.batchPricing(batchId));
}

export function createBatchPlan(
  batchId: string,
  data: CreateBatchPlanRequest
): Promise<PlanItem> {
  return apiFetch(API_ROUTES.adminPayments.batchPricing(batchId), {
    method: "POST",
    body: data
  });
}

export function updateBatchPlan(
  batchId: string,
  planId: string,
  data: UpdatePlanRequest
): Promise<PlanItem> {
  return apiFetch(API_ROUTES.adminPayments.batchPlan(batchId, planId), {
    method: "PUT",
    body: data
  });
}

export function archiveBatchPlan(
  batchId: string,
  planId: string
): Promise<PlanItem> {
  return apiFetch(API_ROUTES.adminPayments.batchPlan(batchId, planId), {
    method: "DELETE"
  });
}

/** Detail view: the payment plus its attempt, refund and webhook trail. */
export type AdminPaymentDetail = {
  payment: PaymentListResponse["payments"][number];
  attempts: {
    id: string;
    attemptNumber: number;
    provider: string;
    method: string | null;
    status: string;
    failureMessage: string | null;
    createdAt: string;
  }[];
  refunds: {
    id: string;
    amount: number;
    status: string;
    reason: string | null;
    createdAt: string;
    processedAt: string | null;
  }[];
  webhooks: {
    id: string;
    eventType: string;
    status: string;
    error: string | null;
    receivedAt: string;
  }[];
};

function withQuery(path: string, params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
