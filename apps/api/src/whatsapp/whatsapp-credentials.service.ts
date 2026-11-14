import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { decryptSecret, deriveMfaKey, encryptSecret } from "../auth/mfa/mfa-crypto";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";

export type AcademyWhatsAppCredentials = { accessToken: string; phoneNumberId: string };

/** How often every process re-reads all academies' WhatsApp tokens (same as gateway keys). */
export const CREDENTIALS_RELOAD_MS = 60_000;

type WhatsAppRow = { accessTokenEncrypted: string | null; phoneNumberId: string | null; tenantId: string; updatedAt?: Date };

/**
 * Another academy's own WhatsApp Business credentials (docs/SAAS_MULTI_TENANCY.md
 * §F "WhatsApp"; Phase 5d). Nexa keeps the server's env number; every other
 * academy sends only from its own, or not at all. Tokens are stored encrypted
 * (AES-256-GCM, key from `CREDENTIALS_ENCRYPTION_KEY`, else `MFA_ENCRYPTION_KEY`) and kept decrypted in
 * memory per academy, because `WhatsAppService.isConfigured()` is synchronous.
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
      for (const row of rows) this.remember(next, row);
      this.byTenant = next;
    } catch (error) {
      // A missing table (migration not yet applied) must not stop the API.
      this.logger.warn(`WhatsApp credentials not loaded: ${(error as Error).message}`);
    }
  }

  canStore(): boolean {
    return this.key !== null;
  }

  encrypt(token: string): string {
    if (!this.key) throw new Error("CREDENTIALS_ENCRYPTION_KEY / MFA_ENCRYPTION_KEY is not set.");
    return encryptSecret(token, this.key);
  }

  /** Null for Nexa (it uses the env number) and for an academy without enabled credentials. */
  forTenant(tenantId: string | null): AcademyWhatsAppCredentials | null {
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return null;
    return this.byTenant.get(tenantId) ?? null;
  }

  /** Re-reads one academy's row after its settings change. */
  async refresh(tenantId: string) {
    const row = await asPlatform("whatsapp:credentials-refresh", () =>
      this.prisma.whatsAppSettings.findUnique({ where: { tenantId } })
    );
    const next = new Map(this.byTenant);
    next.delete(tenantId);
    if (row?.enabled) this.remember(next, row);
    this.byTenant = next;
  }

  private remember(target: Map<string, AcademyWhatsAppCredentials>, row: WhatsAppRow) {
    if (!this.key || !row.accessTokenEncrypted || !row.phoneNumberId) return;
    try {
      target.set(row.tenantId, {
        accessToken: decryptSecret(row.accessTokenEncrypted, this.key),
        phoneNumberId: row.phoneNumberId
      });
    } catch {
      const warnKey = `${row.tenantId}:${row.updatedAt?.getTime() ?? ""}`;
      if (!this.warned.has(warnKey)) {
        this.warned.add(warnKey);
        this.logger.warn(`WhatsApp token for academy ${row.tenantId} could not be decrypted; WhatsApp stays off for it.`);
      }
    }
  }
}
