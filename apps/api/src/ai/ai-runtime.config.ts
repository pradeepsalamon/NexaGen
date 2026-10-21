import type { ApiEnv } from "@nexa-chess/config/api";

export const AI_RUNTIME_CONFIG = Symbol("AI_RUNTIME_CONFIG");

export interface AiRuntimeConfig {
  enabled: boolean;
  /** Undefined only while AI is disabled; config parsing refuses that when enabled. */
  secret: string | undefined;
  timeoutMs: number;
  /** Origin only, e.g. http://ai-runtime:8000 (validated in packages/config). */
  url: string;
}

export function aiRuntimeConfigFromEnv(
  env: Pick<ApiEnv, "AI_ENABLED" | "AI_RUNTIME_SHARED_SECRET" | "AI_RUNTIME_TIMEOUT_MS" | "AI_RUNTIME_URL">
): AiRuntimeConfig {
  return {
    enabled: env.AI_ENABLED,
    secret: env.AI_RUNTIME_SHARED_SECRET,
    timeoutMs: env.AI_RUNTIME_TIMEOUT_MS,
    url: new URL(env.AI_RUNTIME_URL).origin
  };
}
