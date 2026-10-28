import type { AssistantToolKind, AssistantToolResult, AssistantToolRole } from "@nexa-chess/types";
import type { ZodType } from "zod";

/**
 * One assistant tool (AI_FOUNDATION.md §6). `run` calls an existing service
 * method with the caller's access token, exactly as a controller does, so the
 * service's own authentication and visibility rules decide what comes back.
 * There is no tool-specific permission code beyond the `roles` pre-check.
 */
export type AssistantTool<A = unknown> = {
  name: string;
  description: string;
  kind: AssistantToolKind;
  roles: readonly AssistantToolRole[];
  args: ZodType<A>;
  run: (accessToken: string | undefined, args: A) => Promise<AssistantToolResult>;
};

/** A module that contributes tools to the registry. */
export interface AssistantToolSource {
  assistantTools(): AssistantTool[];
}

/** Retrieved text goes back to a model as data; cap what one call can return. */
export const ASSISTANT_TOOL_TEXT_LIMIT = 8000;
