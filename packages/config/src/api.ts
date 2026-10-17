import { z } from "zod";

const durationSchema = z
  .string()
  .regex(/^\d+(ms|s|m|h|d)$/, "Expected a duration like 500ms, 15m, or 7d.");

const optionalUrlSchema = z
  .string()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

const MIN_JWT_SECRET_LENGTH = 32;

const apiEnvSchema = z.object({
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  FRONTEND_URL: optionalUrlSchema,
  JWT_ACCESS_SECRET: z.string().default("change-this-access-token-secret"),
  JWT_ACCESS_TTL: durationSchema.default("15m"),
  JWT_REFRESH_SECRET: z.string().default("change-this-refresh-token-secret"),
  JWT_REFRESH_SHORT_TTL: durationSchema.default("1d"),
  JWT_REFRESH_TTL: durationSchema.default("7d"),
  LOGIN_RESPONSE_DELAY: durationSchema.default("500ms"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  // Encrypts TOTP secrets at rest. Unset = two-factor sign-in is unavailable.
  MFA_ENCRYPTION_KEY: z
    .string()
    .min(32, "MFA_ENCRYPTION_KEY must be at least 32 characters.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // Roles that must sign in with two-factor (comma-separated; empty = none).
  MFA_REQUIRED_ROLES: z.string().default("SUPER_ADMIN,ADMIN"),
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
  // Comma-separated staff emails notified when the academy marketing page
  // ("book a demo") creates a new Lead. Unset ⇒ notification is skipped, same
  // as any other MailService send with no SMTP configured.
  ADMIN_EMAILS: z.string().optional(),
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  STOCKFISH_PATH: z.string().optional(),
  STOCKFISH_POOL_SIZE: z.coerce.number().int().positive().default(4),
  STOCKFISH_MIN_ENGINES: z.coerce.number().int().nonnegative().default(1),
  STOCKFISH_MOVETIME: z.coerce.number().int().positive().default(800),
  STOCKFISH_MOVE_MOVETIME: z.coerce.number().int().positive().default(1000),
  // Engine moves stop early once this depth completes (0 = always use the full time).
  STOCKFISH_MOVE_MAX_DEPTH: z.coerce.number().int().nonnegative().default(22),
  STOCKFISH_HASH_MB: z.coerce.number().int().positive().default(64),
  STOCKFISH_MAX_DEPTH: z.coerce.number().int().nonnegative().default(20),
  STOCKFISH_IDLE_TIMEOUT_S: z.coerce.number().int().nonnegative().default(60),
  COOKIE_DOMAIN: z.string().optional(),
  // Web and API are same-site subdomains, so Lax is enough and blocks cross-site form posts.
  // "none" only for a deployment where the API sits on a different registrable domain.
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  RECORDING_STORAGE_DIR: z.string().default("/recordings"),
  RECORDING_STORAGE_LIMIT_GB: z.coerce.number().positive().default(130),
  RECORDING_MIN_RETENTION_DAYS: z.coerce.number().nonnegative().default(14),
  // Auto-end a live class once the coach has been out of the room this long (0 = off).
  LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(10),
  // Auto-end a live class this long past its scheduled end even with the coach present (0 = off).
  LIVE_CLASS_MAX_OVERRUN_MINUTES: z.coerce.number().int().nonnegative().default(60),
  // Where LiveKit egress writes a class recording. "local" (the default) writes
  // to RECORDING_STORAGE_DIR, which is what the quota, retention prune, storage
  // analytics and the signed stream endpoint all read. "oci" makes egress
  // upload straight to the OCI bucket instead and requires the OCI_* vars.
  RECORDING_STORAGE_TARGET: z.enum(["local", "oci"]).default("local"),
  // Base URL of the egress recording template, as reachable *from the egress
  // container* — the compose service name on the internal network, not the
  // public site. Unset falls back to LiveKit's built-in grid, which records
  // participant video only and no chessboard.
  RECORDING_TEMPLATE_BASE_URL: z.string().url().optional(),
  ANALYTICS_STORAGE_WARN_PERCENT: z.coerce.number().min(1).max(100).default(70),
  ANALYTICS_STORAGE_CRITICAL_PERCENT: z.coerce
    .number()
    .min(1)
    .max(100)
    .default(85),
  ANALYTICS_LOW_ATTENDANCE_PERCENT: z.coerce.number().min(1).max(100).default(75),
  ANALYTICS_INACTIVE_DAYS: z.coerce.number().int().positive().default(30),
  ANALYTICS_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(300),
  // BullMQ. Unset disables every queue: producers run their job inline and no
  // worker starts, so `npm run dev:api` needs no Redis. Compose always sets it.
  REDIS_URL: optionalUrlSchema,
  // Error reporting. Unset SENTRY_DSN sends nothing. Read directly by
  // src/instrument.ts (it runs before this schema is parsed); listed here so
  // the variable is documented and validated with the rest.
  SENTRY_DSN: optionalUrlSchema,
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  // Namespaces every BullMQ key, so a shared Redis (LiveKit and egress already
  // use this one) can never collide with a queue.
  QUEUE_PREFIX: z.string().default("nexa"),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // WhatsApp Cloud API (Meta Graph API). Unset ACCESS_TOKEN/PHONE_NUMBER_ID
  // leaves WhatsAppService unconfigured — callers degrade, nothing breaks.
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  WHATSAPP_API_VERSION: z.string().default("v21.0"),
  // Digits only, no "+". Used to expand a national number (e.g. "09876543210").
  WHATSAPP_DEFAULT_COUNTRY_CODE: z
    .string()
    .regex(/^\d{1,4}$/, "Expected a country calling code like 91.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  WHATSAPP_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // ── Payments ──
  // Every gateway is optional and independently configurable. A gateway with
  // missing credentials reports itself unconfigured, the router skips it, and
  // the checkout screen simply never offers the methods only it could serve.
  // With none configured the payments module still boots — the catalogue and
  // history read fine, a checkout attempt is a clean 503.
  PAYMENTS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Sandbox keys behave identically; this only selects provider hostnames. */
  PAYMENTS_MODE: z.enum(["sandbox", "production"]).default("sandbox"),
  PAYMENTS_DEFAULT_CURRENCY: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .default("INR")
    .transform((value) => value.toUpperCase()),
  /** An unpaid order stops accepting payments after this long. */
  PAYMENTS_ORDER_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  /** Per-provider HTTP timeout. A slow gateway must not hold a request open. */
  PAYMENTS_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  /** Rolling window the provider-health numbers are computed over. */
  PAYMENTS_HEALTH_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  /** Below this success rate (with enough samples) a provider drops out. */
  PAYMENTS_HEALTH_MIN_SUCCESS_RATE: z.coerce.number().min(0).max(100).default(40),
  PAYMENTS_HEALTH_MIN_SAMPLES: z.coerce.number().int().positive().default(10),
  /** Invoice number prefix: NEXA/2026/000123. */
  PAYMENTS_INVOICE_PREFIX: z.string().default("NEXA"),
  /** Printed on invoices. Nothing is fabricated when these are unset. */
  PAYMENTS_SELLER_NAME: z.string().optional(),
  PAYMENTS_SELLER_ADDRESS: z.string().optional(),
  PAYMENTS_SELLER_TAX_ID: z.string().optional(),
  PAYMENTS_TAX_LABEL: z.string().default("GST"),

  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  CASHFREE_APP_ID: z.string().optional(),
  CASHFREE_SECRET_KEY: z.string().optional(),
  CASHFREE_WEBHOOK_SECRET: z.string().optional(),
  CASHFREE_API_VERSION: z.string().default("2023-08-01"),

  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_API_VERSION: z.string().default("2024-06-20")
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;
  // A default, empty or short signing secret lets anyone mint access tokens.
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"] as const) {
    const value = env[key];
    if (value.length < MIN_JWT_SECRET_LENGTH || value.startsWith("change-this")) {
      ctx.addIssue({
        code: "custom",
        message: `${key} must be a random value of at least ${MIN_JWT_SECRET_LENGTH} characters in production.`,
        path: [key]
      });
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: "custom",
      message: "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.",
      path: ["JWT_REFRESH_SECRET"]
    });
  }
  // Without the key, required two-factor would silently switch off.
  const mfaRequired = env.MFA_REQUIRED_ROLES.split(",").some((role) => role.trim());
  if (mfaRequired && !env.MFA_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: "custom",
      message:
        "MFA_ENCRYPTION_KEY is required in production while MFA_REQUIRED_ROLES is set (set MFA_REQUIRED_ROLES= to opt out).",
      path: ["MFA_ENCRYPTION_KEY"]
    });
  }
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

export function getAdminNotificationEmails(env: Pick<ApiEnv, "ADMIN_EMAILS">) {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
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

export function getCookieBaseOptions(
  env: Pick<ApiEnv, "CORS_ORIGIN" | "FRONTEND_URL" | "COOKIE_SAME_SITE"> & {
    COOKIE_DOMAIN?: string;
  }
): { domain?: string; sameSite: "lax" | "strict" | "none"; secure: boolean } {
  const secure = getFrontendUrl(env).startsWith("https://");
  // Browsers drop SameSite=None cookies that are not Secure.
  const sameSite = env.COOKIE_SAME_SITE === "none" && !secure ? "lax" : env.COOKIE_SAME_SITE;
  const domain = getCookieDomain(env);
  return { sameSite, secure, ...(domain ? { domain } : {}) };
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
