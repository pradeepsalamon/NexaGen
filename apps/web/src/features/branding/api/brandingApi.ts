import {
  API_ROUTES,
  type BrandAssetKind,
  type TenantBrandingResponse,
  type TenantDomainsResponse,
  type TenantPublicConfig,
  type UpdateTenantBrandingRequest,
  type UpdateWhatsAppSettingsRequest,
  type UpdateWhiteLabelRequest,
  type WhatsAppSettingsResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export const getTenantPublicConfig = () =>
  apiFetch<TenantPublicConfig>(API_ROUTES.branding.publicConfig, { silent: true });

export const getTenantBranding = () => apiFetch<TenantBrandingResponse>(API_ROUTES.branding.admin);

export const updateTenantBranding = (body: UpdateTenantBrandingRequest) =>
  apiFetch<TenantBrandingResponse>(API_ROUTES.branding.admin, { body, method: "PUT" });

export const setTenantWhiteLabel = (body: UpdateWhiteLabelRequest) =>
  apiFetch<TenantBrandingResponse>(API_ROUTES.branding.whiteLabel, { body, method: "PUT" });

export function uploadTenantBrandAsset(kind: BrandAssetKind, file: File) {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<TenantBrandingResponse>(API_ROUTES.branding.asset(kind), {
    body,
    headers: { "Content-Type": "multipart/form-data" },
    method: "POST"
  });
}

export const clearTenantBrandAsset = (kind: BrandAssetKind) =>
  apiFetch<TenantBrandingResponse>(API_ROUTES.branding.asset(kind), { method: "DELETE" });

export const getTenantDomains = () => apiFetch<TenantDomainsResponse>(API_ROUTES.branding.domains);

export const getWhatsAppSettings = () => apiFetch<WhatsAppSettingsResponse>(API_ROUTES.branding.whatsapp);

export const updateWhatsAppSettings = (body: UpdateWhatsAppSettingsRequest) =>
  apiFetch<WhatsAppSettingsResponse>(API_ROUTES.branding.whatsapp, { body, method: "PUT" });
