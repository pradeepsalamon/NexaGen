import { Injectable } from "@nestjs/common";
import {
  DEFAULT_PAYROLL_SETTINGS,
  type PayrollSettingsItem,
  type UpdatePayrollSettingsRequest
} from "@nexa-chess/types";
import type { PayrollSettings } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId, singletonRowId } from "../tenancy/tenant-sql";
import { PayrollAuditService } from "./payroll-audit.service";

/** This academy's row (one per academy): found by `tenantId`, created with its own id. */
function settingsRow() {
  const tenantId = requireTenantId("payrollSettings");
  return { create: { id: singletonRowId(tenantId), tenantId }, where: { tenantId } };
}

/**
 * An academy's payroll settings: today, TDS (tax deducted at source) — on or
 * off, the rate, the yearly threshold and the month its financial year
 * starts. A change applies to periods calculated afterwards; a record already
 * calculated keeps the terms frozen in its `tdsSnapshot`.
 */
@Injectable()
export class PayrollSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PayrollAuditService
  ) {}

  /** The saved row, or null for an academy that never set anything (a calculation must not create one). */
  find(): Promise<PayrollSettings | null> {
    return this.prisma.payrollSettings.findUnique({ where: settingsRow().where });
  }

  async getItem(): Promise<PayrollSettingsItem> {
    return this.toItem(await this.find());
  }

  async update(actorId: string, body: UpdatePayrollSettingsRequest): Promise<PayrollSettingsItem> {
    const data = {
      ...(body.tdsEnabled !== undefined ? { tdsEnabled: body.tdsEnabled } : {}),
      ...(body.tdsRateBps !== undefined ? { tdsRateBps: body.tdsRateBps } : {}),
      ...(body.tdsThresholdMinor !== undefined ? { tdsThresholdMinor: body.tdsThresholdMinor } : {}),
      ...(body.financialYearStartMonth !== undefined
        ? { financialYearStartMonth: body.financialYearStartMonth }
        : {}),
      updatedById: actorId
    };
    const row = settingsRow();
    const updated = await this.prisma.payrollSettings.upsert({
      create: { ...row.create, ...data },
      update: data,
      where: row.where
    });

    await this.audit.log({
      entity: "PayrollSettings",
      entityId: updated.id,
      action: "PAYROLL_SETTINGS_UPDATED",
      userId: actorId,
      metadata: { ...body }
    });

    return this.toItem(updated);
  }

  private toItem(settings: PayrollSettings | null): PayrollSettingsItem {
    if (!settings) return DEFAULT_PAYROLL_SETTINGS;
    return {
      financialYearStartMonth: settings.financialYearStartMonth,
      tdsEnabled: settings.tdsEnabled,
      tdsRateBps: settings.tdsRateBps,
      tdsThresholdMinor: settings.tdsThresholdMinor,
      updatedAt: settings.updatedAt.toISOString()
    };
  }
}
