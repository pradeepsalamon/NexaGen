"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BrandAssetKind,
  TenantBrandingResponse,
  UpdateTenantBrandingRequest,
  UpdateWhatsAppSettingsRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  clearTenantBrandAsset,
  getTenantBranding,
  getTenantDomains,
  getWhatsAppSettings,
  setTenantWhiteLabel,
  updateTenantBranding,
  updateWhatsAppSettings,
  uploadTenantBrandAsset
} from "../api/brandingApi";

export const useTenantBranding = () => useQuery({ queryFn: getTenantBranding, queryKey: queryKeys.branding.admin });

export const useTenantDomains = (enabled: boolean) =>
  useQuery({ enabled, queryFn: getTenantDomains, queryKey: queryKeys.branding.domains });

function useBrandingMutation<TArgs>(fn: (args: TArgs) => Promise<TenantBrandingResponse>, title: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.branding.admin, data);
      void queryClient.invalidateQueries({ queryKey: ["tenant", "public-config"] });
      toast.success({ title });
    }
  });
}

export const useUpdateTenantBranding = () =>
  useBrandingMutation((body: UpdateTenantBrandingRequest) => updateTenantBranding(body), "Branding saved");

export const useUploadTenantBrandAsset = () =>
  useBrandingMutation(({ file, kind }: { file: File; kind: BrandAssetKind }) => uploadTenantBrandAsset(kind, file), "Image uploaded");

export const useClearTenantBrandAsset = () =>
  useBrandingMutation((kind: BrandAssetKind) => clearTenantBrandAsset(kind), "Image removed");

export const useSetTenantWhiteLabel = () =>
  useBrandingMutation((hidePoweredBy: boolean) => setTenantWhiteLabel({ hidePoweredBy }), "Saved");

export const useWhatsAppSettings = (enabled: boolean) =>
  useQuery({ enabled, queryFn: getWhatsAppSettings, queryKey: queryKeys.branding.whatsapp });

export function useUpdateWhatsAppSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (body: UpdateWhatsAppSettingsRequest) => updateWhatsAppSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.branding.whatsapp, data);
      toast.success({ title: "WhatsApp settings saved" });
    }
  });
}
