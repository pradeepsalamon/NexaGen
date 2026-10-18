import { useQuery } from "@tanstack/react-query";
import type { ClassRequestStatus } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { listClassRequests } from "../api/classRequestsApi";

export function useClassRequests(status?: ClassRequestStatus) {
  return useQuery({
    queryKey: queryKeys.classRequests.list(status),
    queryFn: () => listClassRequests(status)
  });
}

/** Approving changes the schedule, so class lists refetch alongside the requests. */
export const CLASS_REQUEST_INVALIDATES = [
  queryKeys.classRequests.all,
  queryKeys.coach.upcomingClasses,
  queryKeys.coach.classes,
  queryKeys.coach.dashboard
];
