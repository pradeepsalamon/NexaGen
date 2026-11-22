import {
  API_ROUTES,
  type AcademyBillingResponse,
  type AcademyClosureResponse,
  type RequestAcademyClosureRequest,
  type TenantClosureResponse,
  type AdminSubscriptionResponse,
  type ConfirmPlatformCheckoutRequest,
  type CurrentEntitlementsResponse,
  type PlatformCheckoutView,
  type PlatformInvoiceView,
  type StartPlatformCheckoutRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getCurrentEntitlements(): Promise<CurrentEntitlementsResponse> {
  return apiFetch(API_ROUTES.subscription.current);
}

export function getAdminSubscription(): Promise<AdminSubscriptionResponse> {
  return apiFetch(API_ROUTES.subscription.admin);
}

// Paying the platform (SaaS Phase 6).
export function getAcademyBilling(): Promise<AcademyBillingResponse> {
  return apiFetch(API_ROUTES.subscription.billing);
}

export function startPlatformCheckout(body: StartPlatformCheckoutRequest): Promise<PlatformCheckoutView> {
  return apiFetch(API_ROUTES.subscription.checkout, { body, method: "POST" });
}

export function getPlatformCheckout(id: string): Promise<PlatformCheckoutView> {
  return apiFetch(API_ROUTES.subscription.checkoutGet(id));
}

export function confirmPlatformCheckout(id: string, body: ConfirmPlatformCheckoutRequest): Promise<PlatformCheckoutView> {
  return apiFetch(API_ROUTES.subscription.checkoutConfirm(id), { body, method: "POST" });
}

export function getAcademyInvoice(id: string): Promise<PlatformInvoiceView> {
  return apiFetch(API_ROUTES.subscription.invoice(id));
}

// ── Closing the academy (docs/ACADEMY_CLOSURE.md), its super admin only ──

export function getAcademyClosure(): Promise<AcademyClosureResponse> {
  return apiFetch<AcademyClosureResponse>(API_ROUTES.academyClosure.current);
}

export function requestAcademyClosure(body: RequestAcademyClosureRequest): Promise<TenantClosureResponse> {
  return apiFetch<TenantClosureResponse>(API_ROUTES.academyClosure.current, { body, method: "POST" });
}

export function withdrawAcademyClosure(): Promise<TenantClosureResponse> {
  return apiFetch<TenantClosureResponse>(API_ROUTES.academyClosure.withdraw, { method: "POST" });
}

/** The academy's data (gzip, one JSON object per line). */
export function downloadOwnAcademyExport(): Promise<Blob> {
  return apiFetch<Blob>(API_ROUTES.academyClosure.export, { responseType: "blob" });
}
