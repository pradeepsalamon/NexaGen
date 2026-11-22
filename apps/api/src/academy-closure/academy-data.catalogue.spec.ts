import { Prisma } from "@prisma/client";
import { TENANT_TABLES } from "../tenancy/tenant-models";
import {
  ANONYMISED_USER_FIELDS,
  ANONYMISE_USERS_SQL,
  clearReferenceSql,
  deleteUnreferencedSql,
  isSecretColumn,
  KEPT_USER_FIELDS,
  PURGEABLE_TABLES,
  RETAINED_TABLES,
  type ForeignKey
} from "./academy-data.catalogue";

const fk = (over: Partial<ForeignKey>): ForeignKey => ({
  columns: ["batchId"],
  constraint: "c",
  nullable: false,
  parentColumns: ["id"],
  parentTable: "batches",
  table: "batch_students",
  ...over
});

describe("academy data catalogue (docs/ACADEMY_CLOSURE.md)", () => {
  it("classifies every User field as anonymised or kept", () => {
    const fields = Prisma.dmmf.datamodel.models
      .find((model) => model.name === "User")!
      .fields.filter((field) => field.kind !== "object")
      .map((field) => field.name);
    const classified = new Set<string>([...ANONYMISED_USER_FIELDS, ...KEPT_USER_FIELDS]);
    // A new User column must be added to one list: is it personal data?
    expect(fields.filter((field) => !classified.has(field))).toEqual([]);
    expect([...classified].filter((field) => !fields.includes(field))).toEqual([]);
    for (const field of ANONYMISED_USER_FIELDS) expect(ANONYMISE_USERS_SQL).toContain(`"${field}"`);
  });

  it("keeps the financial tables and purges every other academy table", () => {
    for (const table of ["invoices", "orders", "payments", "refunds", "credit_notes", "payslips", "coach_payroll_records"]) {
      expect(RETAINED_TABLES.has(table)).toBe(true);
      expect(PURGEABLE_TABLES).not.toContain(table);
    }
    expect(PURGEABLE_TABLES).toEqual(expect.arrayContaining(["users", "batches", "chat_messages", "student_profiles"]));
    expect(PURGEABLE_TABLES.length + RETAINED_TABLES.size).toBe(TENANT_TABLES.size);
    // Platform tables (the academy row, its subscription, platform invoices) are never purged.
    for (const table of ["tenants", "tenant_subscriptions", "platform_invoices", "tenant_closures"]) {
      expect(PURGEABLE_TABLES).not.toContain(table);
    }
  });

  it("finds secret columns by name", () => {
    for (const column of ["password", "tokenHash", "refreshTokenHash", "mfaSecretEncrypted", "secretEncrypted", "webhookKey", "recoveryCodes"]) {
      expect(isSecretColumn(column)).toBe(true);
    }
    for (const column of ["email", "firstName", "tenantId", "phoneNumber", "parentName"]) expect(isSecretColumn(column)).toBe(false);
  });

  it("deletes only the academy's unreferenced rows, ignoring a row's link to itself", () => {
    const sql = deleteUnreferencedSql("batches", [
      fk({}),
      fk({ columns: ["parentId"], parentTable: "batches", table: "batches" })
    ]);
    expect(sql).toContain(`DELETE FROM "batches" p WHERE p."tenantId" = $1`);
    expect(sql).toContain(`NOT EXISTS (SELECT 1 FROM "batch_students" r0 WHERE r0."batchId" = p."id")`);
    expect(sql).toContain(`r1."parentId" = p."id" AND r1.ctid <> p.ctid`);
  });

  it("clears a nullable reference on the academy's rows only", () => {
    expect(clearReferenceSql(fk({ columns: ["coachId"], nullable: true, table: "classes" }))).toBe(
      `UPDATE "classes" SET "coachId" = NULL WHERE "tenantId" = $1 AND ("coachId" IS NOT NULL)`
    );
  });
});
