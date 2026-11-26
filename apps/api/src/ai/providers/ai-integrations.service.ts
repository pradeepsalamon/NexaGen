import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  AI_FEATURE_IDS,
  AI_FEATURES,
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  AUTO_AI_FEATURE_CHOICE,
  aiFeatureIdSchema,
  aiProviderIdSchema,
  type AiIntegrationsResponse,
  type AiProviderId,
  type AiProviderModelsResponse,
  type TestAiModelRequest,
  type TestAiModelResponse,
  type UpdateAiFeatureRequest,
  type UpdateAiProviderRequest
} from "@nexa-chess/types";
import { authenticateUser } from "../../auth/authenticate";
import { parseOrBadRequest } from "../../common/zod-body.pipe";
import { assertPlatformOperator, writePlatformAudit } from "../../platform/platform-operator";
import { PrismaService } from "../../prisma/prisma.service";
import { callChatModel, ChatModelError } from "../chat-model";
import { AiProviderRefusedError, AiProvidersService } from "./ai-providers.service";

/** A model test: the smallest request that proves the key and model answer. */
const TEST_REQUEST = {
  json: true,
  maxTokens: 20,
  system: 'Reply with the JSON object {"ok": true} and nothing else.',
  temperature: 0,
  user: "Are you there?"
};
const TEST_TIMEOUT_MS = 60_000;

function refusalMessage(error: AiProviderRefusedError): string {
  if (error.status === 401 || error.status === 403) return "The provider refused this key.";
  if (error.status === 429) return "The provider says this key is over its limit right now. Try again later.";
  if (error.status) return `The provider answered ${error.status}. Try again later.`;
  return "The provider couldn't be reached. Try again later.";
}

/**
 * The platform console's AI tab (docs/AI_PROVIDERS.md): outside AI keys and
 * the model per feature. Platform operators only; every change is in the
 * platform audit log (never the key).
 */
