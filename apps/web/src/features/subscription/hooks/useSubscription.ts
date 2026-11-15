import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConfirmPlatformCheckoutRequest, PlanFeatureKey } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import {
  confirmPlatformCheckout,
  getAcademyBilling,
  getAcademyInvoice,
  getAdminSubscription,
  getCurrentEntitlements,
  startPlatformCheckout,
} from "../api/subscriptionApi";

/** What the academy's SaaS plan includes. Shared by nav filtering, page gates and feature hooks. */
export function useCurrentEntitlements() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    enabled: !!user,
    queryFn: getCurrentEntitlements,
    queryKey: queryKeys.subscription.current,
    // Plans change rarely; the API enforces every gate regardless of this cache.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/**
 * `true` / `false` once known, `undefined` while loading. A query for a gated
 * feature should run only on `=== true`, so a lower plan never polls into 402s.
 */
export function usePlanFeature(feature: PlanFeatureKey): boolean | undefined {
  const { data } = useCurrentEntitlements();
  return data ? data.features.includes(feature) : undefined;
}

export function useAdminSubscription() {
  return useQuery({
    queryFn: getAdminSubscription,
    queryKey: queryKeys.subscription.admin,
  });
}

// ── Paying the platform (SaaS Phase 6) ──

export function useAcademyBilling(enabled = true) {
  return useQuery({ enabled, queryFn: getAcademyBilling, queryKey: queryKeys.subscription.billing });
}

export function useAcademyInvoice(id: string) {
  return useQuery({ queryFn: () => getAcademyInvoice(id), queryKey: queryKeys.subscription.invoice(id) });
}

export function useStartPlatformCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startPlatformCheckout,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.billing }),
  });
}

/** Asks the API to read the order from the gateway; refreshes the plan view when it is paid. */
export function useConfirmPlatformCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, id }: { id: string; body: ConfirmPlatformCheckoutRequest }) => confirmPlatformCheckout(id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all }),
  });
}
