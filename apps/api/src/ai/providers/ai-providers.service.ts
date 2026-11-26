import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  AI_PROVIDER_IDS,
  AI_PROVIDERS,
  aiFeatureIdSchema,
  aiProviderIdSchema,
  isChatModelId,
  resolveAiFeatureRoute,
  type AiFeatureChoice,
  type AiFeatureId,
  type AiFeatureRoute,
  type AiModelRef,
  type AiProviderId,
  type AiProviderModel
} from "@nexa-chess/types";
import { decryptSecret, deriveMfaKey, encryptSecret } from "../../auth/mfa/mfa-crypto";
import { PrismaService } from "../../prisma/prisma.service";
import type { ChatModelConfig } from "../chat-model";

/** How often every process re-reads the keys and the feature mapping. */
export const AI_PROVIDERS_RELOAD_MS = 60_000;
/** A provider's model list is fetched again after this long. */
export const AI_MODEL_LIST_TTL_MS = 10 * 60_000;
const MODEL_LIST_TIMEOUT_MS = 15_000;

type ModelList = { models: AiProviderModel[]; fetchedAt: Date };

export class AiProviderRefusedError extends Error {
  constructor(readonly status: number | null) {
    super(status ? `The provider answered ${status}.` : "The provider couldn't be reached.");
  }
}

/**
 * The outside AI providers the platform connected and the model each AI
 * feature uses (docs/AI_PROVIDERS.md). Keys are stored AES-256-GCM encrypted
 * (`CREDENTIALS_ENCRYPTION_KEY`, else `MFA_ENCRYPTION_KEY`) and kept
 * decrypted in memory; every API process reloads them each
 * `AI_PROVIDERS_RELOAD_MS`, and the process that saved a change at once.
 * Only the fixed `AI_PROVIDERS` base URLs are ever called.
 */
@Injectable()
export class AiProvidersService implements OnModuleInit {
  private readonly logger = new Logger(AiProvidersService.name);
  private readonly key = (() => {
    const env = getApiEnv();
    const secret = env.CREDENTIALS_ENCRYPTION_KEY ?? env.MFA_ENCRYPTION_KEY;
    return secret ? deriveMfaKey(`ai-providers:${secret}`) : null;
  })();
  private keys = new Map<AiProviderId, string>();
  private choices = new Map<AiFeatureId, AiFeatureChoice>();
  private readonly lists = new Map<AiProviderId, ModelList>();
  private readonly warned = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  /** Re-reads keys and choices and swaps them in at once. A failed read keeps what it had. */
  @Interval(AI_PROVIDERS_RELOAD_MS)
  async reload() {
    try {
      const [credentials, features] = await Promise.all([
        this.prisma.aiProviderCredential.findMany({ where: { enabled: true } }),
        this.prisma.aiFeatureModel.findMany()
      ]);
      const keys = new Map<AiProviderId, string>();
      for (const row of credentials) {
        const key = this.decrypt(row.apiKeyEncrypted);
        if (key) keys.set(row.provider, key);
        else this.warnOnce(`${row.provider}:${row.updatedAt.getTime()}`, `The ${row.provider} key could not be decrypted; it stays off.`);
      }
      const choices = new Map<AiFeatureId, AiFeatureChoice>();
      for (const row of features) {
        const feature = aiFeatureIdSchema.safeParse(row.feature);
        if (!feature.success) continue;
        choices.set(feature.data, {
          fallback: row.fallbackProvider && row.fallbackModel ? { model: row.fallbackModel, provider: row.fallbackProvider } : null,
          fallbackOff: row.fallbackOff,
          primary: row.primaryProvider && row.primaryModel ? { model: row.primaryModel, provider: row.primaryProvider } : null
        });
      }
      for (const id of this.lists.keys()) if (!keys.has(id)) this.lists.delete(id);
      this.keys = keys;
      this.choices = choices;
    } catch (error) {
      // A missing table (migration not yet applied) must not stop the API.
      this.logger.warn(`AI provider keys not loaded: ${(error as Error).message}`);
    }
  }

  canStore(): boolean {
    return this.key !== null;
  }

  encrypt(apiKey: string): string {
    if (!this.key) throw new Error("CREDENTIALS_ENCRYPTION_KEY / MFA_ENCRYPTION_KEY is not set.");
    return encryptSecret(apiKey, this.key);
  }

