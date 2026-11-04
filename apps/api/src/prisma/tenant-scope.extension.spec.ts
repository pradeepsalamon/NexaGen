import { resetTenantAuditForTesting, tenantAuditCountsForTesting } from "../tenancy/tenant-audit";
import { runWithTenantContext, type TenantContextStore } from "../tenancy/tenant-context";
import { applyTenantScope } from "./tenant-scope.extension";

const store = (tenantId: string | null): TenantContextStore => ({
  host: "nexachess.in",
  label: "GET /batches",
  source: tenantId ? "host" : null,
  tenantId
});

describe("tenant-scope extension (audit mode)", () => {
  beforeEach(() => resetTenantAuditForTesting());

  it("stamps creates, createMany rows and upsert creates with the context's academy", () => {
    runWithTenantContext(store("tenant_a"), () => {
      expect(applyTenantScope("Batch", "create", { data: { name: "B" } })).toEqual({
        data: { name: "B", tenantId: "tenant_a" }
      });
      expect(applyTenantScope("Notification", "createMany", { data: [{ a: 1 }, { a: 2 }] })).toEqual({
        data: [
          { a: 1, tenantId: "tenant_a" },
          { a: 2, tenantId: "tenant_a" }
        ]
      });
      expect(
        applyTenantScope("User", "upsert", { create: { email: "x" }, update: {}, where: { id: "u" } })
      ).toEqual({ create: { email: "x", tenantId: "tenant_a" }, update: {}, where: { id: "u" } });
    });
  });

  it("keeps an explicit tenantId and leaves reads unfiltered", () => {
    runWithTenantContext(store("tenant_a"), () => {
      expect(applyTenantScope("Batch", "create", { data: { tenantId: "tenant_b" } })).toEqual({
        data: { tenantId: "tenant_b" }
      });
      const read = { where: { id: "1" } };
      expect(applyTenantScope("Batch", "findMany", read)).toBe(read);
    });
    expect(tenantAuditCountsForTesting().size).toBe(0);
  });

  it("never touches platform models", () => {
    const args = { data: { slug: "x" } };
    expect(applyTenantScope("Tenant", "create", args)).toBe(args);
    expect(tenantAuditCountsForTesting().size).toBe(0);
  });

  it("logs, and doesn't change, a query with no academy in context", () => {
    const args = { where: { id: "1" } };
    runWithTenantContext(store(null), () => {
      expect(applyTenantScope("Batch", "findFirst", args)).toBe(args);
    });
    expect(applyTenantScope("Batch", "findFirst", args)).toBe(args);
    const keys = [...tenantAuditCountsForTesting().keys()];
    expect(keys.some((key) => key.startsWith("missing_context|request|GET /batches|Batch|findFirst"))).toBe(true);
    expect(keys.some((key) => key.startsWith("missing_context|background|"))).toBe(true);
  });

  it("files a provider callback under webhook, not request", () => {
    runWithTenantContext({ ...store(null), label: "POST /webhooks/livekit", origin: "webhook" }, () =>
      applyTenantScope("LiveSession", "findFirst", { where: {} })
    );
    expect([...tenantAuditCountsForTesting().keys()]).toEqual([
      "missing_context|webhook|POST /webhooks/livekit|LiveSession|findFirst"
    ]);
  });
});
