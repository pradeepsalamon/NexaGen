import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { decryptSecret, deriveMfaKey, encryptSecret } from "../auth/mfa/mfa-crypto";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";

export type AcademyWhatsAppCredentials = { accessToken: string; phoneNumberId: string };

/**
 * Another academy's own WhatsApp Business credentials (docs/SAAS_MULTI_TENANCY.md
 * §F "WhatsApp"; Phase 5d). Nexa keeps the server's env number; every other
 * academy sends only from its own, or not at all. Tokens are stored encrypted
 * (AES-256-GCM, key from `WHATSAPP_CREDENTIALS_KEY`, else `MFA_ENCRYPTION_KEY`) and kept decrypted in
 * memory per academy, because `WhatsAppService.isConfigured()` is synchronous.
 */
@Injectable()
export class WhatsAppCredentialsService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppCredentialsService.name);
  private readonly env = getApiEnv();
  private readonly key = (() => {
    const secret = this.env.WHATSAPP_CREDENTIALS_KEY ?? this.env.MFA_ENCRYPTION_KEY;
    return secret ? deriveMfaKey(`whatsapp:${secret}`) : null;
  })();
  private readonly byTenant = new Map<string, AcademyWhatsAppCredentials>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      const rows = await asPlatform("whatsapp:credentials-load", () =>
        this.prisma.whatsAppSettings.findMany({ where: { enabled: true } })
      );
      for (const row of rows) this.remember(row);
    } catch (error) {
      // A missing table (migration not yet applied) must not stop the API.
      this.logger.warn(`WhatsApp credentials not loaded: ${(error as Error).message}`);
    }
  }

  canStore(): boolean {
    return this.key !== null;
  }

  encrypt(token: string): string {
    if (!this.key) throw new Error("WHATSAPP_CREDENTIALS_KEY / MFA_ENCRYPTION_KEY is not set.");
    return encryptSecret(token, this.key);
  }

  /** Null for Nexa (it uses the env number) and for an academy without enabled credentials. */
  forTenant(tenantId: string | null): AcademyWhatsAppCredentials | null {
    if (!tenantId || tenantId === DEFAULT_TENANT_ID) return null;
    return this.byTenant.get(tenantId) ?? null;
  }

  /** Re-reads one academy's row after its settings change. */
  async refresh(tenantId: string) {
    this.byTenant.delete(tenantId);
    const row = await asPlatform("whatsapp:credentials-refresh", () =>
      this.prisma.whatsAppSettings.findUnique({ where: { tenantId } })
    );
    if (row?.enabled) this.remember(row);
  }

  private remember(row: { accessTokenEncrypted: string | null; phoneNumberId: string | null; tenantId: string }) {
    if (!this.key || !row.accessTokenEncrypted || !row.phoneNumberId) return;
    try {
      this.byTenant.set(row.tenantId, {
        accessToken: decryptSecret(row.accessTokenEncrypted, this.key),
        phoneNumberId: row.phoneNumberId
      });
    } catch {
      this.logger.warn(`WhatsApp token for academy ${row.tenantId} could not be decrypted; WhatsApp stays off for it.`);
    }
  }
}
