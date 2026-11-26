import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Outside AI providers and which model each AI feature uses
// (docs/AI_PROVIDERS.md).
//
//  - Platform operators (Nexa's super admins) connect the providers' keys in
//    the platform console; every academy uses them. Only the fixed providers
//    below can be connected, so the server only ever calls these hosts.
//  - Each feature has a main model and a fallback (used when the main one is
//    out of quota, overloaded or down). Left on "Auto", the feature uses the
//    first model of its `auto` list whose provider is connected:
//    `resolveAiFeatureRoute` is the one rule.
//  - A new AI feature = an `AI_FEATURE_IDS` entry + its `AI_FEATURES` row.
// ──────────────────────────────────────────────────────────────

export const AI_PROVIDER_IDS = ["GROQ", "GEMINI", "OPENROUTER"] as const;
export const aiProviderIdSchema = z.enum(AI_PROVIDER_IDS);
export type AiProviderId = z.infer<typeof aiProviderIdSchema>;

export type AiProviderInfo = {
  label: string;
  /** OpenAI-compatible base: `<baseUrl>/chat/completions`, `<baseUrl>/models`. */
  baseUrl: string;
  /** Where an operator makes a key. */
  keysUrl: string;
  /** What the free tier allows (measured 2026-11-25, docs/ai/PROVIDER_EVAL.md §2). */
  freeTier: string;
  /** What the provider may do with what it is sent (§2.1); shown next to the key. */
  dataUse: string;
};

export const AI_PROVIDERS: Record<AiProviderId, AiProviderInfo> = {
  GEMINI: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    dataUse:
      "On the free tier Google may use what is sent to improve its products, with human reviewers. A billing account on the project turns this off.",
    freeTier: "Flash-Lite: 15 requests a minute, 500 a day. Flash: 20 a day. Resets 00:00 Pacific.",
    keysUrl: "https://aistudio.google.com/apikey",
    label: "Google Gemini"
  },
  GROQ: {
    baseUrl: "https://api.groq.com/openai/v1",
    dataUse: "Not kept by default; switch on Zero Data Retention in Groq's Data Controls before going live.",
    freeTier: "Each model: 30 requests and 8,000 tokens a minute, 1,000 requests and 200,000 tokens a day.",
    keysUrl: "https://console.groq.com/keys",
    label: "Groq"
  },
  OPENROUTER: {
    baseUrl: "https://openrouter.ai/api/v1",
    dataUse: "OpenRouter doesn't train on inputs, but some free models' hosts may: check the account's privacy settings.",
    freeTier: "All free models together: 20 requests a minute, 50 a day for the account (1,000 after buying 10 credits).",
    keysUrl: "https://openrouter.ai/settings/keys",
    label: "OpenRouter"
  }
};

/** Host names the server may call; a provider's base URL must be one of these. */
export const AI_PROVIDER_HOSTS: readonly string[] = AI_PROVIDER_IDS.map((id) => new URL(AI_PROVIDERS[id].baseUrl).hostname);

export const aiModelRefSchema = z
  .object({
    provider: aiProviderIdSchema,
    model: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[\w.:/@+-]+$/, "Not a model id.")
  })
  .strict();
export type AiModelRef = z.infer<typeof aiModelRefSchema>;

export const sameAiModel = (a: AiModelRef | null | undefined, b: AiModelRef | null | undefined) =>
  !!a && !!b && a.provider === b.provider && a.model === b.model;

// ── Features ────────────────────────────────────────────────

export const AI_FEATURE_IDS = ["CLASS_RECAP", "PLAY_REVIEW_COMMENT"] as const;
export const aiFeatureIdSchema = z.enum(AI_FEATURE_IDS);
export type AiFeatureId = z.infer<typeof aiFeatureIdSchema>;

export type AiFeatureInfo = {
  label: string;
  description: string;
  /**
   * "Auto" order, best first (docs/ai/PROVIDER_EVAL.md §6: quality, free
   * quota at medium volume, speed). Gemini Flash (20 a day) and models that
   * spend most tokens thinking are left out on purpose.
   */
  auto: readonly AiModelRef[];
};

export const AI_FEATURES: Record<AiFeatureId, AiFeatureInfo> = {
  CLASS_RECAP: {
    auto: [
      { model: "qwen/qwen3.8-27b", provider: "GROQ" },
      { model: "gemini-3.1-flash-lite", provider: "GEMINI" },
      { model: "nvidia/nemotron-3.5-super-vl:free", provider: "OPENROUTER" },
      { model: "openai/gpt-oss-120b", provider: "GROQ" }
    ],
    description:
      "Drafts the class recap from the coach's transcript, for academies that chose the outside AI (docs/CLASS_RECAPS.md).",
    label: "AI class recaps"
  },
  PLAY_REVIEW_COMMENT: {
    auto: [
      { model: "qwen/qwen3.8-27b", provider: "GROQ" },
      { model: "gemini-3.1-flash-lite", provider: "GEMINI" },
      { model: "nvidia/nemotron-3.5-super-vl:free", provider: "OPENROUTER" }
    ],
    description:
      "Short coach-style comments on a student's play, only for students whose outside-AI switch is on (docs/AI_PLAY_REVIEW.md).",
    label: "AI play review comments"
  }
};

/** What an operator chose for a feature. A null model means "Auto". */
export type AiFeatureChoice = {
  primary: AiModelRef | null;
  fallback: AiModelRef | null;
  /** No fallback at all (otherwise a null `fallback` is Auto). */
  fallbackOff: boolean;
};

