import {
  API_ROUTES,
  type ClassRecapContent,
  type ClassRecapFeedResponse,
  type ClassRecapListResponse,
  type ClassRecapResponse,
  type ClassRecapReviewCount,
  type ClassRecapSettings,
  type ClassRecapStatus,
  type UpdateClassRecapSettingsRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// AI class recaps (docs/CLASS_RECAPS.md).

/** Silent: a class without a recap, or a plan without the feature, just shows nothing. */
export function getClassRecap(classId: string) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.forClass(classId), { silent: true });
}

export function listClassRecaps(query: { page: number; pageSize: number; search?: string; status?: ClassRecapStatus }) {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) });
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  return apiFetch<ClassRecapListResponse>(`${API_ROUTES.classRecaps.list}?${params.toString()}`);
}

export function getClassRecapReviewCount() {
  return apiFetch<ClassRecapReviewCount>(API_ROUTES.classRecaps.reviewCount, { silent: true });
}

export function getMyClassRecaps(cursor?: string) {
  const path = API_ROUTES.classRecaps.feedMine;
  return apiFetch<ClassRecapFeedResponse>(cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path);
}

export function saveClassRecap(classId: string, content: ClassRecapContent) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.forClass(classId), { body: { content }, method: "PUT" });
}

export function publishClassRecap(classId: string, content?: ClassRecapContent) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.publish(classId), { body: content ? { content } : {}, method: "POST" });
}

export function unpublishClassRecap(classId: string) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.unpublish(classId), { method: "POST" });
}

export function discardClassRecap(classId: string) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.discard(classId), { method: "POST" });
}

export function restoreClassRecap(classId: string) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.restore(classId), { method: "POST" });
}

export function regenerateClassRecap(classId: string) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.regenerate(classId), { method: "POST" });
}

export function rateClassRecap(classId: string, rating: 1 | -1) {
  return apiFetch<ClassRecapResponse>(API_ROUTES.classRecaps.rating(classId), { body: { rating }, method: "POST" });
}

export function getClassRecapSettings() {
  return apiFetch<ClassRecapSettings>(API_ROUTES.classRecaps.settings);
}

export function updateClassRecapSettings(body: UpdateClassRecapSettingsRequest) {
  return apiFetch<ClassRecapSettings>(API_ROUTES.classRecaps.settings, { body, method: "PATCH" });
}
