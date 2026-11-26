import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AiFeatureId, AiIntegrationsResponse, AiProviderId, UpdateAiFeatureRequest, UpdateAiProviderRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  getAiIntegrations,
  getAiProviderModels,
  removeAiProvider,
  testAiModel,
  updateAiFeature,
  updateAiProvider
} from "../api/aiProvidersApi";

export const useAiIntegrations = () => useQuery({ queryFn: getAiIntegrations, queryKey: queryKeys.platform.ai });

/** Every connected provider's model list (cached on the server for 10 minutes). */
export function useAiProviderModels(providers: readonly AiProviderId[]) {
  return useQueries({
    queries: providers.map((provider) => ({
      queryFn: () => getAiProviderModels(provider),
      queryKey: queryKeys.platform.aiModels(provider),
      staleTime: 5 * 60_000
    }))
  });
}

function useAiMutation<TArgs>(fn: (args: TArgs) => Promise<AiIntegrationsResponse>, successTitle: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.platform.ai, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.platform.aiModelsAll });
      toast.success({ title: successTitle });
    }
  });
}

export const useUpdateAiProvider = () =>
  useAiMutation(({ body, provider }: { provider: AiProviderId; body: UpdateAiProviderRequest }) => updateAiProvider(provider, body), "Saved");

export const useRemoveAiProvider = () => useAiMutation((provider: AiProviderId) => removeAiProvider(provider), "Key removed");

export const useUpdateAiFeature = () =>
  useAiMutation(({ body, feature }: { feature: AiFeatureId; body: UpdateAiFeatureRequest }) => updateAiFeature(feature, body), "Models saved");

export const useTestAiModel = () => useMutation({ mutationFn: testAiModel });

export function useRefreshAiModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: AiProviderId) => getAiProviderModels(provider, true),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.platform.aiModels(data.provider), data)
  });
}
