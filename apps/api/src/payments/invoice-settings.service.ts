import { Injectable } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_TENANT_ID,
  invoiceSettingsSchema,
  type InvoiceSettings,
  type InvoiceSettingsResponse,
  type UpdateInvoiceSettingsRequest
} from "@nexa-chess/types";
import type { InvoiceSettings as InvoiceSettingsRow } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId, singletonRowId } from "../tenancy/tenant-sql";

/**
 * This academy's row (one per academy, docs/SAAS_MULTI_TENANCY.md § "Phase 3
 * plan", slice 5): found by `tenantId`, created with its own id.
 */
function settingsRow() {
  const tenantId = requireTenantId("invoiceSettings");
  return { create: { id: singletonRowId(tenantId), tenantId }, where: { tenantId } };
}

/**
 * Admin → Settings → Billing & Invoicing (§4).
 *
 * Business details are configuration, never constants in a template. The row is
 * seeded from the legacy `PAYMENTS_*` env vars the first time it is read, so an
 * existing deployment keeps issuing invoices with the details it already had
 * until an admin edits them.
 */
@Injectable()
export class InvoiceSettingsService {
  private readonly env = getApiEnv();

  constructor(private readonly prisma: PrismaService) {}

  /** The resolved settings an invoice is stamped with. */
  async get(): Promise<InvoiceSettings> {
    const row = await this.prisma.invoiceSettings.findUnique({
      where: settingsRow().where
    });
    return row ? this.toSettings(row) : await this.envDefaults();
  }

  async getResponse(): Promise<InvoiceSettingsResponse> {
    const row = await this.prisma.invoiceSettings.findUnique({
      where: settingsRow().where
    });

    return {
      settings: row ? this.toSettings(row) : await this.envDefaults(),
      // `updatedAt` is null until an admin actually saves, which is how the UI
      // knows it is still looking at env-derived placeholders.
      configured: Boolean(row?.updatedAt),
      updatedAt: row?.updatedAt?.toISOString() ?? null
    };
  }

  async update(
    actorId: string,
    input: UpdateInvoiceSettingsRequest
  ): Promise<InvoiceSettingsResponse> {
    // Merge onto what is currently effective rather than onto schema defaults,
    // so a partial save never silently blanks a field the admin did not touch.
    const merged = invoiceSettingsSchema.parse({
      ...(await this.get()),
      ...stripUndefined(input)
    });

    await this.prisma.invoiceSettings.upsert({
      where: settingsRow().where,
      create: {
        ...settingsRow().create, ...merged,
        updatedAt: new Date(),
        updatedById: actorId
      },
      update: { ...merged, updatedAt: new Date(), updatedById: actorId }
    });

    return this.getResponse();
  }

  /**
   * Pre-seed values from the environment. These are only ever a starting point:
   * once an admin saves, the row wins and the env vars are ignored.
   */
  private async envDefaults(): Promise<InvoiceSettings> {
    // The `PAYMENTS_SELLER_*` env (and the "NexaChess" default) is Nexa's
    // identity: another academy starts from its own name until its admin saves.
    const tenantId = requireTenantId("invoiceSettings");
    if (tenantId !== DEFAULT_TENANT_ID) {
      const tenant = await this.prisma.tenant.findUnique({ select: { name: true }, where: { id: tenantId } });
      return invoiceSettingsSchema.parse({ ...DEFAULT_INVOICE_SETTINGS, legalName: tenant?.name ?? "Academy" });
    }
    return invoiceSettingsSchema.parse({
      ...DEFAULT_INVOICE_SETTINGS,
      legalName:
        this.env.PAYMENTS_SELLER_NAME ?? DEFAULT_INVOICE_SETTINGS.legalName,
      addressLine1: this.env.PAYMENTS_SELLER_ADDRESS ?? null,
      gstin: this.env.PAYMENTS_SELLER_TAX_ID ?? null,
      taxLabel: this.env.PAYMENTS_TAX_LABEL
    });
  }

  private toSettings(row: InvoiceSettingsRow): InvoiceSettings {
    return invoiceSettingsSchema.parse({
      legalName: row.legalName,
      tradeName: row.tradeName,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      country: row.country,
      email: row.email,
      phone: row.phone,
      website: row.website,
      gstin: row.gstin,
      pan: row.pan,
      logoUrl: row.logoUrl,
      invoicePrefix: row.invoicePrefix,
      creditNotePrefix: row.creditNotePrefix,
      defaultTaxPercent: row.defaultTaxPercent,
      taxLabel: row.taxLabel,
      footerText: row.footerText,
      termsText: row.termsText,
      supportEmail: row.supportEmail,
      emailOnIssue: row.emailOnIssue,
      attachPdfToEmail: row.attachPdfToEmail
    });
  }
}

function stripUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
