import { API_ROUTES } from "@nexa-gen/types";
import type { ListAdminBatchClassesResponse, AdminBatchClassDetailsResponse } from "@nexa-gen/types";
import { apiFetch } from "@/lib/api";

export async function getBatchClasses(): Promise<ListAdminBatchClassesResponse> {
  return await apiFetch<ListAdminBatchClassesResponse>(API_ROUTES.admin.batchClasses);
}

export async function getBatchClassDetails(id: string): Promise<AdminBatchClassDetailsResponse> {
  return await apiFetch<AdminBatchClassDetailsResponse>(API_ROUTES.admin.batchClassDetails(id));
}
