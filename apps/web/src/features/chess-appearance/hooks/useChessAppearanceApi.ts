import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  UpdateChessAppearanceAdminRequest,
  UpdateChessAppearanceRequest,
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import {
  getChessAppearanceAdmin,
  getChessAppearanceCatalog,
  getResolvedChessAppearance,
  resetChessAppearanceAdmin,
  resetMyChessAppearance,
  updateChessAppearanceAdmin,
  updateMyChessAppearance,
} from "../api/chessAppearanceApi";

export function useResolvedChessAppearanceQuery() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: queryKeys.chessAppearance.resolved,
    queryFn: getResolvedChessAppearance,
    enabled: !!user,
  });
}

export function useChessAppearanceCatalogQuery() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: queryKeys.chessAppearance.catalog,
    queryFn: getChessAppearanceCatalog,
    enabled: !!user,
  });
}

export function useUpdateChessAppearanceMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateChessAppearanceRequest) => updateMyChessAppearance(body),
    onSuccess: () => {
      toast.success({ title: "Board appearance saved" });
      qc.invalidateQueries({ queryKey: queryKeys.chessAppearance.resolved });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't save board appearance", message: error.message }),
  });
}

export function useResetChessAppearanceMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: resetMyChessAppearance,
    onSuccess: () => {
      toast.success({ title: "Board appearance reset to the default" });
      qc.invalidateQueries({ queryKey: queryKeys.chessAppearance.resolved });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't reset board appearance", message: error.message }),
  });
}

// ── Admin global default ──

export function useChessAppearanceAdminQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.chessAppearance.admin,
    queryFn: getChessAppearanceAdmin,
    enabled,
  });
}

export function useUpdateChessAppearanceAdminMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateChessAppearanceAdminRequest) => updateChessAppearanceAdmin(body),
    onSuccess: () => {
      toast.success({ title: "Global board default updated" });
      qc.invalidateQueries({ queryKey: queryKeys.chessAppearance.admin });
      qc.invalidateQueries({ queryKey: queryKeys.chessAppearance.resolved });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't update the global default", message: error.message }),
  });
}

export function useResetChessAppearanceAdminMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: resetChessAppearanceAdmin,
    onSuccess: () => {
      toast.success({ title: "Global board default reset to Nexa Classic" });
      qc.invalidateQueries({ queryKey: queryKeys.chessAppearance.admin });
      qc.invalidateQueries({ queryKey: queryKeys.chessAppearance.resolved });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't reset the global default", message: error.message }),
  });
}
