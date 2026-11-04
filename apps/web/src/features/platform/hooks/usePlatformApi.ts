"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddContentPackItemRequest,
  AddPlatformTenantDomainRequest,
  ChangeTenantPlanRequest,
  ContentPackRequest,
  CreatePlatformPlanRequest,
  CreatePlatformTenantRequest,
  DuplicatePlatformPlanRequest,
  PlatformAuditResponse,
  PlatformDealRequest,
  PlatformTenantStatusRequest,
  RecordPlatformPaymentRequest,
  StartSupportSessionRequest,
  TransitionTenantSubscriptionRequest,
  UpdatePlatformPlanRequest,
  UpdatePlatformTenantRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  addPlatformContentPackItem,
  addPlatformTenantDomain,
  applyPlatformPlanToExisting,
  changePlatformTenantPlan,
  copyAcademyContentPackFolder,
  createPlatformContentPack,
  createPlatformPlan,
  createPlatformTenant,
  duplicatePlatformPlan,
  endSupportSession,
  getAcademyContentPackFolder,
  getPlatformAudit,
  getPlatformTenant,
  getPlatformTenantSubscription,
  listAcademyContentPacks,
  listAcademySupportVisits,
  listPlatformContentPacks,
  listPlatformPlans,
  listPlatformSupportSessions,
  listPlatformTenants,
  makePlatformTenantDomainPrimary,
  reactivatePlatformTenant,
  recordPlatformPayment,
  removePlatformContentPackItem,
  removePlatformTenantDomain,
  retirePlatformPlan,
  setPlatformTenantDeal,
  startSupportSession,
  suspendPlatformTenant,
  transitionPlatformTenant,
  updatePlatformContentPack,
  updatePlatformPlan,
  updatePlatformTenant
} from "../api/platformApi";

// ── Queries ──

export const usePlatformTenants = () =>
  useQuery({ queryFn: listPlatformTenants, queryKey: queryKeys.platform.tenants });

export const usePlatformTenant = (tenantId: string) =>
  useQuery({ queryFn: () => getPlatformTenant(tenantId), queryKey: queryKeys.platform.tenant(tenantId) });

export const usePlatformTenantSubscription = (tenantId: string) =>
  useQuery({
    queryFn: () => getPlatformTenantSubscription(tenantId),
    queryKey: queryKeys.platform.tenantSubscription(tenantId)
  });

export const usePlatformPlans = () => useQuery({ queryFn: listPlatformPlans, queryKey: queryKeys.platform.plans });

export const usePlatformContentPacks = () =>
  useQuery({ queryFn: listPlatformContentPacks, queryKey: queryKeys.platform.contentPacks });

export const usePlatformSupportSessions = (tenantId?: string) =>
  useQuery({
    queryFn: () => listPlatformSupportSessions(tenantId),
    queryKey: queryKeys.platform.supportSessions(tenantId)
  });

export const usePlatformAudit = (tenantId?: string) =>
  useInfiniteQuery({
    getNextPageParam: (page: PlatformAuditResponse) => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => getPlatformAudit({ cursor: pageParam, tenantId }),
    queryKey: queryKeys.platform.audit(tenantId)
  });

export const useAcademySupportVisits = (enabled: boolean) =>
  useQuery({ enabled, queryFn: listAcademySupportVisits, queryKey: queryKeys.subscription.supportVisits });

export const useAcademyContentPacks = () =>
  useQuery({ queryFn: listAcademyContentPacks, queryKey: queryKeys.subscription.contentPacks });

export const useAcademyContentPackFolder = (packId: string | null, itemId: string | null) =>
  useQuery({
    enabled: Boolean(packId && itemId),
    queryFn: () => getAcademyContentPackFolder(packId!, itemId!),
    queryKey: queryKeys.subscription.contentPackFolder(packId ?? "", itemId ?? "")
  });

// ── Mutations ──

/** Every console write: refresh the whole console (small lists), toast on success. */
function usePlatformMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, successTitle: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.platform.all });
      toast.success({ title: successTitle });
    }
  });
}

export const useCreatePlatformTenant = () =>
  usePlatformMutation((body: CreatePlatformTenantRequest) => createPlatformTenant(body), "Academy created");

export const useUpdatePlatformTenant = (tenantId: string) =>
  usePlatformMutation((body: UpdatePlatformTenantRequest) => updatePlatformTenant(tenantId, body), "Academy saved");