  decrypt(encrypted: string): string | null {
    if (!this.key) return null;
    try {
      return decryptSecret(encrypted, this.key);
    } catch {
      return null;
    }
  }

  connected(): AiProviderId[] {
    return AI_PROVIDER_IDS.filter((id) => this.keys.has(id));
  }

  choice(feature: AiFeatureId): AiFeatureChoice | null {
    return this.choices.get(feature) ?? null;
  }

  /** What a feature runs on now (`resolveAiFeatureRoute`, with the model lists already fetched). */
  route(feature: AiFeatureId): AiFeatureRoute {
    const offered: Partial<Record<AiProviderId, string[]>> = {};
    for (const [id, list] of this.lists) offered[id] = list.models.map((m) => m.id);
    return resolveAiFeatureRoute({ choice: this.choice(feature), connected: this.connected(), feature, offered });
  }

  /** The feature's route as call configs, main first. */
  routeConfigs(feature: AiFeatureId): ChatModelConfig[] {
    const route = this.route(feature);
    return [route.primary, route.fallback].map((ref) => (ref ? this.configFor(ref) : null)).filter((c): c is ChatModelConfig => !!c);
  }

  configFor(ref: AiModelRef, apiKey: string | null = this.keys.get(ref.provider) ?? null): ChatModelConfig | null {
    if (!apiKey) return null;
    return {
      apiKey,
      model: ref.model,
      name: AI_PROVIDERS[ref.provider].label,
      provider: "OUTSIDE",
      providerId: ref.provider,
      timeoutMs: getApiEnv().AI_OUTSIDE_CALL_TIMEOUT_MS,
      url: AI_PROVIDERS[ref.provider].baseUrl
    };
  }

  /**
   * The chat models a provider offers this key, from `<baseUrl>/models`
   * (cached `AI_MODEL_LIST_TTL_MS`). `apiKey` checks a key before it is saved.
   */
  async listModels(provider: AiProviderId, options: { fresh?: boolean; apiKey?: string } = {}): Promise<ModelList> {
    const cached = this.lists.get(provider);
    if (!options.apiKey && !options.fresh && cached && Date.now() - cached.fetchedAt.getTime() < AI_MODEL_LIST_TTL_MS) return cached;
    const apiKey = options.apiKey ?? this.keys.get(provider);
    if (!apiKey) throw new AiProviderRefusedError(null);
    let response: Response;
    try {
      response = await fetch(`${AI_PROVIDERS[aiProviderIdSchema.parse(provider)].baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS)
      });
    } catch {
      throw new AiProviderRefusedError(null);
    }
    if (!response.ok) throw new AiProviderRefusedError(response.status);
    const body = (await response.json().catch(() => null)) as unknown;
    const list: ModelList = { fetchedAt: new Date(), models: parseModelList(provider, body) };
    if (!options.apiKey) this.lists.set(provider, list);
    return list;
  }

  /** After a save on this process: reload now, and drop a removed provider's list. */
  async refresh(provider?: AiProviderId) {
    if (provider) this.lists.delete(provider);
    await this.reload();
  }

  private warnOnce(key: string, message: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.logger.warn(message);
  }
}

type RawModel = {
  id?: unknown;
  name?: unknown;
  active?: unknown;
  context_window?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown };
};

/** `<baseUrl>/models` → chat models, free ones first. Unknown shapes give an empty list. */
export function parseModelList(provider: AiProviderId, body: unknown): AiProviderModel[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const models: AiProviderModel[] = [];
  for (const raw of data.slice(0, 2000) as RawModel[]) {
    if (typeof raw?.id !== "string" || raw.active === false) continue;
    // Gemini lists "models/gemini-…"; its chat API takes the bare id.
    const id = provider === "GEMINI" ? raw.id.replace(/^models\//, "") : raw.id;
    if (!isChatModelId(id) || id.length > 200) continue;
    const context = typeof raw.context_window === "number" ? raw.context_window : typeof raw.context_length === "number" ? raw.context_length : null;
    const free =
      provider === "OPENROUTER"
        ? id.endsWith(":free") || (String(raw.pricing?.prompt) === "0" && String(raw.pricing?.completion) === "0")
        : null;
    models.push({ contextWindow: context, free, id, name: typeof raw.name === "string" ? raw.name.slice(0, 200) : null });
  }
  return models.sort((a, b) => Number(b.free === true) - Number(a.free === true) || a.id.localeCompare(b.id));
}

