import { API_ROUTES } from "@nexa-chess/types";
import type {
  ApprovalRequestListResponse,
  ApprovalRequestResponse,
  ApprovalStatus,
  CreateApprovalRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// Requester side.
export function createApprovalRequest(body: CreateApprovalRequest) {
  return apiFetch<ApprovalRequestResponse>(API_ROUTES.approvals.create, { method: "POST", body });
}

export function listMyApprovalRequests() {
  return apiFetch<ApprovalRequestListResponse>(API_ROUTES.approvals.mine);
}

export function cancelApprovalRequest(id: string) {
  return apiFetch<ApprovalRequestResponse>(API_ROUTES.approvals.cancel(id), { method: "POST" });
}

// Reviewer side.
export function listApprovalRequests(status?: ApprovalStatus) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<ApprovalRequestListResponse>(API_ROUTES.adminApprovals.list + qs);
}

export function getApprovalRequest(id: string) {
  return apiFetch<ApprovalRequestResponse>(API_ROUTES.adminApprovals.get(id));
}

export function approveApprovalRequest(id: string, note?: string) {
  return apiFetch<ApprovalRequestResponse>(API_ROUTES.adminApprovals.approve(id), {
    method: "POST",
    body: note ? { note } : {}
  });
}

export function rejectApprovalRequest(id: string, reason: string) {
  return apiFetch<ApprovalRequestResponse>(API_ROUTES.adminApprovals.reject(id), {
    method: "POST",
    body: { reason }
  });
}
