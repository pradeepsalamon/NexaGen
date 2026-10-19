import type { LoggerService } from "@nestjs/common";
import type { AiDataClass, AiErrorCode, AiTaskId } from "@nexa-chess/types";

export type AiCallOutcome =
  | "ok"
  | "busy"
  | "invalid_response"
  | "rejected"
  | "timeout"
  | "unavailable";

/**
 * One line per runtime call. Metadata only: never the input or output text,
 * the token, the secret, headers or the URL. Keep it that way — every field is
 * typed so a free-form string can't slip in.
 */
export interface AiCallLogLine {
  dataClass?: AiDataClass;
  errorCode?: AiErrorCode;
  /** Runtime HTTP status, when one arrived. */
  httpStatus?: number;
  latencyMs: number;
  model?: string;
  outcome: AiCallOutcome;
  path: "/readyz" | "/v1/info" | "/v1/diagnostic/echo";
  provider?: string;
  rid: string;
  task?: AiTaskId;
}

export function logAiCall(logger: Pick<LoggerService, "log" | "warn">, line: AiCallLogLine) {
  const entry = { event: "ai.runtime.call", ...line };
  if (line.outcome === "ok") logger.log(entry);
  else logger.warn(entry);
}