@Injectable()
export class AiIntegrationsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly providers: AiProvidersService
  ) {}

  async view(accessToken: string | undefined): Promise<AiIntegrationsResponse> {
    await this.operator(accessToken);
    return this.buildView();
  }

  async updateProvider(accessToken: string | undefined, providerParam: string, body: UpdateAiProviderRequest) {
    const actor = await this.operator(accessToken);
    const provider = this.provider(providerParam);
    if (!this.providers.canStore()) throw new ServiceUnavailableException("Storing AI keys isn't set up on this server.");
    const existing = await this.prisma.aiProviderCredential.findUnique({ where: { provider } });
    if (!body.apiKey && !existing) throw new BadRequestException("Enter the API key.");
    if (body.apiKey) {
      // Checked before it is stored: a key the provider refuses is never saved.
      try {
        await this.providers.listModels(provider, { apiKey: body.apiKey });
      } catch (error) {
        if (error instanceof AiProviderRefusedError) throw new BadRequestException(refusalMessage(error));
        throw error;
      }
    }
    const secret = body.apiKey ? { apiKeyEncrypted: this.providers.encrypt(body.apiKey), keyHint: body.apiKey.slice(-4) } : null;
    const data = { enabled: body.enabled, updatedById: actor.id };
    await this.prisma.$transaction(async (tx) => {
      if (secret) {
        await tx.aiProviderCredential.upsert({ create: { ...data, ...secret, provider }, update: { ...data, ...secret }, where: { provider } });
      } else {
        await tx.aiProviderCredential.update({ data, where: { provider } });
      }
      await writePlatformAudit(tx, {
        action: body.apiKey ? "ai.provider.key-saved" : "ai.provider.switched",
        actorUserId: actor.id,
        details: { enabled: body.enabled, provider }
      });
    });
    await this.providers.refresh(provider);
    return this.buildView();
  }

  async removeProvider(accessToken: string | undefined, providerParam: string) {
    const actor = await this.operator(accessToken);
    const provider = this.provider(providerParam);
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.aiProviderCredential.deleteMany({ where: { provider } });
      if (removed.count === 0) throw new NotFoundException("No key is stored for this provider.");
      await writePlatformAudit(tx, { action: "ai.provider.key-removed", actorUserId: actor.id, details: { provider } });
    });
    await this.providers.refresh(provider);
    return this.buildView();
  }

  async models(accessToken: string | undefined, providerParam: string, fresh: boolean): Promise<AiProviderModelsResponse> {
    await this.operator(accessToken);
    const provider = this.provider(providerParam);
    if (!this.providers.connected().includes(provider)) throw new BadRequestException("Connect this provider's key first.");
    try {
      const list = await this.providers.listModels(provider, { fresh });
      return { fetchedAt: list.fetchedAt.toISOString(), models: list.models, provider };
    } catch (error) {
      if (error instanceof AiProviderRefusedError) throw new ServiceUnavailableException(refusalMessage(error));
      throw error;
    }
  }

  async updateFeature(accessToken: string | undefined, featureParam: string, body: UpdateAiFeatureRequest) {
    const actor = await this.operator(accessToken);
    const feature = parseOrBadRequest(aiFeatureIdSchema, featureParam.toUpperCase(), "feature");
    const connected = this.providers.connected();
    for (const ref of [body.primary, body.fallback]) {
      if (ref && !connected.includes(ref.provider)) {
        throw new BadRequestException(`Connect ${AI_PROVIDERS[ref.provider].label} before choosing its models.`);
      }
    }
    const data = {
      fallbackModel: body.fallback?.model ?? null,
      fallbackOff: body.fallbackOff,
      fallbackProvider: body.fallback?.provider ?? null,
      primaryModel: body.primary?.model ?? null,
      primaryProvider: body.primary?.provider ?? null,
      updatedById: actor.id
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.aiFeatureModel.upsert({ create: { ...data, feature }, update: data, where: { feature } });
      await writePlatformAudit(tx, {
        action: "ai.feature.mapped",
        actorUserId: actor.id,
        details: { fallback: body.fallback, fallbackOff: body.fallbackOff, feature, primary: body.primary }
      });
    });
    await this.providers.refresh();
    return this.buildView();
  }

  async test(accessToken: string | undefined, body: TestAiModelRequest): Promise<TestAiModelResponse> {
    await this.operator(accessToken);
    const config = this.providers.configFor(body);
    if (!config) throw new BadRequestException(`Connect ${AI_PROVIDERS[body.provider].label} first.`);
    const started = Date.now();
    try {
      await callChatModel({ ...config, timeoutMs: TEST_TIMEOUT_MS }, TEST_REQUEST, new AbortController().signal);
      return { latencyMs: Date.now() - started, message: "The model answered.", ok: true, status: null };
    } catch (error) {
      const status = error instanceof ChatModelError ? error.status : null;
      const message =
        status === 404 || status === 400
          ? "The provider doesn't accept this model for chat."
          : status === 429
            ? "Over the free limit right now (or the model is busy)."
            : status === 503
              ? "The model is overloaded right now."
              : status === 401 || status === 403
                ? "The provider refused the key."
                : (error as Error).message;
      return { latencyMs: Date.now() - started, message, ok: false, status };
    }
  }

  // ── Internals ──────────────────────────────────────────────

  private async buildView(): Promise<AiIntegrationsResponse> {
    const rows = await this.prisma.aiProviderCredential.findMany();
    const connected = this.providers.connected();
    return {
      canStore: this.providers.canStore(),
      features: AI_FEATURE_IDS.map((feature) => ({
        auto: AI_FEATURES[feature].auto,
        choice: this.providers.choice(feature) ?? AUTO_AI_FEATURE_CHOICE,
        description: AI_FEATURES[feature].description,
        feature,
        label: AI_FEATURES[feature].label,
        route: this.providers.route(feature)
      })),
      providers: AI_PROVIDER_IDS.map((provider) => {
        const row = rows.find((candidate) => candidate.provider === provider);
        const info = AI_PROVIDERS[provider];
        return {
          connected: connected.includes(provider),
          dataUse: info.dataUse,
          enabled: row?.enabled ?? false,
          freeTier: info.freeTier,
          keyHint: row?.keyHint ?? null,
          keysUrl: info.keysUrl,
          label: info.label,
          provider,
          updatedAt: row?.updatedAt.toISOString() ?? null
        };
      })
    };
  }

  private provider(param: string): AiProviderId {
    return parseOrBadRequest(aiProviderIdSchema, param.toUpperCase(), "provider");
  }

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }
}
