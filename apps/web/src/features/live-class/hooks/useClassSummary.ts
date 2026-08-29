import { useQuery } from "@tanstack/react-query";
import { getClassSummary } from "../api/live-class";
import { queryKeys } from "@/lib/queryKeys";

// Polls until attendance is finalized, then stops.
export function useClassSummary(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.attendance.classSummary(classId),
    queryFn: () => getClassSummary(classId),
    enabled: enabled && !!classId,
    staleTime: 0,
    retry: 1,
    refetchInterval: (query) => (query.state.data?.finalized ? false : 4000),
  });
}
