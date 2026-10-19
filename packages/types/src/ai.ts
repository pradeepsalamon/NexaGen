import { z } from "zod";
import type { AiDataClass, AiServiceScope, AiTaskId } from "./ai-runtime-contract";

// The AI task table. Every model invocation is one of these tasks, and each
// task declares the single data class it handles (DECISIONS.md ADR-003).
// The runtime reads the generated copy (contract/v1/task-policy.json) and
// refuses any task / data class / route triple not listed here.

export interface AiTaskDefinition {
  dataClasses: readonly AiDataClass[];
  routes: readonly string[];
  scope: AiServiceScope;
  task: AiTaskId;
}

export const AI_TASKS: Record<AiTaskId, AiTaskDefinition> = {
  "diagnostic.echo.v1": {
    dataClasses: ["PUBLIC"],
    routes: ["mock:echo"],
    scope: "runtime:diagnostic.echo",
    task: "diagnostic.echo.v1"
  }
};

export const AI_TASK_IDS = Object.keys(AI_TASKS) as AiTaskId[];

// ── Admin routes (/admin/ai/*, SUPER_ADMIN) ──

export const adminAiEchoRequestSchema = z.strictObject({
  text: z.string().min(1).max(200)
});

export type AdminAiEchoRequest = z.infer<typeof adminAiEchoRequestSchema>;

export interface AdminAiEchoResponse {
  echo: string;
  latencyMs: number;
  length: number;
  model: "echo";
  provider: "mock";
  rid: string;
}

export interface AdminAiRuntimeStatus {
  contractVersions: string[];
  providers: string[];
  reachable: boolean;
  ready: boolean;
}

export interface AdminAiStatusResponse {
  contractVersion: string;
  enabled: boolean;
  /** Present only when AI is enabled; the runtime isn't contacted otherwise. */
  runtime?: AdminAiRuntimeStatus;
  tasks: AiTaskId[];
}
