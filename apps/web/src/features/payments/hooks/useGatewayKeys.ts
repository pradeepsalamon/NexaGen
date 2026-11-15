"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantGatewayProvider, UpdateTenantGatewayRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { getGatewayKeys, updateGatewayKeys } from "../api/gatewayKeysApi";

export const useGatewayKeys = (enabled: boolean) =>
  useQuery({ enabled, queryFn: getGatewayKeys, queryKey: queryKeys.payments.gatewayKeys });

export function useUpdateGatewayKeys() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ body, provider }: { provider: TenantGatewayProvider; body: UpdateTenantGatewayRequest }) =>
      updateGatewayKeys(provider, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.payments.gatewayKeys, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.providerHealth });
      toast.success({ title: "Gateway keys saved" });
    },
  });
}
