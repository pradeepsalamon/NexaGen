import {
  API_ROUTES,
  type TypographyAdminResponse,
  type TypographyResponse,
  type UpdateTypographyAdminRequest,
  type UpdateTypographyRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getResolvedTypography(): Promise<TypographyResponse> {
  return apiFetch(API_ROUTES.typography.get);
}

export function updateMyTypography(body: UpdateTypographyRequest): Promise<TypographyResponse> {
  return apiFetch(API_ROUTES.typography.me, { method: "PUT", body });
}

export function resetMyTypography(): Promise<TypographyResponse> {
  return apiFetch(API_ROUTES.typography.me, { method: "DELETE" });
}

export function getTypographyAdmin(): Promise<TypographyAdminResponse> {
  return apiFetch(API_ROUTES.typography.admin);
}

export function updateTypographyAdmin(
  body: UpdateTypographyAdminRequest,
): Promise<TypographyAdminResponse> {
  return apiFetch(API_ROUTES.typography.admin, { method: "PUT", body });
}

export function resetTypographyAdmin(): Promise<TypographyAdminResponse> {
  return apiFetch(API_ROUTES.typography.adminReset, { method: "POST" });
}
