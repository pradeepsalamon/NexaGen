import { Prisma } from "@prisma/client";
import {
  countSql,
  isPlatformOperatorLink,
  PLATFORM_OPERATOR_LINKS,
  quoteIdent,
  sampleSql,
  summarizeFindings,
  type TenantLink
} from "./tenant-integrity.rules";

const link = (overrides: Partial<TenantLink> = {}): TenantLink => ({
  column: "userId",
  constraint: "notifications_userId_fkey",
  keyColumns: ["id"],
  parentColumn: "id",
  parentTable: "users",
  table: "notifications",
  ...overrides
});

describe("tenant integrity rules", () => {
  it("flags a row whose academy differs from its parent's", () => {
    const sql = sampleSql(link());
    expect(sql).toContain('FROM "notifications" ch JOIN "users" p ON p."id" = ch."userId"');
    expect(sql).toContain('WHERE ch."tenantId" IS DISTINCT FROM p."tenantId"');
    expect(sql).toContain("LIMIT 20");
    expect(sql).not.toContain("SUPER_ADMIN");
    expect(countSql(link())).toMatch(/^SELECT count\(\*\)::int AS "count" FROM "notifications"/);
  });

  it("exempts only a platform operator, and only on the listed links", () => {
    const event = link({ column: "actorUserId", table: "tenant_subscription_events" });
    expect(isPlatformOperatorLink(event)).toBe(true);
    expect(sampleSql(event)).toContain(`AND NOT (p."role" = 'SUPER_ADMIN' AND p."tenantId" = $1)`);
    // A listed column pointing anywhere but users is not exempt.
    expect(isPlatformOperatorLink({ ...event, parentTable: "batches" })).toBe(false);
    expect(isPlatformOperatorLink(link())).toBe(false);
  });

  it("every exempt link is a real relation to User in the schema", () => {
    const byTable = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.dbName ?? model.name, model]));
    for (const entry of PLATFORM_OPERATOR_LINKS) {
      const model = byTable.get(entry.table);
      expect(model).toBeDefined();
      const relation = model!.fields.find((field) => field.relationFromFields?.includes(entry.column));
      expect({ table: entry.table, type: relation?.type }).toEqual({ table: entry.table, type: "User" });
    }
  });

  it("reports a composite primary key as the row id", () => {
    expect(sampleSql(link({ keyColumns: ["batchId", "studentId"] }))).toContain(
      `json_build_object('batchId', ch."batchId"::text, 'studentId', ch."studentId"::text)`
    );
  });

  it("quotes identifiers", () => {
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });

  it("summarizes findings for the email, with ids and both academies", () => {
    const text = summarizeFindings(
      [
        {
          column: "userId",
          count: 2,
          parentTable: "users",
          samples: [{ parentId: "u9", parentTenantId: "tenant_nexa", rowKey: { id: "n1" }, tenantId: "tenant_rook" }],
          table: "notifications"
        }
      ],
      [{ column: "batchId", message: "timeout", table: "batch_students" }]
    );
    expect(text).toBe(
      "- notifications.userId → users: 2 rows (e.g. row id=n1 in tenant_rook points at u9 in tenant_nexa)\n" +
        "- Could not check 1 relationship: batch_students.batchId"
    );
    expect(summarizeFindings([], [])).toBe("- Nothing found.");
  });
});
