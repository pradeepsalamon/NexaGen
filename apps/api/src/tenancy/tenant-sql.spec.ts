import { AcademyNotResolved, setTenantScopeModeForTesting, TenantScopeViolation } from "../prisma/tenant-scope.extension";
import { resetTenantAuditForTesting, tenantAuditCountsForTesting } from "./tenant-audit";
import { runInTenant, runWithTenantContext } from "./tenant-context";
import { sqlTenantId, tenantFilter } from "./tenant-sql";

describe("tenantFilter", () => {
  beforeEach(() => {
    resetTenantAuditForTesting();
    setTenantScopeModeForTesting("audit");
  });
  afterAll(() => setTenantScopeModeForTesting(null));

  it("binds the context's academy on the aliased column", async () => {
    const sql = await runInTenant("tenant_a", "spec", () => tenantFilter("c"));
    expect(sql.sql).toBe(`"c"."tenantId" = ?`);
    expect(sql.values).toEqual(["tenant_a"]);
    expect((await runInTenant("tenant_a", "spec", () => tenantFilter())).sql).toBe(`"tenantId" = ?`);
  });

  it("rejects an alias that isn't an identifier", () => {
    expect(() => tenantFilter(`c"; DROP TABLE users; --`)).toThrow("bad alias");
  });

  it("falls back to Nexa and logs without an academy (audit), refuses under enforce", () => {
    expect(sqlTenantId()).toBe("tenant_nexa");
    expect([...tenantAuditCountsForTesting().keys()]).toEqual(["missing_context|background|background|raw-sql"]);
    setTenantScopeModeForTesting("enforce");
    expect(() => sqlTenantId()).toThrow(TenantScopeViolation);
    // Inside an HTTP request that named no academy it's the caller's: a 400.
    expect(() =>
      runWithTenantContext({ host: null, label: "POST /auth/login", source: null, tenantId: null }, () => sqlTenantId())
    ).toThrow(AcademyNotResolved);
  });
});
