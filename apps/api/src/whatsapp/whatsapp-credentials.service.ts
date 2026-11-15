import { randomBytes } from "node:crypto";
import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { decryptSecret, deriveMfaKey, encryptSecret } from "../auth/mfa/mfa-crypto";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";

export type AcademyWhatsAppCredentials = { accessToken: string; phoneNumberId: string; wabaId: string | null };

/** What an academy's incoming webhook needs: whose it is, which number, and the secret that signs it. */
export type AcademyWhatsAppInbound = { appSecret: string; phoneNumberId: string; tenantId: string };

/** How often every process re-reads all academies' WhatsApp tokens (same as gateway keys). */
export const CREDENTIALS_RELOAD_MS = 60_000;

const WEBHOOK_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

type WhatsAppRow = {
  accessTokenEncrypted: string | null;
  appSecretEncrypted?: string | null;
  phoneNumberId: string | null;
  tenantId: string;
  updatedAt?: Date;
  wabaId?: string | null;
  webhookKey?: string | null;
};

/**
 * Another academy's own WhatsApp Business credentials (docs/SAAS_MULTI_TENANCY.md
 * §F "WhatsApp"; Phase 5d; incoming messages: docs/WHATSAPP_SUPPORT_MODES_PLAN.md §6).
 * Nexa keeps the server's env number; every other academy sends only from its
 * own, or not at all. Secrets are stored encrypted (AES-256-GCM, key from
 * `CREDENTIALS_ENCRYPTION_KEY`, else `MFA_ENCRYPTION_KEY`) and kept decrypted in
 * memory per academy, because `WhatsAppService.isConfigured()` is synchronous
 * and a webhook must be checked before anything touches the database.
 * Every API process reloads them each `CREDENTIALS_RELOAD_MS`, so a token
 * saved or switched off on one process reaches the others within a minute.
 */
@Injectable()
export class WhatsAppCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppCredentialsService.name);
  private readonly env = getApiEnv();
  private readonly key = (() => {
    const secret = this.env.CREDENTIALS_ENCRYPTION_KEY ?? this.env.MFA_ENCRYPTION_KEY;
    return secret ? deriveMfaKey(`whatsapp:${secret}`) : null;
  })();
  private byTenant = new Map<string, AcademyWhatsAppCredentials>();
  private inboundByKey = new Map<string, AcademyWhatsAppInbound>();
  /** Rows already warned about as undecryptable, so the reload doesn't repeat it every minute. */
  private readonly warned = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reloadAll();
  }

  /** Re-reads every academy's enabled token and swaps them in at once; a failed read keeps the old ones. */
  @Interval(CREDENTIALS_RELOAD_MS)
  async reloadAll() {
    try {
      const rows = await asPlatform("whatsapp:credentials-load", () =>
        this.prisma.whatsAppSettings.findMany({ where: { enabled: true } })
      );
      const next = new Map<string, AcademyWhatsAppCredentials>();
      const inbound = new Map<string, AcademyWhatsAppInbound>();
      for (const row of rows) this.remember(next, inbound, row);
      this.byTenant = next;
      this.inboundByKey = inbound;
    } catch (error) {
      // A missing table (migration not yet applied) must not stop the API.
      this.logger.warn(`WhatsApp credentials not loaded: ${(error as Error).message}`);
    }
  }

  canStore(): boolean {
    return this.key !== null;
  }

  encrypt(value: string): string {
    if (!this.key) throw new Error("CREDENTIALS_ENCRYPTION_KEY / MFA_ENCRYPTION_KEY is not set.");
    return encryptSecret(value, this.key);
  }

  /** Null when the value can't be decrypted (rotated key, damaged row). */
  decrypt(value: string | null): string | null {
    if (!value || !this.key) return null;
    try {
      return decryptSecret(value, this.key);
    } catch {
      return null;
    }
  }

  newWebhookKey(): string {
    return randomBytes(18).toString("base64url");
  }

  newVerifyToken(): string {
    return randomBytes(24).toString("base64url");
  }

  /** Null for Nexa (it uses the env number) and for an academy without enabled credentials. */
  forTenant(tenantId: string | null): AcademyWhatsAppCredentials | null {
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return null;
    return this.byTenant.get(tenantId) ?? null;
  }

  /**
   * The academy an incoming webhook URL belongs to, with its app secret. Null
   * for an unknown or malformed key, or an academy that is switched off or has
   * no app secret / token yet (it couldn't answer anyway).
   */
  inboundFor(webhookKey: string): AcademyWhatsAppInbound | null {
    if (!WEBHOOK_KEY_PATTERN.test(webhookKey)) return null;
    return this.inboundByKey.get(webhookKey) ?? null;
  }

  /**
   * The verify token for Meta's subscription handshake on an academy's URL.
   * Read from the database: the handshake comes while the academy is still
   * setting up, possibly before it switches WhatsApp on.
   */
  async verifyTokenFor(webhookKey: string): Promise<string | null> {
    if (!WEBHOOK_KEY_PATTERN.test(webhookKey)) return null;
    const row = await asPlatform("whatsapp:verify-token", () =>
      this.prisma.whatsAppSettings.findUnique({ select: { tenantId: true, verifyTokenEncrypted: true }, where: { webhookKey } })
    );
    if (!row || row.tenantId === DEFAULT_TENANT_ID) return null;
    return this.decrypt(row.verifyTokenEncrypted);
  }

  /** Re-reads one academy's row after its settings change. */
  async refresh(tenantId: string) {
    const row = await asPlatform("whatsapp:credentials-refresh", () =>
      this.prisma.whatsAppSettings.findUnique({ where: { tenantId } })
    );
    const next = new Map(this.byTenant);
    next.delete(tenantId);
    const inbound = new Map([...this.inboundByKey].filter(([, value]) => value.tenantId !== tenantId));
    if (row?.enabled) this.remember(next, inbound, row);
    this.byTenant = next;
    this.inboundByKey = inbound;
  }

  private remember(target: Map<string, AcademyWhatsAppCredentials>, inbound: Map<string, AcademyWhatsAppInbound>, row: WhatsAppRow) {
    if (!this.key || !row.accessTokenEncrypted || !row.phoneNumberId || row.tenantId === DEFAULT_TENANT_ID) return;
    const accessToken = this.decrypt(row.accessTokenEncrypted);
    const appSecret = row.appSecretEncrypted ? this.decrypt(row.appSecretEncrypted) : null;
    if (!accessToken || (row.appSecretEncrypted && !appSecret)) {
      const warnKey = `${row.tenantId}:${row.updatedAt?.getTime() ?? ""}`;
      if (!this.warned.has(warnKey)) {
        this.warned.add(warnKey);
        this.logger.warn(`WhatsApp secrets for academy ${row.tenantId} could not be decrypted; WhatsApp stays off for it.`);
      }
      if (!accessToken) return;
    }
    target.set(row.tenantId, { accessToken, phoneNumberId: row.phoneNumberId, wabaId: row.wabaId ?? null });
    if (appSecret && row.webhookKey) {
      inbound.set(row.webhookKey, { appSecret, phoneNumberId: row.phoneNumberId, tenantId: row.tenantId });
    }
  }
}
