import { Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type { ClassRecapProvider, RecapPrompt } from "@nexa-chess/types";
import { outsideAiConfigFromEnv } from "./outside/outside-ai";

// ──────────────────────────────────────────────────────────────
// A language model behind an OpenAI-compatible chat API
// (`POST <url>/chat/completions`), used by the class recaps
// (docs/CLASS_RECAPS.md). Two places it can run:
//
//  - LOCAL: a model server on our own machine (Ollama from compose.ai.yml,
//    on the AI network with no internet access). No key; nothing leaves.
//  - OUTSIDE: the outside AI the academy can choose instead (the same
//    provider the AI play review uses, `AI_REVIEW_PROVIDER_*`).
//
// Only pseudonymised text is ever sent (students are S1, S2…). Only status
// codes are logged, never a prompt or an answer.
// ──────────────────────────────────────────────────────────────

export type ChatModelConfig = {
  provider: ClassRecapProvider;
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
    timeoutMs: env.AI_CLASS_RECAP_CALL_TIMEOUT_MS,
    url: url.replace(/\/+$/, "")
  };
}

export function outsideRecapModelConfigFromEnv(env: ReturnType<typeof getApiEnv> = getApiEnv()): ChatModelConfig | null {
  const outside = outsideAiConfigFromEnv(env);
  if (!outside) return null;
  return {
    apiKey: outside.apiKey,
    model: outside.model,
    name: outside.name,
    provider: "OUTSIDE",
    timeoutMs: env.AI_CLASS_RECAP_CALL_TIMEOUT_MS,
    url: outside.url
  };
}

export interface RecapModels {
  readonly local: ChatModelConfig | null;
  readonly outside: ChatModelConfig | null;
  /** The model's text answer to one prompt. Throws on any failure. */
  complete(config: ChatModelConfig, prompt: RecapPrompt, options: { maxTokens: number; signal: AbortSignal }): Promise<string>;
}

export const RECAP_MODELS = Symbol("RECAP_MODELS");

/**
 * Extra answer room for an outside model. Many outside models "think" before
 * answering and that thinking counts against `max_tokens`, so the recap's own
 * limit alone leaves them with no text. Our own model doesn't think, and its
 * limit stays tight so a runaway answer can't hold the CPU.
 */
export const OUTSIDE_THINKING_TOKENS = 4000;

export class OpenAiCompatibleRecapModels implements RecapModels {
  private readonly logger = new Logger(OpenAiCompatibleRecapModels.name);

  constructor(
    readonly local: ChatModelConfig | null,
    readonly outside: ChatModelConfig | null
  ) {}

  async complete(
    config: ChatModelConfig,
    prompt: RecapPrompt,
    options: { maxTokens: number; signal: AbortSignal }
  ): Promise<string> {
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(config.timeoutMs)]);
    const response = await fetch(`${config.url}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: config.provider === "OUTSIDE" ? options.maxTokens + OUTSIDE_THINKING_TOKENS : options.maxTokens,
        messages: [
          { content: prompt.system, role: "system" },
          { content: prompt.user, role: "user" }
        ],
        model: config.model,
        response_format: { type: "json_object" },
        // Only our own server gets a seed: some outside APIs (Gemini's
        // OpenAI-compatible one) refuse a request that carries it.
        ...(config.provider === "LOCAL" ? { seed: 7 } : {}),
        temperature: 0
      }),
      headers: {
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        "Content-Type": "application/json"
      },
      method: "POST",
      signal
    });
    if (!response.ok) {
      // The body may echo the request; only the status is logged.
      this.logger.warn(`${config.provider} model answered ${response.status}`);
      throw new Error(`The model answered ${response.status}.`);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) throw new Error("The model returned no text.");
    return text;
  }
}
