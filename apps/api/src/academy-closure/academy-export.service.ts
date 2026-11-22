import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AcademyExportHeader, AcademyExportLine } from "@nexa-chess/types";
import type { Response } from "express";
import { once } from "node:events";
import { createGzip } from "node:zlib";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { TENANT_TABLES } from "../tenancy/tenant-models";
import { type ColumnRow, DISCOVER_COLUMNS_SQL, isSecretColumn, quoteIdent } from "./academy-data.catalogue";

const PAGE = 500;

/**
 * An academy's whole data set as one download (docs/ACADEMY_CLOSURE.md
 * "Export"): gzip, one JSON object per line — a header, then one line per row
 * of every academy table. Secret columns (password hashes, tokens, keys) are
 * left out. Callers decide who may download; this only streams.
 */
@Injectable()
export class AcademyExportService {
  private readonly logger = new Logger(AcademyExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async stream(tenantId: string, res: Response): Promise<void> {
    const tenant = await asPlatform("academy export: tenant", () =>
      this.prisma.tenant.findUnique({ select: { id: true, name: true, slug: true }, where: { id: tenantId } })
    );
    if (!tenant) throw new NotFoundException("Academy not found.");
    const columns = await asPlatform("academy export: columns", () =>
      this.prisma.$queryRawUnsafe<ColumnRow[]>(DISCOVER_COLUMNS_SQL)
    );
    const byTable = new Map<string, string[]>();
    for (const { column, table } of columns) byTable.set(table, [...(byTable.get(table) ?? []), column]);
    const tables = [...TENANT_TABLES].filter((table) => byTable.has(table)).sort();
    const redactedColumns = [...new Set(tables.flatMap((table) => byTable.get(table)!.filter(isSecretColumn)))].sort();

    const exportedAt = new Date().toISOString();
    res.setHeader("Content-Type", "application/gzip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="academy-${tenant.slug.replace(/[^a-z0-9-]/gi, "")}-${exportedAt.slice(0, 10)}.ndjson.gz"`
    );
    res.setHeader("Cache-Control", "no-store");
    const gzip = createGzip();
    gzip.pipe(res);
    const write = async (value: unknown) => {
      if (!gzip.write(`${JSON.stringify(value)}\n`)) await once(gzip, "drain");
    };

    try {
      const header: AcademyExportHeader = {
        exportedAt,
        format: "nexa-academy-export",
        redactedColumns,
        tenant,
        version: 1
      };
      await write(header);
      for (const table of tables) {
        const tableColumns = byTable.get(table)!;
        const secret = tableColumns.filter(isSecretColumn);
        // Every academy table's `id` is text (cuid), so keyset paging on it uses the primary key.
        const keyed = tableColumns.includes("id");
        let after = "";
        let offset = 0;
        for (;;) {
          const rows = await asPlatform(`academy export: ${table}`, () =>
            keyed
              ? this.prisma.$queryRawUnsafe<{ row: Record<string, unknown>; k: string }[]>(
                  `SELECT (to_jsonb(t) - $2::text[]) AS row, t."id" AS k FROM ${quoteIdent(table)} t
                   WHERE t."tenantId" = $1 AND t."id" > $3 ORDER BY t."id" LIMIT ${PAGE}`,
                  tenantId,
                  secret,
                  after
                )
              : this.prisma.$queryRawUnsafe<{ row: Record<string, unknown>; k: string }[]>(
                  `SELECT (to_jsonb(t) - $2::text[]) AS row, '' AS k FROM ${quoteIdent(table)} t
                   WHERE t."tenantId" = $1 ORDER BY t.ctid LIMIT ${PAGE} OFFSET ${offset}`,
                  tenantId,
                  secret
                )
          );
          for (const { row } of rows) {
            const line: AcademyExportLine = { row, table };
            await write(line);
          }
          if (rows.length < PAGE) break;
          after = rows[rows.length - 1].k;
          offset += rows.length;
        }
      }
      gzip.end();
      await once(res, "finish");
    } catch (error) {
      this.logger.error(`Academy export for ${tenantId} failed mid-stream`, error as Error);
      gzip.destroy(error as Error);
      res.destroy(error as Error);
    }
  }
}
