import {
  API_ROUTES,
  type AiFeatureId,
  type AiIntegrationsResponse,
  type AiProviderId,
  type AiProviderModelsResponse,
  type TestAiModelRequest,
  type TestAiModelResponse,
  type UpdateAiFeatureRequest,
  type UpdateAiProviderRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

// Platform console, AI tab (docs/AI_PROVIDERS.md). Platform operators only.

export const getAiIntegrations = () => apiFetch<AiIntegrationsResponse>(API_ROUTES.platform.ai);

export const updateAiProvider = (provider: AiProviderId, body: UpdateAiProviderRequest) =>
  apiFetch<AiIntegrationsResponse>(API_ROUTES.platform.aiProvider(provider), { body, method: "PUT" });

export const removeAiProvider = (provider: AiProviderId) =>
  apiFetch<AiIntegrationsResponse>(API_ROUTES.platform.aiProvider(provider), { method: "DELETE" });

export const getAiProviderModels = (provider: AiProviderId, fresh = false) =>
  apiFetch<AiProviderModelsResponse>(API_ROUTES.platform.aiProviderModels(provider), {
    params: fresh ? { fresh: "1" } : undefined,
    silent: true
  });

export const updateAiFeature = (feature: AiFeatureId, body: UpdateAiFeatureRequest) =>
  apiFetch<AiIntegrationsResponse>(API_ROUTES.platform.aiFeature(feature), { body, method: "PUT" });

export const testAiModel = (body: TestAiModelRequest) =>
  apiFetch<TestAiModelResponse>(API_ROUTES.platform.aiTest, { body, method: "POST" });
