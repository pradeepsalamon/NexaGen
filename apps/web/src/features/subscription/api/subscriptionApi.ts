import {
  API_ROUTES,
  type AdminSubscriptionResponse,
  type CurrentEntitlementsResponse,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getCurrentEntitlements(): Promise<CurrentEntitlementsResponse> {
  return apiFetch(API_ROUTES.subscription.current);
}

export function getAdminSubscription(): Promise<AdminSubscriptionResponse> {
  return apiFetch(API_ROUTES.subscription.admin);
}
