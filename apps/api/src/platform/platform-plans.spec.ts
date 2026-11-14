import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_PLATFORM_PLANS,
  PLAN_FEATURE_KEYS,
  cheapestPlanWithFeature,
  isWithinLimit,
  resolveEntitlements,
  resolveTenantAccessMode,
  type TenantAccessInput
} from "@nexa-chess/types";

const NOW = new Date("2026-10-19T12:00:00Z");
const PAST = "2026-10-18T12:00:00.000Z";
const FUTURE = "2026-10-20T12:00:00.000Z";

const sub = (status: NonNullable<TenantAccessInput["subscription"]>["status"], dates: Partial<NonNullable<TenantAccessInput["subscription"]>> = {}) => ({
  subscription: { currentPeriodEnd: null, graceEndsAt: null, status, trialEndsAt: null, ...dates },
  tenantStatus: "ACTIVE" as const
});

describe("resolveTenantAccessMode", () => {
  it.each([
    ["ACTIVE", {}, "FULL"],
    ["PAST_DUE", {}, "FULL"],
    ["TRIALING", { trialEndsAt: FUTURE }, "FULL"],
    ["TRIALING", { trialEndsAt: PAST }, "LOCKED"],
    ["CANCEL_SCHEDULED", { currentPeriodEnd: FUTURE }, "FULL"],
    ["CANCEL_SCHEDULED", { currentPeriodEnd: PAST }, "LOCKED"],
    ["GRACE", { graceEndsAt: FUTURE }, "READ_ONLY"],
    ["GRACE", { graceEndsAt: PAST }, "LOCKED"],
    ["EXPIRED", {}, "LOCKED"],
    ["CANCELLED", {}, "LOCKED"]
  ] as const)("%s %j → %s", (status, dates, mode) => {
    expect(resolveTenantAccessMode(sub(status, dates), NOW)).toBe(mode);
  });

  it("locks a suspended tenant and a tenant without a subscription", () => {
    expect(resolveTenantAccessMode({ ...sub("ACTIVE"), tenantStatus: "SUSPENDED" }, NOW)).toBe("LOCKED");
    expect(resolveTenantAccessMode({ subscription: null, tenantStatus: "ACTIVE" }, NOW)).toBe("LOCKED");
  });
});

describe("resolveEntitlements", () => {
  const plan = { features: ["courses", "directChat", "notAFeature"], limits: { maxStudents: 50, maxCoaches: null } };

  it("drops unknown feature keys and fails a missing limit closed (0)", () => {
    const resolved = resolveEntitlements(plan);
    expect(resolved.features).toEqual(["courses", "directChat"]);
    expect(resolved.limits).toEqual({ maxBatches: 0, maxCoaches: null, maxConcurrentLiveClasses: 0, maxStudents: 50 });
  });

  it("applies overrides; remove wins over add", () => {
    const resolved = resolveEntitlements(plan, {
      addFeatures: ["coachPayroll", "courses"],
      limits: { maxStudents: 75 },
      removeFeatures: ["courses"]
    });
    expect(resolved.features).toEqual(["coachPayroll", "directChat"]);
    expect(resolved.limits.maxStudents).toBe(75);
  });

  it("ignores malformed overrides instead of granting anything", () => {
    expect(resolveEntitlements(plan, { addFeatures: "everything" }).features).toEqual(["courses", "directChat"]);
  });

  it("sanitizes override fields independently so invalid addFeatures does not discard valid removals or limits", () => {
    const resolved = resolveEntitlements(plan, {
      addFeatures: ["notARealFeature"],
      limits: { maxStudents: 40 },
      removeFeatures: ["courses"]
    });
    expect(resolved.features).toEqual(["directChat"]);
    expect(resolved.limits.maxStudents).toBe(40);
  });
});

describe("limits and upgrade path", () => {
  it("isWithinLimit treats null as unlimited", () => {
    expect(isWithinLimit(null, 10_000)).toBe(true);
    expect(isWithinLimit(2, 1)).toBe(true);
    expect(isWithinLimit(2, 2)).toBe(false);
  });

  it("names the cheapest plan with a feature", () => {
    expect(cheapestPlanWithFeature(DEFAULT_PLATFORM_PLANS, "courses")?.code).toBe("GROWTH");
    expect(cheapestPlanWithFeature(DEFAULT_PLATFORM_PLANS, "coachPayroll")?.code).toBe("BUSINESS");
  });

  it("each tier includes everything the cheaper tiers do", () => {
    const sorted = [...DEFAULT_PLATFORM_PLANS].sort((a, b) => a.sortOrder - b.sortOrder);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].features).toEqual(expect.arrayContaining(sorted[i - 1].features));
    }
    expect([...sorted[sorted.length - 1].features].sort()).toEqual([...PLAN_FEATURE_KEYS].sort());
  });
});

describe("the catalogue is enforced", () => {
  const SRC = path.resolve(__dirname, "..");
  const sources = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return entry.name.endsWith(".controller.ts") ? [fs.readFileSync(full, "utf8")] : [];
    });
  const all = sources(SRC).join("\n");

  // A catalogued feature no route checks would be sold without being enforced.
  it.each(PLAN_FEATURE_KEYS)("%s is required by at least one route", (feature) => {
    expect(all).toContain(`@RequireFeature("${feature}"`);
  });

  // The migration seeds production; DEFAULT_PLATFORM_PLANS seeds dev and the integration suite.
  it("the seed migration matches DEFAULT_PLATFORM_PLANS", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../prisma/migrations/20261020120000_saas_subscription_plans/migration.sql"),
      "utf8"
    );
    for (const plan of DEFAULT_PLATFORM_PLANS) {
      const row = new RegExp(`\\('${plan.id}', '${plan.code}'[\\s\\S]*?ARRAY\\[([^\\]]*)\\],\\s*'([^']*)'`).exec(sql);
      expect(row).not.toBeNull();
      const features = row![1].split(",").map((f) => f.trim().replace(/'/g, ""));
      expect({ code: plan.code, features: [...features].sort() }).toEqual({ code: plan.code, features: [...plan.features].sort() });
      expect(JSON.parse(row![2])).toEqual(plan.limits);
    }
  });
});
