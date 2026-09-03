import {
  API_ROUTES,
  type BatchLiveClassSettingsResponse,
  type CreateLiveClassPresetRequest,
  type LiveClassPolicyResponse,
  type LiveClassPreset,
  type LiveClassPresetsResponse,
  type LiveClassSettingsForClassResponse,
  type UpdateBatchLiveClassSettingsRequest,
  type UpdateLiveClassPolicyRequest,
  type UpdateLiveClassPresetRequest,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// ── Settings (layers 1–3) ──

export function getLiveClassPolicy(): Promise<LiveClassPolicyResponse> {
  return apiFetch(API_ROUTES.liveClassSettings.policy);
}

export function updateLiveClassPolicy(
  body: UpdateLiveClassPolicyRequest,
): Promise<LiveClassPolicyResponse> {
  return apiFetch(API_ROUTES.liveClassSettings.policy, { method: "PUT", body });
}

export function getClassLiveSettings(
  classId: string,
): Promise<LiveClassSettingsForClassResponse> {
  return apiFetch(API_ROUTES.liveClassSettings.forClass(classId));
}

export function updateClassLiveSettings(
  classId: string,
  body: UpdateLiveClassSettingsRequest,
): Promise<LiveClassSettingsForClassResponse> {
  return apiFetch(API_ROUTES.liveClassSettings.forClass(classId), { method: "PUT", body });
}

/** Mid-class change: applies immediately to the running session. */
export function updateLiveSettingsMidClass(
  classId: string,
  body: UpdateLiveClassSettingsRequest,
): Promise<LiveClassSettingsForClassResponse> {
  return apiFetch(API_ROUTES.liveClass.liveSettings(classId), { method: "PUT", body });
}

export function getBatchLiveClassSettings(
  batchId: string,
): Promise<BatchLiveClassSettingsResponse> {
  return apiFetch(API_ROUTES.liveClassSettings.forBatch(batchId));
}

export function updateBatchLiveClassSettings(
  batchId: string,
  body: UpdateBatchLiveClassSettingsRequest,
): Promise<BatchLiveClassSettingsResponse> {
  return apiFetch(API_ROUTES.liveClassSettings.forBatch(batchId), { method: "PUT", body });
}

// ── Presets (layer 4) ──

export function getLiveClassPresets(): Promise<LiveClassPresetsResponse> {
  return apiFetch(API_ROUTES.liveClassPresets.list);
}

export function createLiveClassPreset(
  body: CreateLiveClassPresetRequest,
): Promise<LiveClassPreset> {
  return apiFetch(API_ROUTES.liveClassPresets.create, { method: "POST", body });
}

export function updateLiveClassPreset(
  id: string,
  body: UpdateLiveClassPresetRequest,
): Promise<LiveClassPreset> {
  return apiFetch(API_ROUTES.liveClassPresets.update(id), { method: "PUT", body });
}

export function deleteLiveClassPreset(id: string): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.liveClassPresets.delete(id), { method: "DELETE" });
}

export function duplicateLiveClassPreset(id: string): Promise<LiveClassPreset> {
  return apiFetch(API_ROUTES.liveClassPresets.duplicate(id), { method: "POST" });
}

export function setDefaultLiveClassPreset(id: string): Promise<LiveClassPreset> {
  return apiFetch(API_ROUTES.liveClassPresets.setDefault(id), { method: "PUT" });
}
