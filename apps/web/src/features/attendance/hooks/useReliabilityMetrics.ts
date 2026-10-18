import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getReliabilityMetrics } from "../api/attendanceApi";

// Trailing-window webhook-loss / heartbeat-fallback rate (RELIABILITY_
// DESIGN.md §6, Phase 6). Not live data — refetching every few seconds would
// be pointless — so no polling interval.
export function useReliabilityMetrics(days = 30) {
  return useQuery({
    queryKey: queryKeys.attendance.reliabilityMetrics(days),
    queryFn: () => getReliabilityMetrics(days),
  });
}
