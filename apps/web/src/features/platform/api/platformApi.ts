import {
  API_ROUTES,
  type AddContentPackItemRequest,
  type AddPlatformTenantDomainRequest,
  type AuthResponse,
  type ChangeTenantPlanRequest,
  type ContentPackFolderResponse,
  type ContentPackRequest,
  type ContentPackSummary,
  type ContentPacksResponse,
  type CopyContentPackFolderResponse,
  type CreatePlatformPlanRequest,
  type CreatePlatformTenantRequest,
  type DuplicatePlatformPlanRequest,
  type EnterSupportSessionRequest,
  type PlatformAuditResponse,
  type PlatformDealRequest,
  type PlatformPlanSummary,
  type PlatformPlansResponse,
  type PlatformSupportSessionsResponse,
  type PlatformTenantResponse,
  type PlatformTenantStatusRequest,
  type PlatformTenantSubscriptionResponse,
  type PlatformTenantsResponse,
  type RecordPlatformPaymentRequest,
  type StartSupportSessionRequest,
  type StartSupportSessionResponse,
  type TransitionTenantSubscriptionRequest,
  type UpdatePlatformPlanRequest,
  type UpdatePlatformTenantRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// ── Platform console (Nexa's super admins only; the API checks every call) ──

export const listPlatformTenants = () => apiFetch<PlatformTenantsResponse>(API_ROUTES.platform.tenants);

export const getPlatformTenant = (tenantId: string) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenant(tenantId));

export const createPlatformTenant = (body: CreatePlatformTenantRequest) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenants, { body, method: "POST" });

export const updatePlatformTenant = (tenantId: string, body: UpdatePlatformTenantRequest) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenant(tenantId), { body, method: "PATCH" });

export const suspendPlatformTenant = (tenantId: string, body: PlatformTenantStatusRequest) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenantSuspend(tenantId), { body, method: "POST" });

export const reactivatePlatformTenant = (tenantId: string, body: PlatformTenantStatusRequest) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenantReactivate(tenantId), { body, method: "POST" });

export const addPlatformTenantDomain = (tenantId: string, body: AddPlatformTenantDomainRequest) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenantDomains(tenantId), { body, method: "POST" });

export const removePlatformTenantDomain = (tenantId: string, domainId: string) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenantDomain(tenantId, domainId), { method: "DELETE" });

export const makePlatformTenantDomainPrimary = (tenantId: string, domainId: string) =>
  apiFetch<PlatformTenantResponse>(API_ROUTES.platform.tenantDomainPrimary(tenantId, domainId), { method: "POST" });

export const getPlatformAudit = (params: { cursor?: string; tenantId?: string }) => {
  const search = new URLSearchParams();
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.tenantId) search.set("tenantId", params.tenantId);
  const query = search.toString();
  return apiFetch<PlatformAuditResponse>(`${API_ROUTES.platform.audit}${query ? `?${query}` : ""}`);
};

export const getPlatformTenantSubscription = (tenantId: string) =>
  apiFetch<PlatformTenantSubscriptionResponse>(API_ROUTES.platform.tenantSubscription(tenantId));

export const changePlatformTenantPlan = (tenantId: string, body: ChangeTenantPlanRequest) =>
  apiFetch<PlatformTenantSubscriptionResponse>(API_ROUTES.platform.tenantPlan(tenantId), { body, method: "POST" });

export const transitionPlatformTenant = (tenantId: string, body: TransitionTenantSubscriptionRequest) =>
  apiFetch<PlatformTenantSubscriptionResponse>(API_ROUTES.platform.tenantTransition(tenantId), { body, method: "POST" });

export const recordPlatformPayment = (tenantId: string, body: RecordPlatformPaymentRequest) =>
  apiFetch<PlatformTenantSubscriptionResponse>(API_ROUTES.platform.tenantPayments(tenantId), { body, method: "POST" });

