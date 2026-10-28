import { z } from "zod";
import { KNOWLEDGE_QUERY_MAX } from "./knowledge";

// Assistant tools (AI_FOUNDATION.md §6). A tool is a typed, role-limited call
// into an existing service, run in NestJS with the caller's own access token,
// so every authorization and visibility rule applies unchanged. The model
// plane never executes a tool. v1 has READ tools only.

export const ASSISTANT_TOOL_KINDS = ["READ", "DRAFT", "ACTION"] as const;
export type AssistantToolKind = (typeof ASSISTANT_TOOL_KINDS)[number];

export type AssistantToolRole = "SUPER_ADMIN" | "ADMIN" | "COACH" | "STUDENT";

export const knowledgeSearchToolArgsSchema = z.strictObject({
  query: z.string().trim().min(1).max(KNOWLEDGE_QUERY_MAX),
  /** The page the user is on, e.g. "/student/assignments". */
  route: z.string().regex(/^\/[A-Za-z0-9\-/_]*$/).max(200).optional(),
});
export type KnowledgeSearchToolArgs = z.infer<typeof knowledgeSearchToolArgsSchema>;

export const knowledgeGetArticleToolArgsSchema = z.strictObject({
  slug: z.string().trim().min(1).max(100),
});
export type KnowledgeGetArticleToolArgs = z.infer<typeof knowledgeGetArticleToolArgsSchema>;

/** What a tool returns to the model: data only, never instructions. */
export type AssistantToolResult =
  | { ok: true; data: unknown; citations?: { slug: string; title: string; versionNumber?: number }[] }
  | { ok: false; error: string };

export type AssistantToolDescriptor = {
  name: string;
  description: string;
  kind: AssistantToolKind;
  roles: AssistantToolRole[];
  /** JSON Schema of the arguments, as sent to a model. */
  parameters: Record<string, unknown>;
};

export type AssistantToolListResponse = { tools: AssistantToolDescriptor[] };

export const runAssistantToolSchema = z.strictObject({
  args: z.record(z.string(), z.unknown()).default({}),
  name: z.string().min(1).max(80),
});
export type RunAssistantToolRequest = z.input<typeof runAssistantToolSchema>;

export type RunAssistantToolResponse = {
  name: string;
  latencyMs: number;
  result: AssistantToolResult;
};
