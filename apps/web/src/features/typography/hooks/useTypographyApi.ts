import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateTypographyAdminRequest, UpdateTypographyRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { useAuthStore } from "@/stores/authStore";
import {
  getResolvedTypography,
  getTypographyAdmin,
  resetMyTypography,
  resetTypographyAdmin,
  updateMyTypography,
  updateTypographyAdmin,
} from "../api/typographyApi";

export function useResolvedTypographyQuery() {
  const user = useAuthStore((state) => state.user);
  return useQuery({
    queryKey: queryKeys.typography.resolved,
    queryFn: getResolvedTypography,
    enabled: !!user,
  });
}

export function useUpdateTypographyMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateTypographyRequest) => updateMyTypography(body),
    onSuccess: (data) => {
      toast.success({ title: "Text settings saved" });
      qc.setQueryData(queryKeys.typography.resolved, data);
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't save text settings", message: error.message }),
  });
}

export function useResetTypographyMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: resetMyTypography,
    onSuccess: (data) => {
      toast.success({ title: "Text settings reset to the default" });
      qc.setQueryData(queryKeys.typography.resolved, data);
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't reset text settings", message: error.message }),
  });
}

export function useTypographyAdminQuery() {
  return useQuery({
    queryKey: queryKeys.typography.admin,
    queryFn: getTypographyAdmin,
  });
}

export function useUpdateTypographyAdminMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateTypographyAdminRequest) => updateTypographyAdmin(body),
    onSuccess: (data) => {
      toast.success({ title: "Platform fonts updated" });
      qc.setQueryData(queryKeys.typography.admin, data);
      qc.invalidateQueries({ queryKey: queryKeys.typography.resolved });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't update the platform fonts", message: error.message }),
  });
}

export function useResetTypographyAdminMutation() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: resetTypographyAdmin,
    onSuccess: (data) => {
      toast.success({ title: "Platform fonts reset to Outfit + Nunito Sans" });
      qc.setQueryData(queryKeys.typography.admin, data);
      qc.invalidateQueries({ queryKey: queryKeys.typography.resolved });
    },
    onError: (error: Error) =>
      toast.error({ title: "Couldn't reset the platform fonts", message: error.message }),
  });
}
