import { resetTenantAuditForTesting, tenantAuditCountsForTesting } from "../tenancy/tenant-audit";
import { asPlatform, runInTenant, runWithTenantContext, type TenantContextStore } from "../tenancy/tenant-context";
import { AcademyNotResolved, applyTenantScope, setTenantScopeModeForTesting, TenantScopeViolation } from "./tenant-scope.extension";

const store = (tenantId: string | null): TenantContextStore => ({
  host: "nexachess.in",
  label: "GET /batches",
  source: tenantId ? "host" : null,
  tenantId
});
const inA = <T>(fn: () => T) => runWithTenantContext(store("tenant_a"), fn);
const keys = () => [...tenantAuditCountsForTesting().keys()];

describe("tenant-scope extension", () => {
  beforeEach(() => {
    resetTenantAuditForTesting();
    setTenantScopeModeForTesting("audit");
  });
  afterAll(() => setTenantScopeModeForTesting(null));

  describe("with an academy in context", () => {
    it.each(["findMany", "findFirst", "findUnique", "count", "groupBy", "aggregate", "update", "updateMany", "delete", "deleteMany"])(
      "narrows %s to it",
      (operation) => {
        expect(inA(() => applyTenantScope("Batch", operation, { where: { id: "b1" } }))).toMatchObject({
          where: { id: "b1", tenantId: "tenant_a" }
        });
      }
    );

    it("adds a where to a query that had none", () => {
      expect(inA(() => applyTenantScope("Batch", "findMany", undefined))).toEqual({ where: { tenantId: "tenant_a" } });
    });

    it("stamps creates, createMany rows and upsert creates, and narrows the upsert", () => {
      expect(inA(() => applyTenantScope("Batch", "create", { data: { name: "B" } }))).toEqual({
        data: { name: "B", tenantId: "tenant_a" }
      });
      expect(inA(() => applyTenantScope("Notification", "createMany", { data: [{ a: 1 }, { a: 2 }] }))).toEqual({
        data: [
          { a: 1, tenantId: "tenant_a" },
          { a: 2, tenantId: "tenant_a" }
        ]
      });
      expect(
        inA(() => applyTenantScope("User", "upsert", { create: { email: "x" }, update: {}, where: { id: "u" } }))
      ).toEqual({ create: { email: "x", tenantId: "tenant_a" }, update: {}, where: { id: "u", tenantId: "tenant_a" } });
    });

    it("keeps a matching explicit tenantId and logs another academy's (audit)", () => {
      expect(inA(() => applyTenantScope("Batch", "findMany", { where: { tenantId: "tenant_a" } }))).toEqual({
        where: { tenantId: "tenant_a" }
      });
      inA(() => applyTenantScope("Batch", "create", { data: { tenantId: "tenant_b" } }));
      inA(() => applyTenantScope("Batch", "findMany", { where: { tenantId: "tenant_b" } }));
      expect(keys().filter((key) => key.startsWith("cross_tenant|request|GET /batches|tenant_a|Batch|tenant_b"))).toHaveLength(1);
      expect(tenantAuditCountsForTesting().get(keys()[0])).toBe(2);
    });

    it("refuses another academy's tenantId in enforce mode", () => {
      setTenantScopeModeForTesting("enforce");
      expect(() => inA(() => applyTenantScope("Batch", "findMany", { where: { tenantId: "tenant_b" } }))).toThrow(
        TenantScopeViolation
      );
      expect(() => inA(() => applyTenantScope("Batch", "create", { data: { tenantId: "tenant_b" } }))).toThrow(
        TenantScopeViolation
      );
    });
  });

  it("never touches platform models", () => {
    const args = { data: { slug: "x" } };
    expect(applyTenantScope("Tenant", "create", args)).toBe(args);
    expect(inA(() => applyTenantScope("TenantDomain", "findMany", { where: {} }))).toEqual({ where: {} });
    expect(keys()).toEqual([]);
  });

  describe("with no academy in context", () => {
    it("runs unscoped and logs it in audit mode", () => {
      const args = { where: { id: "1" } };
      runWithTenantContext(store(null), () => expect(applyTenantScope("Batch", "findFirst", args)).toBe(args));
      expect(applyTenantScope("Batch", "findFirst", args)).toBe(args);
      expect(keys()).toEqual([
        "missing_context|request|GET /batches|Batch|findFirst",
        "missing_context|background|background|Batch|findFirst"
      ]);
    });

    it("files a provider callback under webhook", () => {
      runWithTenantContext({ ...store(null), label: "POST /webhooks/livekit", origin: "webhook" }, () =>
        applyTenantScope("LiveSession", "findFirst", { where: {} })
      );
      expect(keys()).toEqual(["missing_context|webhook|POST /webhooks/livekit|LiveSession|findFirst"]);
    });

    it("refuses in enforce mode: a 500 for background work and webhooks", () => {
      setTenantScopeModeForTesting("enforce");
      expect(() => applyTenantScope("Batch", "findMany", {})).toThrow(TenantScopeViolation);
      expect(() =>
        runWithTenantContext({ ...store(null), label: "POST /webhooks/livekit", origin: "webhook" }, () =>
          applyTenantScope("LiveSession", "findFirst", { where: {} })
        )
      ).toThrow(TenantScopeViolation);
    });

    it("refuses in enforce mode: a 400 for a request that names no academy", () => {
      setTenantScopeModeForTesting("enforce");
      let thrown: unknown;
      try {
        runWithTenantContext(store(null), () => applyTenantScope("User", "findFirst", { where: { email: "a@b.c" } }));
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(AcademyNotResolved);
      expect((thrown as AcademyNotResolved).getStatus()).toBe(400);
    });
  });

  describe("asPlatform and runInTenant", () => {
    it("asPlatform leaves queries unscoped and unlogged, even inside a request", async () => {
      setTenantScopeModeForTesting("enforce");
      const args = { where: { id: "1" } };
      await inA(() => asPlatform("spec", () => expect(applyTenantScope("Batch", "findMany", args)).toBe(args)));
      expect(keys()).toEqual([]);
    });

    it("runInTenant scopes to its academy and awaits inside the context", async () => {
      const result = await runInTenant("tenant_job", "cron:spec", async () => {
        await Promise.resolve();
        return applyTenantScope("Batch", "findMany", {});
      });
      expect(result).toEqual({ where: { tenantId: "tenant_job" } });
    });

    it("runInTenant work passes enforce mode", async () => {
      setTenantScopeModeForTesting("enforce");
      await expect(runInTenant("tenant_job", "cron:spec", () => applyTenantScope("Batch", "findMany", {}))).resolves.toEqual({
        where: { tenantId: "tenant_job" }
      });
    });
  });
});
