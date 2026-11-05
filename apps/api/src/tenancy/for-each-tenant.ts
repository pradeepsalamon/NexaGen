import { Logger } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "./tenant-context";

type TenantSource = Pick<PrismaService, "tenant">;

const logger = new Logger("forEachTenant");

/**
 * Runs a background sweep once per academy, inside `runInTenant`, so every
 * query in it is scoped and per-academy settings (messaging rules, attendance
 * policy, invoice settings) resolve for that academy
 * (docs/SAAS_MULTI_TENANCY.md § "Phase 3 plan", slice 2).
 *
 * Use it inside the job lock: `jobLocks.runExclusive(LOCK, () =>
 * forEachTenant(prisma, "cron:x", () => this.sweepNow()))`. A failure in one
 * academy is logged and the others still run; the first error is rethrown at
 * the end so the caller's error handling is unchanged. DEACTIVATED academies
 * are skipped; SUSPENDED ones still get housekeeping.
 */
export async function forEachTenant(
  prisma: TenantSource,
  label: string,
  run: (tenantId: string) => Promise<unknown> | unknown
): Promise<void> {
  const tenants = await prisma.tenant.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    where: { status: { not: "DEACTIVATED" } }
  });
  let firstError: unknown = null;
  for (const { id } of tenants) {
    try {
      await runInTenant(id, label, () => run(id));
    } catch (error) {
      firstError ??= error;
      logger.error(`${label} failed for ${id}: ${(error as Error).message}`);
    }
  }
  if (firstError) throw firstError;
}
