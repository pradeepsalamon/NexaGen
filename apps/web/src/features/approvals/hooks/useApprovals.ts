import { useQuery } from "@tanstack/react-query";
import type { ApprovalStatus } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { listApprovalRequests, listMyApprovalRequests, listOtherRequestQueues } from "../api/approvalsApi";

export function useMyApprovalRequests() {
  return useQuery({ queryKey: queryKeys.approvals.mine, queryFn: listMyApprovalRequests });
}

export function useApprovalRequests(status?: ApprovalStatus) {
  return useQuery({ queryKey: queryKeys.approvals.admin(status), queryFn: () => listApprovalRequests(status) });
}

export function useOtherRequestQueues() {
  return useQuery({ queryKey: queryKeys.approvals.queues, queryFn: listOtherRequestQueues });
}

/** An approval can cancel, add or move a class or let a student in, so class lists refetch too. */
export const APPROVAL_INVALIDATES = [
  queryKeys.approvals.all,
  queryKeys.coach.upcomingClasses,
  queryKeys.coach.classes,
  queryKeys.coach.dashboard
];