export const setPlatformTenantDeal = (tenantId: string, body: PlatformDealRequest) =>
  apiFetch<PlatformTenantSubscriptionResponse>(API_ROUTES.platform.tenantDeal(tenantId), { body, method: "PUT" });

export const listPlatformPlans = () => apiFetch<PlatformPlansResponse>(API_ROUTES.platform.plans);

export const createPlatformPlan = (body: CreatePlatformPlanRequest) =>
  apiFetch<{ plan: PlatformPlanSummary }>(API_ROUTES.platform.plans, { body, method: "POST" });

export const updatePlatformPlan = (id: string, body: UpdatePlatformPlanRequest) =>
  apiFetch<{ plan: PlatformPlanSummary }>(API_ROUTES.platform.plan(id), { body, method: "PATCH" });

export const duplicatePlatformPlan = (id: string, body: DuplicatePlatformPlanRequest) =>
  apiFetch<{ plan: PlatformPlanSummary }>(API_ROUTES.platform.planDuplicate(id), { body, method: "POST" });

export const retirePlatformPlan = (id: string) =>
  apiFetch<{ plan: PlatformPlanSummary }>(API_ROUTES.platform.planRetire(id), { method: "POST" });

export const applyPlatformPlanToExisting = (id: string) =>
  apiFetch<{ updated: number }>(API_ROUTES.platform.planApplyToExisting(id), { method: "POST" });

export const startSupportSession = (tenantId: string, body: StartSupportSessionRequest) =>
  apiFetch<StartSupportSessionResponse>(API_ROUTES.platform.tenantSupport(tenantId), { body, method: "POST" });

export const listPlatformSupportSessions = (tenantId?: string) =>
  apiFetch<PlatformSupportSessionsResponse>(
    tenantId
      ? `${API_ROUTES.platform.supportSessions}?${new URLSearchParams({ tenantId }).toString()}`
      : API_ROUTES.platform.supportSessions
  );

export const endSupportSession = (id: string) =>
  apiFetch<{ ok: true }>(API_ROUTES.platform.supportSessionEnd(id), { method: "POST" });

export const listPlatformContentPacks = () => apiFetch<ContentPacksResponse>(API_ROUTES.platform.contentPacks);

export const createPlatformContentPack = (body: ContentPackRequest) =>
  apiFetch<{ pack: ContentPackSummary }>(API_ROUTES.platform.contentPacks, { body, method: "POST" });

export const updatePlatformContentPack = (id: string, body: ContentPackRequest) =>
  apiFetch<{ pack: ContentPackSummary }>(API_ROUTES.platform.contentPack(id), { body, method: "PUT" });

export const addPlatformContentPackItem = (id: string, body: AddContentPackItemRequest) =>
  apiFetch<{ pack: ContentPackSummary }>(API_ROUTES.platform.contentPackItems(id), { body, method: "POST" });

export const removePlatformContentPackItem = (id: string, itemId: string) =>
  apiFetch<{ pack: ContentPackSummary }>(API_ROUTES.platform.contentPackItem(id, itemId), { method: "DELETE" });

// ── The academy's side ──

export const listAcademySupportVisits = () =>
  apiFetch<PlatformSupportSessionsResponse>(API_ROUTES.subscription.supportVisits);

export const listAcademyContentPacks = () => apiFetch<ContentPacksResponse>(API_ROUTES.subscription.contentPacks);

export const getAcademyContentPackFolder = (packId: string, itemId: string) =>
  apiFetch<ContentPackFolderResponse>(API_ROUTES.subscription.contentPackFolder(packId, itemId));

export const copyAcademyContentPackFolder = (packId: string, itemId: string) =>
  apiFetch<CopyContentPackFolderResponse>(API_ROUTES.subscription.contentPackFolderCopy(packId, itemId), {
    method: "POST"
  });

/** The one-time support link: signs this browser in on the academy's own host. */
export const enterSupportSession = (body: EnterSupportSessionRequest) =>
  apiFetch<AuthResponse>(API_ROUTES.auth.supportEnter, { body, method: "POST" });
