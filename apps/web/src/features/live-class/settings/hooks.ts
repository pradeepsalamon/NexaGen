import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateLiveClassPresetRequest,
  UpdateBatchLiveClassSettingsRequest,
  UpdateLiveClassPolicyRequest,
  UpdateLiveClassPresetRequest,
  UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import { writeLastUsedClassSettings } from "./lastUsed";
import {
  createLiveClassPreset,
  deleteLiveClassPreset,
  duplicateLiveClassPreset,
  getBatchLiveClassSettings,
  getClassLiveSettings,
  getLiveClassPolicy,
  getLiveClassPresets,
  getLiveClassSettingsAudit,
  setDefaultLiveClassPreset,
  updateBatchLiveClassSettings,
  updateClassLiveSettings,
  updateLiveClassPolicy,
  updateLiveClassPreset,
  updateLiveSettingsMidClass,
} from "./api";

// ── Policy ──

export function useLiveClassPolicy(enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveClassSettings.policy,
    queryFn: getLiveClassPolicy,
    enabled,
  });
}

export function useLiveClassSettingsAudit(enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveClassSettings.audit,
    queryFn: getLiveClassSettingsAudit,
    enabled,
  });
}

export function useUpdateLiveClassPolicy() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateLiveClassPolicyRequest) => updateLiveClassPolicy(body),
    onSuccess: () => {
      toast.success({ title: "Live class defaults updated" });
      qc.invalidateQueries({ queryKey: queryKeys.liveClassSettings.policy });
      qc.invalidateQueries({ queryKey: queryKeys.liveClassSettings.audit });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't update defaults", message: error.message }),
  });
}

// ── Per-class ──

export function useClassLiveSettings(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveClassSettings.forClass(classId),
    queryFn: () => getClassLiveSettings(classId),
    enabled: enabled && !!classId,
  });
}

export function useUpdateClassLiveSettings(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    mutationFn: (body: UpdateLiveClassSettingsRequest) => updateClassLiveSettings(classId, body),
    onSuccess: (_data, body) => {
      // Remember these choices so the next class this coach configures starts
      // on them instead of back at the inherited defaults.
      writeLastUsedClassSettings(userId, body.liveClassSettings);
      toast.success({ title: "Class settings saved" });
      qc.invalidateQueries({ queryKey: queryKeys.liveClassSettings.forClass(classId) });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't save class settings", message: error.message }),
  });
}

export function useUpdateLiveSettingsMidClass(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const userId = useAuthStore((state) => state.user?.id);
  return useMutation({
    mutationFn: (body: UpdateLiveClassSettingsRequest) =>
      updateLiveSettingsMidClass(classId, body),
    onSuccess: (_data, body) => {
      writeLastUsedClassSettings(userId, body.liveClassSettings);
      toast.success({ title: "Class settings applied" });
      qc.invalidateQueries({ queryKey: queryKeys.liveClassSettings.forClass(classId) });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't apply settings", message: error.message }),
  });
}

// ── Per-batch ──

export function useBatchLiveClassSettings(batchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveClassSettings.forBatch(batchId ?? ""),
    queryFn: () => getBatchLiveClassSettings(batchId as string),
    enabled: enabled && !!batchId,
  });
}

export function useUpdateBatchLiveClassSettings(batchId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateBatchLiveClassSettingsRequest) =>
      updateBatchLiveClassSettings(batchId, body),
    onSuccess: () => {
      toast.success({ title: "Batch defaults updated" });
      qc.invalidateQueries({ queryKey: queryKeys.liveClassSettings.forBatch(batchId) });
      qc.invalidateQueries({ queryKey: queryKeys.liveClassSettings.audit });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't update batch defaults", message: error.message }),
  });
}

// ── Presets ──

export function useLiveClassPresets(enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveClassPresets.all,
    queryFn: getLiveClassPresets,
    enabled,
  });
}

function usePresetInvalidator() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.liveClassPresets.all });
}

export function useCreateLiveClassPreset() {
  const toast = useToast();
  const invalidate = usePresetInvalidator();
  return useMutation({
    mutationFn: (body: CreateLiveClassPresetRequest) => createLiveClassPreset(body),
    onSuccess: () => {
      toast.success({ title: "Preset created" });
      invalidate();
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't create preset", message: error.message }),
  });
}

export function useUpdateLiveClassPreset() {
  const toast = useToast();
  const invalidate = usePresetInvalidator();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLiveClassPresetRequest }) =>
      updateLiveClassPreset(id, body),
    onSuccess: () => {
      toast.success({ title: "Preset updated" });
      invalidate();
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't update preset", message: error.message }),
  });
}

export function useDeleteLiveClassPreset() {
  const toast = useToast();
  const invalidate = usePresetInvalidator();
  return useMutation({
    mutationFn: (id: string) => deleteLiveClassPreset(id),
    onSuccess: () => {
      toast.success({ title: "Preset deleted" });
      invalidate();
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't delete preset", message: error.message }),
  });
}

export function useDuplicateLiveClassPreset() {
  const toast = useToast();
  const invalidate = usePresetInvalidator();
  return useMutation({
    mutationFn: (id: string) => duplicateLiveClassPreset(id),
    onSuccess: () => {
      toast.success({ title: "Preset duplicated" });
      invalidate();
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't duplicate preset", message: error.message }),
  });
}

export function useSetDefaultLiveClassPreset() {
  const toast = useToast();
  const invalidate = usePresetInvalidator();
  return useMutation({
    mutationFn: (id: string) => setDefaultLiveClassPreset(id),
    onSuccess: () => {
      toast.success({ title: "Default preset updated" });
      invalidate();
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't set default preset", message: error.message }),
  });
}
