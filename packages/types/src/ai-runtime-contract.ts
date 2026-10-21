import { z } from "zod";

// Internal contract v1.0 between the NestJS API and the Python `ai-runtime`
// (docs/ai/architecture/PHASE1_SPEC.md §3). This file is the source of truth:
// scripts/ai/export-contract.mjs writes it to services/ai-runtime/contract/v1/
// as JSON Schema, and CI fails when the committed copy drifts.
//
// Export rules: no .default(), .transform(), .refine(), .preprocess() or
// z.custom() (JSON Schema can't carry them), and ASCII regex classes only —
// `\w` means different things in JavaScript and Python `re`.

export const AI_CONTRACT_VERSION = "1.0";
export const AI_CONTRACT_MAJOR = 1;

/** Same rule as the API logger's REQUEST_ID_PATTERN. */
export const aiRequestId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

export const aiDataClass = z.enum([
  "PUBLIC",
  "INTERNAL",
  "PSEUDONYMOUS_STUDENT",
  "PERSONAL_STUDENT",
  "SENSITIVE_MINOR_COMMS"
]);

export const aiTaskId = z.enum(["diagnostic.echo.v1"]);

export const aiServiceScope = z.enum(["runtime:info", "runtime:diagnostic.echo"]);

// The full list is reserved in v1.0 so later phases add no enum value; P1
// emits only the codes in PHASE1_SPEC.md §5.2.
export const aiErrorCode = z.enum([
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "POLICY_DENIED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA",
  "OUTPUT_SCHEMA_VIOLATION",
  "BUSY",
  "PROVIDER_QUOTA_EXHAUSTED",
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
  "CANCELLED",
  "INTERNAL"
]);

// Requests are strict: an extra field (say `permissions`) is a 400, so no
// request body can grant the runtime anything.
export const diagnosticEchoRequest = z.strictObject({
  dataClass: z.literal("PUBLIC"),
  input: z.strictObject({ text: z.string().min(1).max(200) }),
  route: z.literal("mock:echo"),
  task: z.literal("diagnostic.echo.v1")
});

// Responses are read non-strictly, so a minor version may add optional fields.
export const diagnosticEchoResponse = z.object({
  contractVersion: z.literal(AI_CONTRACT_VERSION),
  latencyMs: z.number().int().min(0),
  model: z.literal("echo"),
  modelRevision: z.null(),
  output: z.object({ echo: z.string(), length: z.number().int().min(0) }),
  provider: z.literal("mock")
});

export const aiErrorEnvelope = z.object({
  error: z.object({
    code: aiErrorCode,
    /** Never echoes the request input. */
    message: z.string().max(500),
    retryAfterMs: z.number().int().min(0).optional(),
    retryable: z.boolean()
  })
});

export const aiRuntimeInfo = z.object({
  contractVersions: z.array(z.string()).min(1),
  providers: z.array(z.literal("mock")),
  service: z.literal("ai-runtime"),
  tasks: z.array(aiTaskId),
  version: z.string()
});

export const aiRuntimeReadiness = z.object({
  providers: z.record(z.string(), z.enum(["ready", "unavailable"])),
  status: z.enum(["ready", "not_ready"])
});

// Presence rules the schema can't express (task/dataClass only on the echo
// scope, bh whenever a body is sent, exp - iat <= 60) are the verifier's job.
export const aiServiceTokenClaims = z.strictObject({
  aud: z.literal("ai-runtime"),
  /** base64url (unpadded) SHA-256 of the exact request-body bytes. */
  bh: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  dataClass: aiDataClass.optional(),
  exp: z.number().int().min(0),
  iat: z.number().int().min(0),
  iss: z.literal("nexa-api"),
  jti: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  rid: aiRequestId,
  scope: aiServiceScope,
  task: aiTaskId.optional(),
  ver: z.literal(AI_CONTRACT_MAJOR)
});

/** Every schema exported to JSON Schema, with the side that sends it. */
export const AI_CONTRACT_SCHEMAS = {
  aiErrorEnvelope: { sentBy: "runtime", schema: aiErrorEnvelope },
  aiRuntimeInfo: { sentBy: "runtime", schema: aiRuntimeInfo },
  aiRuntimeReadiness: { sentBy: "runtime", schema: aiRuntimeReadiness },
  aiServiceTokenClaims: { sentBy: "api", schema: aiServiceTokenClaims },
  diagnosticEchoRequest: { sentBy: "api", schema: diagnosticEchoRequest },
  diagnosticEchoResponse: { sentBy: "runtime", schema: diagnosticEchoResponse }
} as const;

export type AiDataClass = z.infer<typeof aiDataClass>;
export type AiErrorCode = z.infer<typeof aiErrorCode>;
export type AiErrorEnvelope = z.infer<typeof aiErrorEnvelope>;
export type AiRuntimeInfo = z.infer<typeof aiRuntimeInfo>;
export type AiRuntimeReadiness = z.infer<typeof aiRuntimeReadiness>;
export type AiServiceScope = z.infer<typeof aiServiceScope>;
export type AiServiceTokenClaims = z.infer<typeof aiServiceTokenClaims>;
export type AiTaskId = z.infer<typeof aiTaskId>;
export type DiagnosticEchoRequest = z.infer<typeof diagnosticEchoRequest>;
export type DiagnosticEchoResponse = z.infer<typeof diagnosticEchoResponse>;
