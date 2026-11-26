import type { ClassRecapFeedResponse, ClassRecapStatus, UpdateClassRecapSettingsRequest } from "@nexa-chess/types";
import { useMemo } from "react";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NavBadge } from "@/components/layout/navItems";
import { queryKeys } from "@/lib/queryKeys";
import {
  getClassRecap,
  getClassRecapReviewCount,
  getClassRecapSettings,
  getMyClassRecaps,
  listClassRecaps,
  updateClassRecapSettings
} from "../api/classRecapApi";

/** One class's recap: the staff view for its coach and admins, the published view for its students. */
export function useClassRecap(classId: string | null, enabled = true) {
  return useQuery({
    enabled: enabled && !!classId,
    queryKey: queryKeys.classRecaps.forClass(classId ?? ""),
    queryFn: () => getClassRecap(classId!),
    // While a draft is being written, look again now and then.
    refetchInterval: (query) => {
      const data = query.state.data;
      const status = data?.viewer === "STAFF" ? data.recap?.status : null;
      return status === "QUEUED" || status === "RUNNING" ? 60_000 : false;
    },
    retry: false
  });
}

export function useClassRecapList(params: { page: number; pageSize: number; search?: string; status?: ClassRecapStatus }) {
  return useQuery({
    placeholderData: keepPreviousData,
    queryKey: queryKeys.classRecaps.list(params),
    queryFn: () => listClassRecaps(params)
  });
}

/** Drafts waiting for review (the nav badge). */
export function useClassRecapReviewCount(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: queryKeys.classRecaps.reviewCount,
    queryFn: getClassRecapReviewCount,
    refetchInterval: 5 * 60_000,
    retry: false
  });
}

export function useMyClassRecaps() {
  return useInfiniteQuery({
    getNextPageParam: (last: ClassRecapFeedResponse) => last.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
    queryKey: queryKeys.classRecaps.feedMine,
    queryFn: ({ pageParam }) => getMyClassRecaps(pageParam)
  });
}

export function useClassRecapSettings() {
  return useQuery({ queryKey: queryKeys.classRecaps.settings, queryFn: getClassRecapSettings });
}

export function useUpdateClassRecapSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateClassRecapSettingsRequest) => updateClassRecapSettings(body),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.classRecaps.settings, settings)
  });
}

/** The "Class recaps" nav badge: drafts waiting for review (coach: own classes; admin: all). */
export function useClassRecapNavBadge(enabled: boolean): NavBadge | undefined {
  const { data } = useClassRecapReviewCount(enabled);
  const ready = data?.ready ?? 0;
  return useMemo<NavBadge | undefined>(
    () => (ready > 0 ? { label: ready > 99 ? "99+" : String(ready), tone: "accent" } : undefined),
    [ready]
  );
}