export const AUTO_AI_FEATURE_CHOICE: AiFeatureChoice = { fallback: null, fallbackOff: false, primary: null };

export type AiRouteModel = AiModelRef & { auto: boolean };
export type AiFeatureRoute = { primary: AiRouteModel | null; fallback: AiRouteModel | null };

/**
 * The models a feature uses right now: the operator's choice where its
 * provider is connected (and, when the provider's model list is known, the
 * model is still offered), else the first usable model of the feature's
 * `auto` list. The fallback prefers another provider (one provider's outage
 * or quota then can't stop both) and is never the main model.
 */
export function resolveAiFeatureRoute(input: {
  feature: AiFeatureId;
  choice: AiFeatureChoice | null;
  connected: readonly AiProviderId[];
  /** Model ids each provider offers, where known (an unknown list doesn't block). */
  offered?: Partial<Record<AiProviderId, readonly string[]>>;
}): AiFeatureRoute {
  const choice = input.choice ?? AUTO_AI_FEATURE_CHOICE;
  const usable = (ref: AiModelRef | null): ref is AiModelRef => {
    if (!ref || !input.connected.includes(ref.provider)) return false;
    const list = input.offered?.[ref.provider];
    return !list || list.includes(ref.model);
  };
  const auto = AI_FEATURES[input.feature].auto.filter(usable);

  const primary: AiRouteModel | null = usable(choice.primary)
    ? { ...choice.primary, auto: false }
    : auto[0]
      ? { ...auto[0], auto: true }
      : null;
  if (!primary || choice.fallbackOff) return { fallback: null, primary };

  if (usable(choice.fallback) && !sameAiModel(choice.fallback, primary)) {
    return { fallback: { ...choice.fallback, auto: false }, primary };
  }
  const others = auto.filter((ref) => !sameAiModel(ref, primary));
  const pick = others.find((ref) => ref.provider !== primary.provider) ?? others[0];
  return { fallback: pick ? { ...pick, auto: true } : null, primary };
}

/** The providers a route may send to, main first, no repeats. */
export function aiRouteProviders(route: AiFeatureRoute): AiProviderId[] {
  const ids = [route.primary?.provider, route.fallback?.provider].filter((id): id is AiProviderId => !!id);
  return [...new Set(ids)];
}

/** "Groq", "Groq or Google Gemini": how a route's providers are named to people. */
export function aiProviderNames(providers: readonly AiProviderId[]): string | null {
  if (providers.length === 0) return null;
  return providers.map((id) => AI_PROVIDERS[id].label).join(" or ");
}

// ── Model lists ─────────────────────────────────────────────

/** Model ids that never answer chat (speech, moderation, embeddings, images). */
const NOT_CHAT_MODEL = /(whisper|tts|orpheus|playai|guard|embed|moderation|imagen|veo|aqa|-image|lyria|-live-|transcribe|audio)/i;

export function isChatModelId(id: string): boolean {
  return !NOT_CHAT_MODEL.test(id);
}

export type AiProviderModel = {
  id: string;
  /** The provider's display name, when it gives one. */
  name: string | null;
  /** Costs nothing on this account's free tier (OpenRouter `:free` / zero price); null when the provider doesn't say. */
  free: boolean | null;
  contextWindow: number | null;
};

export type AiProviderModelsResponse = {
  provider: AiProviderId;
  models: AiProviderModel[];
  /** ISO-8601 UTC. */
  fetchedAt: string;
};

// ── Console views and requests ──────────────────────────────

export type AiProviderView = {
  provider: AiProviderId;
  label: string;
  keysUrl: string;
  freeTier: string;
  dataUse: string;
  /** A key is stored and switched on. */
  connected: boolean;
  enabled: boolean;
  /** The key's last 4 characters, for recognising it; never the key. */
  keyHint: string | null;
  /** ISO-8601 UTC. */
  updatedAt: string | null;
};

export type AiFeatureView = {
  feature: AiFeatureId;
  label: string;
  description: string;
  choice: AiFeatureChoice;
  /** What runs now (`resolveAiFeatureRoute`). */
  route: AiFeatureRoute;
  auto: readonly AiModelRef[];
};

export type AiIntegrationsResponse = {
  /** The server can encrypt keys (`CREDENTIALS_ENCRYPTION_KEY` / `MFA_ENCRYPTION_KEY`). */
  canStore: boolean;
  providers: AiProviderView[];
  features: AiFeatureView[];
};

/** Save a provider's key. A left-out key keeps the stored one (to switch it on/off). */
export const updateAiProviderRequestSchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .min(8, "That doesn't look like a key.")
      .max(500)
      .regex(/^[\x21-\x7e]+$/, "A key has no spaces.")
      .optional(),
    enabled: z.boolean()
  })
  .strict();
export type UpdateAiProviderRequest = z.infer<typeof updateAiProviderRequestSchema>;

export const updateAiFeatureRequestSchema = z
  .object({
    primary: aiModelRefSchema.nullable(),
    fallback: aiModelRefSchema.nullable(),
    fallbackOff: z.boolean()
  })
  .strict()
  .refine((v) => !sameAiModel(v.primary, v.fallback), { message: "The fallback must be a different model.", path: ["fallback"] });
export type UpdateAiFeatureRequest = z.infer<typeof updateAiFeatureRequestSchema>;

export const testAiModelRequestSchema = aiModelRefSchema;
export type TestAiModelRequest = z.infer<typeof testAiModelRequestSchema>;

export type TestAiModelResponse = {
  ok: boolean;
  latencyMs: number;
  /** The provider's HTTP status when it refused; null for a network error or success. */
  status: number | null;
  message: string;
};
