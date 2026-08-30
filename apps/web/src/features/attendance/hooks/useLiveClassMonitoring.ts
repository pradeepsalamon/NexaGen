import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { getLiveClassMonitoring } from "../api/attendanceApi";

// Polls the live roster every 10s while the class is running. The caller passes
// `enabled: false` once the class is no longer live to stop polling.
export function useLiveClassMonitoring(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.classLive(classId),
    queryFn: () => getLiveClassMonitoring(classId),
    enabled: enabled && !!classId,
    staleTime: 0,
    refetchInterval: (query) => (query.state.data && !query.state.data.isLive ? false : 10_000),
  });
}
