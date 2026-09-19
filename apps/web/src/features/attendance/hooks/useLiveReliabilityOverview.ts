import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getLiveReliabilityOverview } from "../api/attendanceApi";

// Polls the cross-class reliability view every 15s — matches the frontend's
// heartbeat ping cadence (RELIABILITY_DESIGN.md §4.1), so a class recovering
// or degrading shows up here about as fast as the underlying signal changes.
export function useLiveReliabilityOverview() {
  return useQuery({
    queryKey: queryKeys.attendance.liveReliability,
    queryFn: getLiveReliabilityOverview,
    staleTime: 0,
    refetchInterval: 15_000,
  });
}
