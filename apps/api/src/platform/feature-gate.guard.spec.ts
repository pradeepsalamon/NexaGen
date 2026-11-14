import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { EntitlementService, TenantEntitlementState } from "./entitlement.service";
import { FeatureGateGuard } from "./feature-gate.guard";
import { PlanRestrictionException } from "./plan-restriction.exception";
import { RequireFeature } from "./require-feature.decorator";

@RequireFeature("coachPayroll")
class PayrollController {
  list() {}
  @RequireFeature(null)
  open() {}
}

@RequireFeature("interactiveClassroom", { allowReads: true })
class SimulController {
  handle() {}
}

class CoreController {
  handle() {}
}

const state = (overrides: Partial<TenantEntitlementState> = {}): TenantEntitlementState => ({
  accessMode: "FULL",
  features: [],
  limits: { maxBatches: null, maxCoaches: null, maxConcurrentLiveClasses: null, maxStudents: null },
  subscription: null,
  tenant: { id: "tenant_nexa", name: "Nexa" },
  ...overrides
});

function context(controller: new () => object, handler: string, method = "GET", path = "/x"): ExecutionContext {
  return {
    getClass: () => controller,
    getHandler: () => (controller.prototype as Record<string, () => void>)[handler],
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => ({ method, path }) })
  } as unknown as ExecutionContext;
}

describe("FeatureGateGuard", () => {
  const run = (s: TenantEntitlementState, ctx: ExecutionContext) => {
    const entitlements = { getState: jest.fn().mockResolvedValue(s) } as unknown as EntitlementService;
    return new FeatureGateGuard(entitlements, new Reflector()).canActivate(ctx);
  };

  it("refuses a route whose feature the plan lacks with a 402", async () => {
    const error = await run(state(), context(PayrollController, "list")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanRestrictionException);
    expect((error as PlanRestrictionException).getStatus()).toBe(402);
    expect((error as PlanRestrictionException).getResponse()).toMatchObject({
      code: "PLAN_FEATURE_REQUIRED",
      feature: "coachPayroll"
    });
  });

  it("lets it through when the plan includes the feature", async () => {
    await expect(run(state({ features: ["coachPayroll"] }), context(PayrollController, "list"))).resolves.toBe(true);
  });

  it("a handler-level null exempts it from its controller's feature", async () => {
    await expect(run(state(), context(PayrollController, "open"))).resolves.toBe(true);
  });

  it("allowReads keeps GET open and gates changes", async () => {
    await expect(run(state(), context(SimulController, "handle", "GET"))).resolves.toBe(true);
    await expect(run(state(), context(SimulController, "handle", "POST"))).rejects.toBeInstanceOf(PlanRestrictionException);
  });

  it("READ_ONLY blocks writes everywhere but allows reads", async () => {
    await expect(run(state({ accessMode: "READ_ONLY" }), context(CoreController, "handle", "GET"))).resolves.toBe(true);
    await expect(run(state({ accessMode: "READ_ONLY" }), context(CoreController, "handle", "POST"))).rejects.toMatchObject({
      response: { code: "SUBSCRIPTION_READ_ONLY" }
    });
  });

  it("LOCKED blocks every route except the always-open ones", async () => {
    await expect(run(state({ accessMode: "LOCKED" }), context(CoreController, "handle"))).rejects.toMatchObject({
      response: { code: "SUBSCRIPTION_LOCKED" }
    });
    for (const path of ["/auth/login", "/subscription", "/admin/subscription", "/platform/plans", "/payments/webhooks/stripe", "/health"]) {
      await expect(run(state({ accessMode: "LOCKED" }), context(CoreController, "handle", "POST", path))).resolves.toBe(true);
    }
  });
});
