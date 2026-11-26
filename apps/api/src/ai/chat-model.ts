import { Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type { AiProviderId, ClassRecapProvider, RecapPrompt } from "@nexa-chess/types";

// ──────────────────────────────────────────────────────────────
// A language model behind an OpenAI-compatible chat API
// (`POST <url>/chat/completions`). Two places it can run:
//
//  - LOCAL: a model server on our own machine (Ollama from compose.ai.yml,
//    on the AI network with no internet access). No key; nothing leaves.
//  - OUTSIDE: a provider the platform operators connected in the console
//    (docs/AI_PROVIDERS.md); `AiProvidersService` builds these configs.
//
// A feature gets a route: its main model, then its fallback. Only
// pseudonymised text is ever sent (students are S1, S2…). Only status codes
// are logged, never a prompt or an answer.
// ──────────────────────────────────────────────────────────────

export type ChatModelConfig = {
  provider: ClassRecapProvider;
  /** The outside provider; null for our own server. */
  providerId: AiProviderId | null;
  url: string;
  apiKey: string | null;
  model: string;
  /** Shown to admins and reviewers. */
  name: string;
  timeoutMs: number;
};

export function localModelConfigFromEnv(env: ReturnType<typeof getApiEnv> = getApiEnv()): ChatModelConfig | null {
  const url = env.AI_LOCAL_MODEL_URL?.trim();
  const model = env.AI_LOCAL_MODEL.trim();
  if (!url || !model) return null;
  return {
    apiKey: null,
    model,
    name: "Our server",
    provider: "LOCAL",
    providerId: null,
    timeoutMs: env.AI_CLASS_RECAP_CALL_TIMEOUT_MS,
    url: url.replace(/\/+$/, "")
  };
}

/**
 * Extra answer room for an outside model. Many outside models "think" before
 * answering and that thinking counts against `max_tokens`, so a feature's own
 * limit alone leaves them with no text (docs/ai/PROVIDER_EVAL.md §7.1). Our
 * own model doesn't think, and its limit stays tight so a runaway answer
 * can't hold the CPU.
 */
export const OUTSIDE_THINKING_TOKENS = 4000;

export type ChatRequest = {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  /** Ask for a JSON object (`response_format`). */
  json: boolean;
};

export type ChatAnswer = { text: string; servedBy: ChatModelConfig };

export class ChatModelError extends Error {
  constructor(
    message: string,
    /** The provider's HTTP status; null for a network error, a timeout or an empty answer. */
    readonly status: number | null
  ) {
    super(message);
  }
}

const logger = new Logger("ChatModel");

/** Groq refuses an answer its JSON mode couldn't validate (docs/ai/PROVIDER_EVAL.md §7.3). */
function isJsonModeRefusal(status: number, body: string): boolean {
  return status === 400 && body.includes("json_validate_failed");
}

/**
 * One model, one answer. A JSON-mode refusal is retried once without JSON
 * mode (callers parse with `parseModelJson`, which finds the object anyway).
 * Nothing else is retried here: an overloaded or out-of-quota provider is
 * the route's fallback's job, and retrying would spend more of its daily
 * requests (Gemini counts overload answers, §7.4).
 */
export async function callChatModel(config: ChatModelConfig, request: ChatRequest, signal: AbortSignal): Promise<string> {
  const send = async (json: boolean): Promise<string> => {
    const response = await fetch(`${config.url}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: config.provider === "OUTSIDE" ? request.maxTokens + OUTSIDE_THINKING_TOKENS : request.maxTokens,
        messages: [
          { content: request.system, role: "system" },
          { content: request.user, role: "user" }
        ],
        model: config.model,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        // Only our own server gets a seed: some outside APIs (Gemini's
        // OpenAI-compatible one) refuse a request that carries it.
        ...(config.provider === "LOCAL" ? { seed: 7 } : {}),
        temperature: request.temperature
      }),
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        "Content-Type": "application/json"
      },
      method: "POST",
      signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)])
    });
    if (!response.ok) {
      // The body may echo the request: it is only matched, never logged.
      const body = await response.text().catch(() => "");
      if (json && isJsonModeRefusal(response.status, body)) return send(false);
      logger.warn(`${config.providerId ?? config.provider} model answered ${response.status}`);
      throw new ChatModelError(`The model answered ${response.status}.`, response.status);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new ChatModelError("The model returned no text.", null);
    return text;
  };
  try {
    return await send(request.json);
  } catch (error) {
    if (error instanceof ChatModelError) throw error;
    if (signal.aborted) throw error;
    throw new ChatModelError(`The model couldn't be reached (${(error as Error).name}).`, null);
  }
}

/**
 * The route's main model, then its fallback when the main one fails for any
 * reason (quota, overload, a revoked key, a timeout). Stops at once when the
 * caller's signal is aborted. Throws the last model's error.
 */
export async function completeOnRoute(route: readonly ChatModelConfig[], request: ChatRequest, signal: AbortSignal): Promise<ChatAnswer> {
  if (route.length === 0) throw new ChatModelError("No model is connected.", null);
  let lastError: unknown = null;
  for (const config of route) {
    try {
      return { servedBy: config, text: await callChatModel(config, request, signal) };
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** The outside providers a route may send to, main first, no repeats. */
export function routeProviderIds(route: readonly ChatModelConfig[]): AiProviderId[] {
  return [...new Set(route.map((c) => c.providerId).filter((id): id is AiProviderId => !!id))];
}

// ── Class recaps ────────────────────────────────────────────

export interface RecapModels {
  readonly local: ChatModelConfig | null;
  /** The outside models mapped to class recaps, main first; empty when none is connected. */
  outsideRoute(): ChatModelConfig[];
  /** The model's text answer to one prompt, and which model wrote it. Throws on any failure. */
  complete(
    route: readonly ChatModelConfig[],
    prompt: RecapPrompt,
    options: { maxTokens: number; signal: AbortSignal }
  ): Promise<ChatAnswer>;
}

export const RECAP_MODELS = Symbol("RECAP_MODELS");

export class OpenAiCompatibleRecapModels implements RecapModels {
  constructor(
    readonly local: ChatModelConfig | null,
    private readonly outside: () => ChatModelConfig[]
  ) {}

  outsideRoute(): ChatModelConfig[] {
    return this.outside();
  }

  complete(route: readonly ChatModelConfig[], prompt: RecapPrompt, options: { maxTokens: number; signal: AbortSignal }) {
    return completeOnRoute(
      route,
      { json: true, maxTokens: options.maxTokens, system: prompt.system, temperature: 0, user: prompt.user },
      options.signal
    );
  }
}
