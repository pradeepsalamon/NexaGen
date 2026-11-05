import { API_ROUTES, type TenantGatewayProvider, type TenantGatewaysResponse, type UpdateTenantGatewayRequest } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

/** The academy's own gateway keys (SaaS Phase 6; super admin). */
export const getGatewayKeys = () => apiFetch<TenantGatewaysResponse>(API_ROUTES.adminPayments.gateways);

export const updateGatewayKeys = (provider: TenantGatewayProvider, body: UpdateTenantGatewayRequest) =>
  apiFetch<TenantGatewaysResponse>(API_ROUTES.adminPayments.gateway(provider.toLowerCase()), { body, method: "PUT" });
