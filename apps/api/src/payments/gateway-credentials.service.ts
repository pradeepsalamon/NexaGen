import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { getApiEnv, type ApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID, type TenantGatewayProvider } from "@nexa-chess/types";
import { randomBytes } from "node:crypto";
import { decryptSecret, deriveMfaKey, encryptSecret } from "../auth/mfa/mfa-crypto";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform, currentTenantId } from "../tenancy/tenant-context";

type GatewaySecrets = { keySecret: string; webhookSecret: string | null };
type StoredGateway = GatewaySecrets & { publicKey: string };

/** The env keys a gateway adapter reads; an academy's own keys replace exactly these. */
type GatewayEnvKeys = Pick<
  ApiEnv,
  | "CASHFREE_APP_ID"
  | "CASHFREE_SECRET_KEY"
  | "CASHFREE_WEBHOOK_SECRET"
  | "RAZORPAY_KEY_ID"
  | "RAZORPAY_KEY_SECRET"
  | "RAZORPAY_WEBHOOK_SECRET"
  | "STRIPE_PUBLISHABLE_KEY"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
>;

/**
 * Each academy's own gateway account for student payments
 * (docs/SAAS_MULTI_TENANCY.md §G "Two money flows" 2; Phase 6).
 *
 * Nexa's academy keeps the server's env keys, unchanged. Every other academy
 * uses only the keys its super admin connected, or no gateway at all — never
 * Nexa's, so a student payment can only land in its own academy's account.
 *
 * Adapters stay as they were: they read `this.env`, and `envFor` hands them
 * the server env with the gateway keys swapped for the current academy's
 * (from the request's or the job's TenantContext). Secrets are stored
 * AES-256-GCM encrypted and kept decrypted in memory, because the adapters'
 * `isConfigured()` is synchronous.
 */
@Injectable()
export class GatewayCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(GatewayCredentialsService.name);
  private readonly env = getApiEnv();
  private readonly key = (() => {
    const secret = this.env.CREDENTIALS_ENCRYPTION_KEY ?? this.env.MFA_ENCRYPTION_KEY;
    return secret ? deriveMfaKey(`payments:${secret}`) : null;
  })();
  private readonly byTenant = new Map<string, Partial<Record<TenantGatewayProvider, StoredGateway>>>();
  private readonly envCache = new Map<string, ApiEnv>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const rows = await asPlatform("payments:credentials-load", () =>
        this.prisma.tenantPaymentCredential.findMany({ where: { enabled: true } })
      );
      for (const row of rows) this.remember(row);
    } catch (error) {
      // A missing table (migration not yet applied) must not stop the API.
      this.logger.warn(`Gateway credentials not loaded: ${(error as Error).message}`);
    }
  }

  canStore(): boolean {
    return this.key !== null;
  }

  encrypt(secrets: GatewaySecrets): string {
    if (!this.key) throw new Error("CREDENTIALS_ENCRYPTION_KEY / MFA_ENCRYPTION_KEY is not set.");
    return encryptSecret(JSON.stringify(secrets), this.key);
  }

  decrypt(encrypted: string): GatewaySecrets | null {
    if (!this.key) return null;
    try {
      const parsed = JSON.parse(decryptSecret(encrypted, this.key)) as Partial<GatewaySecrets>;
      return typeof parsed.keySecret === "string"
        ? { keySecret: parsed.keySecret, webhookSecret: typeof parsed.webhookSecret === "string" ? parsed.webhookSecret : null }
        : null;
    } catch {
      return null;
    }
  }

  /** A fresh unguessable webhook path segment. */
  newWebhookKey(): string {
    return randomBytes(18).toString("base64url");
  }

  /**
   * The env an adapter should read right now. Nexa (or no academy known):
   * the server env as is. Another academy: the server env with every
   * gateway key replaced by that academy's own, or blanked when it has none.
   */
  envFor(base: ApiEnv): ApiEnv {
    const tenantId = currentTenantId();
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return base;
    const cached = this.envCache.get(tenantId);
    if (cached) return cached;
    const own = this.byTenant.get(tenantId) ?? {};
    const keys: GatewayEnvKeys = {
      CASHFREE_APP_ID: own.CASHFREE?.publicKey,
      CASHFREE_SECRET_KEY: own.CASHFREE?.keySecret,
      // Cashfree signs webhooks with the client secret key; a separate webhook
      // secret is optional (the gateway form doesn't require one for Cashfree).
      CASHFREE_WEBHOOK_SECRET: own.CASHFREE?.webhookSecret ?? own.CASHFREE?.keySecret ?? undefined,
      RAZORPAY_KEY_ID: own.RAZORPAY?.publicKey,
      RAZORPAY_KEY_SECRET: own.RAZORPAY?.keySecret,
      RAZORPAY_WEBHOOK_SECRET: own.RAZORPAY?.webhookSecret ?? undefined,
      STRIPE_PUBLISHABLE_KEY: own.STRIPE?.publicKey,
      STRIPE_SECRET_KEY: own.STRIPE?.keySecret,
      STRIPE_WEBHOOK_SECRET: own.STRIPE?.webhookSecret ?? undefined
    };
    const env = Object.freeze({ ...base, ...keys }) as ApiEnv;
    this.envCache.set(tenantId, env);
    return env;
  }

  /** The academy a per-academy webhook URL belongs to, or null (unknown or switched off). */
  async tenantForWebhookKey(provider: TenantGatewayProvider, webhookKey: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(webhookKey)) return null;
    const row = await asPlatform("payments:webhook-key", () =>
      this.prisma.tenantPaymentCredential.findUnique({ select: { enabled: true, provider: true, tenantId: true }, where: { webhookKey } })
    );
    return row && row.enabled && row.provider === provider && row.tenantId !== DEFAULT_TENANT_ID ? row.tenantId : null;
  }

  /** Re-reads one academy's rows after its settings change. */
  async refresh(tenantId: string) {
    this.byTenant.delete(tenantId);
    this.envCache.delete(tenantId);
    const rows = await asPlatform("payments:credentials-refresh", () =>
      this.prisma.tenantPaymentCredential.findMany({ where: { enabled: true, tenantId } })
    );
    for (const row of rows) this.remember(row);
  }

  private remember(row: { provider: string; publicKey: string; secretsEncrypted: string; tenantId: string }) {
    if (row.tenantId === DEFAULT_TENANT_ID) return;
    const secrets = this.decrypt(row.secretsEncrypted);
    if (!secrets) {
      this.logger.warn(`Gateway keys for academy ${row.tenantId} (${row.provider}) could not be decrypted; that gateway stays off for it.`);
      return;
    }
    const provider = row.provider as TenantGatewayProvider;
    this.byTenant.set(row.tenantId, { ...(this.byTenant.get(row.tenantId) ?? {}), [provider]: { ...secrets, publicKey: row.publicKey } });
    this.envCache.delete(row.tenantId);
  }
}
