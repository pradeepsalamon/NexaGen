import { API_ROUTES } from "@nexa-chess/types";
import type {
  AssignLeadDemoClassRequest,
  CreateLeadNoteRequest,
  LeadDetail,
  LeadDetailResponse,
  LeadListItem,
  LeadListResponse,
  LeadMetricsResponse,
  LeadNoteDto,
  ListDemoClassesResponse,
  UpdateLeadStatusRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { toQueryString, type ListParams } from "@/lib/pagination";

export async function getLeads(params: ListParams = {}): Promise<LeadListResponse> {
  return apiFetch<LeadListResponse>(API_ROUTES.adminLeads.list + toQueryString(params));
}

export async function getLeadDetails(id: string): Promise<LeadDetailResponse> {
  return apiFetch<LeadDetailResponse>(API_ROUTES.adminLeads.get(id));
}

export async function updateLeadStatus(
  id: string,
  body: UpdateLeadStatusRequest
): Promise<{ lead: LeadListItem }> {
  return apiFetch<{ lead: LeadListItem }>(API_ROUTES.adminLeads.updateStatus(id), {
    body,
    method: "PATCH"
  });
}

export async function addLeadNote(
  id: string,
  body: CreateLeadNoteRequest
): Promise<{ note: LeadNoteDto }> {
  return apiFetch<{ note: LeadNoteDto }>(API_ROUTES.adminLeads.notes(id), {
    body,
    method: "POST"
  });
}

export async function deleteLead(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(API_ROUTES.adminLeads.delete(id), {
    method: "DELETE"
  });
}

export async function getLeadMetrics(): Promise<LeadMetricsResponse> {
  return apiFetch<LeadMetricsResponse>(API_ROUTES.adminLeads.metrics);
}

export async function assignLeadDemoClass(
  id: string,
  body: AssignLeadDemoClassRequest
): Promise<{ lead: LeadDetail }> {
  return apiFetch<{ lead: LeadDetail }>(API_ROUTES.adminLeads.assignDemoClass(id), {
    body,
    method: "POST"
  });
}

/** Scheduled demo classes an admin can book a lead into. */
export async function getUpcomingDemoClasses(): Promise<ListDemoClassesResponse> {
  return apiFetch<ListDemoClassesResponse>(
    API_ROUTES.admin.demoClasses + toQueryString({ status: "SCHEDULED", pageSize: 50, sort: "startsAt", order: "asc" })
  );
}
