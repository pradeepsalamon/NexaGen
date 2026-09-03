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
  STOCKFISH_POOL_SIZE: z.coerce.number().int().positive().default(4),
  STOCKFISH_MOVETIME: z.coerce.number().int().positive().default(800),
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  RECORDING_STORAGE_DIR: z.string().default("/recordings"),
  RECORDING_STORAGE_LIMIT_GB: z.coerce.number().positive().default(130),
  RECORDING_MIN_RETENTION_DAYS: z.coerce.number().nonnegative().default(14),
  // Where LiveKit egress writes a class recording. "local" (the default) writes
  // to RECORDING_STORAGE_DIR, which is what the quota, retention prune, storage
  // analytics and the signed stream endpoint all read. "oci" makes egress
  // upload straight to the OCI bucket instead and requires the OCI_* vars.
  RECORDING_STORAGE_TARGET: z.enum(["local", "oci"]).default("local"),
  ANALYTICS_STORAGE_WARN_PERCENT: z.coerce.number().min(1).max(100).default(70),
  ANALYTICS_STORAGE_CRITICAL_PERCENT: z.coerce
    .number()
    .min(1)
    .max(100)
    .default(85),
  ANALYTICS_LOW_ATTENDANCE_PERCENT: z.coerce.number().min(1).max(100).default(75),
  ANALYTICS_INACTIVE_DAYS: z.coerce.number().int().positive().default(30),
  ANALYTICS_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300)
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

export function getCookieDomain(
  env: Pick<ApiEnv, "CORS_ORIGIN" | "FRONTEND_URL"> & { COOKIE_DOMAIN?: string }
): string | undefined {
  if (env.COOKIE_DOMAIN) {
    return env.COOKIE_DOMAIN;
  }
  try {
    const frontendUrl = getFrontendUrl(env);
    const hostname = new URL(frontendUrl).hostname;
    if (hostname === "localhost" || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return undefined;
    }
    return `.${registrableDomain(hostname)}`;
  } catch {
    return undefined;
  }
}

// Second-level labels that sit under a country-code TLD (e.g. "co" in
// "example.co.uk"), where the registrable domain is the last THREE labels.
const SECOND_LEVEL_TLDS = new Set([
  "co",
  "com",
  "net",
  "org",
  "gov",
  "edu",
  "ac",
  "or",
  "ne",
  "go",
]);

function registrableDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const isCcSecondLevel =
    parts[parts.length - 1].length === 2 &&
    SECOND_LEVEL_TLDS.has(parts[parts.length - 2]);
  return parts.slice(isCcSecondLevel ? -3 : -2).join(".");
}
