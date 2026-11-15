import { Logger } from "@nestjs/common";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { asPlatform, runInTenant } from "./tenant-context";

const logger = new Logger("runJobForRow");

/**
 * A queue job's work, run as the academy of the row it is about
 * (docs/SAAS_MULTI_TENANCY.md §E "BullMQ"). The row decides, never the
 * payload: a payload `tenantId` that disagrees is dropped and logged. Jobs
 * queued before payloads carried `tenantId` still run (the row decides). A
 * missing row runs as the payload's academy so the job's own not-found
 * handling is unchanged.
 */
export async function runJobForRow(
  label: string,
  payloadTenantId: string | undefined,
  readRowTenantId: () => Promise<{ tenantId: string | null } | null>,
  run: () => Promise<unknown>
): Promise<void> {
  const row = await asPlatform(`${label}: read the row's academy`, readRowTenantId);
  const rowTenantId = row ? (row.tenantId ?? DEFAULT_TENANT_ID) : (payloadTenantId ?? DEFAULT_TENANT_ID);
  if (row && payloadTenantId && payloadTenantId !== rowTenantId) {
    logger.warn(`${label}: payload academy ${payloadTenantId} ≠ row academy ${rowTenantId}; job dropped.`);
    return;
  }
  await runInTenant(rowTenantId, label, run);
}
