import { Injectable, Logger, Optional } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { AcademyPurgeReport } from "@nexa-chess/types";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { Prisma, TenantClosureStatus, TenantDomainStatus } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { TenantResolverService } from "../tenancy/tenant-resolver.service";
import { UploadService } from "../upload/upload.service";
import {
  ANONYMISE_USERS_SQL,
  clearReferenceSql,
  crossAcademySql,
  deleteUnreferencedSql,
  DISCOVER_FOREIGN_KEYS_SQL,
  type ForeignKey,
  PURGEABLE_TABLES,
  quoteIdent,
  RETAINED_TABLES
} from "./academy-data.catalogue";
import { TENANT_TABLES } from "../tenancy/tenant-models";

/** Safety stop: a schema needing more passes than this has a cycle the clearing step missed. */
const MAX_PASSES = 60;
/** A purge that stops (crash, deploy) is picked up again once this lease runs out. */
const PURGE_LEASE_MS = 60 * 60_000;

/**
 * Erases a closed academy's data once its undo window has passed
 * (docs/ACADEMY_CLOSURE.md "The purge"). Runs hourly as a single runner and is
 * safe to stop and start again: every step only removes what is still there.
 *
 * 1. Uploaded files (Cloudinary) are destroyed, best effort.
 * 2. Every nullable reference between the academy's rows is cleared.
 * 3. Passes delete each academy table's rows that nothing points at, until a
 *    pass deletes nothing. The financial records in `RETAINED_TABLES` are never
 *    deleted, so they, and the rows they point at, stay.
 * 4. The users still there (named on a kept record) are anonymised.
 * 5. The academy's addresses are released; the `tenants` row stays (records point at it).
 */
@Injectable()
export class AcademyPurgeService {
  private readonly logger = new Logger(AcademyPurgeService.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService,
    private readonly resolver: TenantResolverService,
    @Optional() private readonly uploads?: UploadService
  ) {}

