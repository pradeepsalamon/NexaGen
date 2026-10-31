import {
  API_ROUTES,
  type RetentionCategory,
  type RetentionPolicyItem,
  type RetentionPolicyListResponse,
  type RetentionPreviewResponse,
  type UpdateRetentionPolicyRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function listRetentionPolicies(): Promise<RetentionPolicyListResponse> {
  return apiFetch<RetentionPolicyListResponse>(API_ROUTES.adminRetention.policies);
}

export function previewRetention(category: RetentionCategory, days: number): Promise<RetentionPreviewResponse> {
  return apiFetch<RetentionPreviewResponse>(`${API_ROUTES.adminRetention.preview(category)}?days=${days}`);
}

export function updateRetentionPolicy(
  category: RetentionCategory,
  body: UpdateRetentionPolicyRequest
): Promise<RetentionPolicyItem> {
  return apiFetch<RetentionPolicyItem>(API_ROUTES.adminRetention.policy(category), { body, method: "PUT" });
}
