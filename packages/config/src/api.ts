import { z } from "zod";

const durationSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, "Expected a duration like 500ms, 15m, or 7d.");

const optionalUrlSchema = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

const apiEnvSchema = z.object({
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  FRONTEND_URL: optionalUrlSchema,
  JWT_ACCESS_SECRET: z.string().default("change-this-access-token-secret"),
  JWT_ACCESS_TTL: durationSchema.default("15m"),
  JWT_REFRESH_SECRET: z.string().default("change-this-refresh-token-secret"),
  JWT_REFRESH_SHORT_TTL: durationSchema.default("1d"),
  JWT_REFRESH_TTL: durationSchema.default("7d"),
  LOGIN_RESPONSE_DELAY: durationSchema.default("500ms"),
  NODE_ENV: z.string().default("development"),
  PASSWORD_RESET_RESPONSE_DELAY: durationSchema.default("5s"),
  PORT: z.coerce.number().int().positive().default(3001),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  STOCKFISH_PATH: z.string().optional(),
  STOCKFISH_POOL_SIZE: z.coerce.number().int().positive().default(4)
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;

let cachedApiEnv: ApiEnv | undefined;

export function getApiEnv(source: NodeJS.ProcessEnv = process.env) {
  cachedApiEnv ??= apiEnvSchema.parse(source);
  return cachedApiEnv;
}

export function getCorsOrigins(env: Pick<ApiEnv, "CORS_ORIGIN">) {
  return env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getFrontendUrl(
  env: Pick<ApiEnv, "CORS_ORIGIN" | "FRONTEND_URL">
) {
  return env.FRONTEND_URL ?? getCorsOrigins(env)[0] ?? "http://localhost:3000";
}