export const useSuspendPlatformTenant = (tenantId: string) =>
  usePlatformMutation((body: PlatformTenantStatusRequest) => suspendPlatformTenant(tenantId, body), "Academy suspended");

export const useReactivatePlatformTenant = (tenantId: string) =>
  usePlatformMutation(
    (body: PlatformTenantStatusRequest) => reactivatePlatformTenant(tenantId, body),
    "Academy reactivated"
  );

export const useAddPlatformTenantDomain = (tenantId: string) =>
  usePlatformMutation((body: AddPlatformTenantDomainRequest) => addPlatformTenantDomain(tenantId, body), "Domain added");

export const useRemovePlatformTenantDomain = (tenantId: string) =>
  usePlatformMutation((domainId: string) => removePlatformTenantDomain(tenantId, domainId), "Domain removed");

export const useMakePlatformTenantDomainPrimary = (tenantId: string) =>
  usePlatformMutation((domainId: string) => makePlatformTenantDomainPrimary(tenantId, domainId), "Primary address changed");

export const useChangePlatformTenantPlan = (tenantId: string) =>
  usePlatformMutation((body: ChangeTenantPlanRequest) => changePlatformTenantPlan(tenantId, body), "Plan changed");

export const useTransitionPlatformTenant = (tenantId: string) =>
  usePlatformMutation(
    (body: TransitionTenantSubscriptionRequest) => transitionPlatformTenant(tenantId, body),
    "Subscription status changed"
  );

export const useRecordPlatformPayment = (tenantId: string) =>
  usePlatformMutation((body: RecordPlatformPaymentRequest) => recordPlatformPayment(tenantId, body), "Payment recorded");

export const useSetPlatformTenantDeal = (tenantId: string) =>
  usePlatformMutation((body: PlatformDealRequest) => setPlatformTenantDeal(tenantId, body), "Deal saved");

export const useCreatePlatformPlan = () =>
  usePlatformMutation((body: CreatePlatformPlanRequest) => createPlatformPlan(body), "Plan created");

export const useUpdatePlatformPlan = () =>
  usePlatformMutation(
    ({ body, id }: { body: UpdatePlatformPlanRequest; id: string }) => updatePlatformPlan(id, body),
    "Plan saved as a new version"
  );

export const useDuplicatePlatformPlan = () =>
  usePlatformMutation(
    ({ body, id }: { body: DuplicatePlatformPlanRequest; id: string }) => duplicatePlatformPlan(id, body),
    "Plan duplicated"
  );

export const useRetirePlatformPlan = () => usePlatformMutation((id: string) => retirePlatformPlan(id), "Plan retired");

export const useApplyPlatformPlanToExisting = () =>
  usePlatformMutation((id: string) => applyPlatformPlanToExisting(id), "Academies moved to the latest version");

export const useStartSupportSession = (tenantId: string) =>
  usePlatformMutation((body: StartSupportSessionRequest) => startSupportSession(tenantId, body), "Support visit started");

export const useEndSupportSession = () =>
  usePlatformMutation((id: string) => endSupportSession(id), "Support visit ended");

export const useCreatePlatformContentPack = () =>
  usePlatformMutation((body: ContentPackRequest) => createPlatformContentPack(body), "Content pack created");

export const useUpdatePlatformContentPack = () =>
  usePlatformMutation(
    ({ body, id }: { body: ContentPackRequest; id: string }) => updatePlatformContentPack(id, body),
    "Content pack saved"
  );

export const useAddPlatformContentPackItem = () =>
  usePlatformMutation(
    ({ body, id }: { body: AddContentPackItemRequest; id: string }) => addPlatformContentPackItem(id, body),
    "Folder added"
  );

export const useRemovePlatformContentPackItem = () =>
  usePlatformMutation(
    ({ id, itemId }: { id: string; itemId: string }) => removePlatformContentPackItem(id, itemId),
    "Folder removed"
  );

export function useCopyAcademyContentPackFolder() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ itemId, packId }: { itemId: string; packId: string }) => copyAcademyContentPackFolder(packId, itemId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all });
      toast.success({
        message: "It is now a folder in your puzzle library: edit it like any of your own.",
        title: `${result.copied} puzzle${result.copied === 1 ? "" : "s"} copied`
      });
    }
  });
}
