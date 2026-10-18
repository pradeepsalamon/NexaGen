import { API_ROUTES } from "@nexa-chess/types";
import type {
  ClassChangeRequestListResponse,
  ClassChangeRequestResponse,
  ClassRequestStatus,
  CreateClassChangeRequest,
  ReviewClassChangeRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function listClassRequests(status?: ClassRequestStatus) {
  const qs = status ? `?status=${status}` : "";
  return apiFetch<ClassChangeRequestListResponse>(API_ROUTES.classRequests.list + qs);
}

export function createClassRequest(body: CreateClassChangeRequest) {
  return apiFetch<ClassChangeRequestResponse>(API_ROUTES.classRequests.create, { method: "POST", body });
}

export function withdrawClassRequest(id: string) {
  return apiFetch<ClassChangeRequestResponse>(API_ROUTES.classRequests.withdraw(id), { method: "POST" });
}

export function approveClassRequest(id: string, body: ReviewClassChangeRequest = {}) {
  return apiFetch<ClassChangeRequestResponse>(API_ROUTES.classRequests.approve(id), { method: "POST", body });
}

export function rejectClassRequest(id: string, body: ReviewClassChangeRequest = {}) {
  return apiFetch<ClassChangeRequestResponse>(API_ROUTES.classRequests.reject(id), { method: "POST", body });
}
