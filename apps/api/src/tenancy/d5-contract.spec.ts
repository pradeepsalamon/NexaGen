import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Keeps the §D5 contract (apps/api/prisma/contract/d5_saas_drop_global_uniques,
 * docs/SAAS_MULTI_TENANCY.md Phase 7) in step with the schema. It went stale
 * twice (2026-11-15, -16): every new academy table defaults `tenantId` to
 * 'tenant_nexa', and the contract must switch that default to the raising
 * `nexa_tenant_required()`; and `schema.patch` must still apply to
 * `schema.prisma`. This fails the day a new academy table lands without both.
 */
const API = join(__dirname, "..", "..");
const REPO = join(API, "..", "..");
const CONTRACT = join(API, "prisma", "contract", "d5_saas_drop_global_uniques");

function tablesDefaultingToNexa(schema: string): string[] {
  const tables: string[] = [];
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const [, model, body] = match;
    if (!/^\s*tenantId\s+String\s+(?:@[\w()]+\s+)*@default\("tenant_nexa"\)/m.test(body)) continue;
    tables.push(/@@map\("([^"]+)"\)/.exec(body)?.[1] ?? model);
  }
  return tables.sort();
}

describe("§D5 contract stays in step with the schema", () => {
  const schema = readFileSync(join(API, "prisma", "schema.prisma"), "utf8");
  const contract = readFileSync(join(CONTRACT, "migration.sql"), "utf8");

  it("switches every academy table's tenantId default to the raising one", () => {
    // Alone, or inside a combined ALTER TABLE (the re-keyed sequence tables).
    const missing = tablesDefaultingToNexa(schema).filter(
      (table) => !new RegExp(`ALTER TABLE "${table}"[^;]*ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required\\(\\)`).test(contract)
    );
    // Fix: add `ALTER TABLE "<table>" ALTER COLUMN "tenantId" SET DEFAULT nexa_tenant_required();`
    // to migration.sql and the matching hunk to schema.patch (see the contract README).
    expect(missing).toEqual([]);
  });

  it("schema.patch still applies to schema.prisma", () => {
    let error = "";
    try {
      execFileSync("git", ["apply", "--check", join(CONTRACT, "schema.patch")], { cwd: REPO, stdio: "pipe" });
    } catch (caught) {
      error = String((caught as { stderr?: Buffer }).stderr ?? caught);
    }
    // Fix: rebuild the patch from the current schema.prisma (contract README, "Rehearsal log" 2026-11-16).
    expect(error).toBe("");
  });
});
