import { useQuery } from "@tanstack/react-query";
import type { PlanFeatureKey } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthStore } from "@/stores/authStore";
import { getAdminSubscription, getCurrentEntitlements } from "../api/subscriptionApi";

/** What the academy's SaaS plan includes. Shared by nav filtering, page gates and feature hooks. */
export function useCurrentEntitlements() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    enabled: !!user,
    queryFn: getCurrentEntitlements,
    queryKey: queryKeys.subscription.current,
    // Plans change rarely; the API enforces every gate regardless of this cache.
    staleTime: 5 * 60_000,
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
