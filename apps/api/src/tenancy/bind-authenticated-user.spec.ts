import { bindAuthenticatedUser } from "./bind-authenticated-user";
import { resetTenantAuditForTesting, tenantAuditCountsForTesting } from "./tenant-audit";
import { getTenantContext, runWithTenantContext, type TenantContextStore } from "./tenant-context";

const store = (tenantId: string | null): TenantContextStore => ({
  host: tenantId ? "nexachess.in" : null,
  label: "GET /me",
  source: tenantId ? "host" : null,
  tenantId
});
const user = { id: "u1", role: "COACH", tenantId: "tenant_nexa" };

describe("bindAuthenticatedUser", () => {
  beforeEach(() => resetTenantAuditForTesting());

  it("fills an empty context from the user's academy and records the user", () => {
    runWithTenantContext(store(null), () => {
      bindAuthenticatedUser(user, { tenantId: "tenant_nexa" });
      expect(getTenantContext()).toMatchObject({ role: "COACH", source: "user", tenantId: "tenant_nexa", userId: "u1" });
    });
    expect(tenantAuditCountsForTesting().size).toBe(0);
  });

  it("keeps the host's academy and logs a user from another one (audit mode)", () => {
    runWithTenantContext(store("tenant_acme"), () => {
      bindAuthenticatedUser(user, null);
      expect(getTenantContext()).toMatchObject({ source: "host", tenantId: "tenant_acme" });
    });
    expect([...tenantAuditCountsForTesting().keys()]).toEqual(["user_mismatch|GET /me|tenant_acme|tenant_nexa"]);
  });

  it("logs a session issued for another academy", () => {
    runWithTenantContext(store("tenant_nexa"), () => bindAuthenticatedUser(user, { tenantId: "tenant_acme" }));
    expect([...tenantAuditCountsForTesting().keys()]).toEqual(["session_mismatch|tenant_acme|tenant_nexa"]);
  });

  it("reads a null tenantId (pre-D4 row) as Nexa", () => {
    runWithTenantContext(store("tenant_nexa"), () =>
      bindAuthenticatedUser({ ...user, tenantId: null }, { tenantId: null })
    );
    expect(tenantAuditCountsForTesting().size).toBe(0);
  });
});