  @Cron("17 * * * *", { timeZone: "UTC" })
  async runDue(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.academyPurge, () => this.purgeDue(), { ttlMs: 30 * 60_000 });
  }

  /** Every closure whose purge is due (or whose earlier run stopped). Returns how many finished. */
  async purgeDue(now = new Date()): Promise<number> {
    const due = await asPlatform("academy purge: find due closures", () =>
      this.prisma.tenantClosure.findMany({
        orderBy: { purgeAfter: "asc" },
        select: { id: true },
        where: {
          OR: [
            { purgeAfter: { lte: now }, status: TenantClosureStatus.PURGE_SCHEDULED },
            { purgeLeaseUntil: { lt: now }, status: TenantClosureStatus.PURGING }
          ]
        }
      })
    );
    let finished = 0;
    for (const { id } of due) {
      try {
        if (await this.purgeClosure(id, now)) finished += 1;
      } catch (error) {
        this.logger.error(`Academy purge for closure ${id} failed; it will be retried`, error as Error);
      }
    }
    return finished;
  }

  /** Claims one due closure and purges its academy. False when another run has it or it was cancelled. */
  async purgeClosure(closureId: string, now = new Date()): Promise<boolean> {
    const claimed = await asPlatform("academy purge: claim", () =>
      this.prisma.tenantClosure.updateMany({
        data: {
          purgeLeaseUntil: new Date(now.getTime() + PURGE_LEASE_MS),
          purgeStartedAt: now,
          status: TenantClosureStatus.PURGING
        },
        where: {
          id: closureId,
          OR: [
            { purgeAfter: { lte: now }, status: TenantClosureStatus.PURGE_SCHEDULED },
            { purgeLeaseUntil: { lt: now }, status: TenantClosureStatus.PURGING }
          ]
        }
      })
    );
    if (claimed.count !== 1) return false;
    const closure = await asPlatform("academy purge: read closure", () =>
      this.prisma.tenantClosure.findUniqueOrThrow({ where: { id: closureId } })
    );
    if (closure.tenantId === DEFAULT_TENANT_ID) throw new Error("The platform's own academy is never purged.");

    const report = await this.purgeTenant(closure.tenantId);
    await asPlatform("academy purge: done", () =>
      this.prisma.tenantClosure.update({
        data: {
          purgeLeaseUntil: null,
          purgeReport: report as unknown as Prisma.InputJsonValue,
          purgedAt: new Date(),
          status: TenantClosureStatus.PURGED
        },
        where: { id: closureId }
      })
    );
    this.logger.log(
      `Academy ${closure.tenantId} purged: ${report.deletedRows} rows deleted, ${report.anonymisedUsers} users anonymised, ` +
        `${Object.values(report.keptRows).reduce((sum, count) => sum + count, 0)} rows kept`
    );
    return true;
  }

  /** The erasure itself. Exposed for the integration spec; callers go through `purgeClosure`. */
  async purgeTenant(tenantId: string): Promise<AcademyPurgeReport> {
    if (tenantId === DEFAULT_TENANT_ID) throw new Error("The platform's own academy is never purged.");
    const startedAt = new Date().toISOString();
    return asPlatform(`academy purge: erase ${tenantId}`, async () => {
      const { deletedFiles, fileErrors } = await this.destroyFiles(tenantId);
      const foreignKeys = await this.prisma.$queryRawUnsafe<ForeignKey[]>(DISCOVER_FOREIGN_KEYS_SQL);

      // 2. Clear nullable references held by the academy's deletable rows.
      for (const fk of foreignKeys) {
        if (!fk.nullable || !TENANT_TABLES.has(fk.table) || RETAINED_TABLES.has(fk.table)) continue;
        try {
          await this.prisma.$executeRawUnsafe(clearReferenceSql(fk), tenantId);
        } catch (error) {
          // A check constraint may need the column; the delete passes still handle the row.
          this.logger.warn(`Purge ${tenantId}: could not clear ${fk.table}.${fk.columns.join(",")}: ${(error as Error).message}`);
        }
      }

      // 3. Delete unreferenced rows, table by table, until nothing moves.
      const incoming = new Map<string, ForeignKey[]>();
      for (const fk of foreignKeys) incoming.set(fk.parentTable, [...(incoming.get(fk.parentTable) ?? []), fk]);
      let deletedRows = 0;
      let passes = 0;
      for (; passes < MAX_PASSES; passes += 1) {
        let deletedThisPass = 0;
        for (const table of PURGEABLE_TABLES) {
          try {
            deletedThisPass += await this.prisma.$executeRawUnsafe(
              deleteUnreferencedSql(table, incoming.get(table) ?? []),
              tenantId
            );
          } catch (error) {
            this.logger.warn(`Purge ${tenantId}: delete from ${table} failed this pass: ${(error as Error).message}`);
          }
        }
        deletedRows += deletedThisPass;
        if (deletedThisPass === 0) break;
      }

      // 4. Users a kept record still names.
      const anonymisedUsers = await this.prisma.$executeRawUnsafe(ANONYMISE_USERS_SQL, tenantId, new Date().toISOString());

      // 5. Release the academy's addresses for reuse.
      await this.prisma.tenantDomain.updateMany({
        data: { isPrimary: false, status: TenantDomainStatus.REMOVED },
        where: { tenantId }
      });
      const hosts = await this.prisma.tenantDomain.findMany({ select: { hostname: true }, where: { tenantId } });
      for (const { hostname } of hosts) this.resolver.invalidate(hostname);

      const keptRows: Record<string, number> = {};
      for (const table of [...TENANT_TABLES].sort()) {
        const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
          `SELECT count(*)::int AS count FROM ${quoteIdent(table)} WHERE "tenantId" = $1`,
          tenantId
        );
        if (count > 0) keptRows[table] = count;
      }

      // Rows of other academies still pointing in (they kept something alive).
      const crossAcademyLinks: Record<string, number> = {};
      for (const fk of foreignKeys) {
        if (!(fk.parentTable in keptRows) || !TENANT_TABLES.has(fk.table)) continue;
        const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: number }[]>(crossAcademySql(fk), tenantId);
        if (count > 0) crossAcademyLinks[`${fk.table}.${fk.columns.join(",")}`] = count;
      }

      return {
        anonymisedUsers,
        crossAcademyLinks,
        deletedFiles,
        deletedRows,
        fileErrors,
        finishedAt: new Date().toISOString(),
        keptRows,
        passes: passes + 1,
        startedAt
      };
    });
  }

  /** Destroys the academy's uploads in Cloudinary. A file that can't be removed is counted, not fatal. */
  private async destroyFiles(tenantId: string): Promise<{ deletedFiles: number; fileErrors: number }> {
    const files = await this.prisma.uploadedFile.findMany({ select: { publicId: true }, where: { tenantId } });
    if (files.length === 0 || !this.uploads?.isConfigured()) return { deletedFiles: 0, fileErrors: files.length };
    let deletedFiles = 0;
    let fileErrors = 0;
    for (const { publicId } of files) {
      if (await this.uploads.destroyByPublicId(publicId)) deletedFiles += 1;
      else fileErrors += 1;
    }
    return { deletedFiles, fileErrors };
  }
}
