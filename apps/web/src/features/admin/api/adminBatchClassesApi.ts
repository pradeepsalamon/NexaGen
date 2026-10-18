import { API_ROUTES } from "@nexa-chess/types";
import type { ListAdminBatchClassesResponse, AdminBatchClassDetailsResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";
import { toQueryString, type ListParams } from "@/lib/pagination";

export async function getBatchClasses(params: ListParams = {}): Promise<ListAdminBatchClassesResponse> {
  return await apiFetch<ListAdminBatchClassesResponse>(
    API_ROUTES.admin.batchClasses + toQueryString(params)
  );
}

export async function getBatchClassDetails(id: string): Promise<AdminBatchClassDetailsResponse> {
  return await apiFetch<AdminBatchClassDetailsResponse>(API_ROUTES.admin.batchClassDetails(id));
}
