import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { listLiveClasses } from "../api/liveMonitorApi";

/**
 * Every class LIVE right now. The page polls fast; the sidebar badge shares the
 * same query key and only asks slowly, so one admin tab never doubles up.
 */
export function useLiveClassesMonitor(options: { refetchIntervalMs?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.liveMonitor.list,
    queryFn: listLiveClasses,
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchIntervalMs ?? 15_000,
    refetchIntervalInBackground: false
  });
}
