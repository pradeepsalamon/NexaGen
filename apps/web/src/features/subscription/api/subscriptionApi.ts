import {
  API_ROUTES,
  type AcademyBillingResponse,
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
