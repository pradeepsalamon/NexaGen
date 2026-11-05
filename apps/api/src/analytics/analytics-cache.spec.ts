import { runInTenant } from "../tenancy/tenant-context";
import { AnalyticsCache } from "./analytics-cache";

jest.mock("@nexa-chess/config/api", () => ({
  getApiEnv: () => ({ ANALYTICS_CACHE_TTL_SECONDS: 60, TENANT_SCOPE_MODE: "audit" })
}));

describe("AnalyticsCache", () => {
  it("serves a hit only to the academy that filled it", async () => {
    const cache = new AnalyticsCache();
    const produce = jest.fn(async () => "value");

    const first = await runInTenant("tenant_a", "spec", () => cache.wrap("overview:x", false, produce));
    const again = await runInTenant("tenant_a", "spec", () => cache.wrap("overview:x", false, produce));
    const other = await runInTenant("tenant_b", "spec", () => cache.wrap("overview:x", false, produce));

    expect([first.cached, again.cached, other.cached]).toEqual([false, true, false]);
    expect(produce).toHaveBeenCalledTimes(2);
  });

  it("re-runs the producer when asked for fresh data", async () => {
    const cache = new AnalyticsCache();
    const produce = jest.fn(async () => 1);
    await runInTenant("tenant_a", "spec", () => cache.wrap("k", false, produce));
    const fresh = await runInTenant("tenant_a", "spec", () => cache.wrap("k", true, produce));
    expect(fresh.cached).toBe(false);
    expect(produce).toHaveBeenCalledTimes(2);
  });
});
