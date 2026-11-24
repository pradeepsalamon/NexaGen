import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { EntitlementService, TenantEntitlementState } from "./entitlement.service";
import { FeatureGateGuard } from "./feature-gate.guard";
import { PlanRestrictionException } from "./plan-restriction.exception";
import { RequireFeature } from "./require-feature.decorator";
import { verifyAccessToken } from "../auth/authenticate";
import type { PrismaService } from "../prisma/prisma.service";
import { getTenantContext, runWithTenantContext } from "../tenancy/tenant-context";

jest.mock("../auth/authenticate", () => ({ verifyAccessToken: jest.fn() }));

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
  lapse: { graceAllows: ["chat", "fees", "homework", "liveClasses"], graceDays: 14, pastDueDays: 7 },
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
    return new FeatureGateGuard(entitlements, new Reflector(), {} as PrismaService).canActivate(ctx);
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

  it("grace keeps the lapse policy's writes open, and nothing else", async () => {
    const grace = (allows: TenantEntitlementState["lapse"]["graceAllows"]) =>
      state({ accessMode: "READ_ONLY", lapse: { graceAllows: allows, graceDays: 14, pastDueDays: 7 } });
    const post = (path: string) => context(CoreController, "handle", "POST", path);
    await expect(run(grace(["liveClasses"]), post("/live-class/c1/join"))).resolves.toBe(true);
    await expect(run(grace(["chat"]), post("/chat/conversations/x/messages"))).resolves.toBe(true);
    // Admin growth is never in an allowance.
    await expect(run(grace(["chat", "fees", "homework", "liveClasses"]), post("/batches"))).rejects.toMatchObject({
      response: { code: "SUBSCRIPTION_READ_ONLY" }
    });
    // A switched-off allowance closes its routes.
    await expect(run(grace([]), post("/live-class/c1/join"))).rejects.toMatchObject({
      response: { code: "SUBSCRIPTION_READ_ONLY" }
    });
  });

  it("LOCKED blocks every route except the always-open ones", async () => {
    await expect(run(state({ accessMode: "LOCKED" }), context(CoreController, "handle"))).rejects.toMatchObject({
      response: { code: "SUBSCRIPTION_LOCKED" }
    });
    for (const path of ["/admin/academy/closure", "/admin/academy/export", "/auth/login", "/subscription", "/admin/subscription", "/platform/plans", "/payments/webhooks/stripe", "/health"]) {
      await expect(run(state({ accessMode: "LOCKED" }), context(CoreController, "handle", "POST", path))).resolves.toBe(true);
    }
  });

  // Review T1: with no academy from the host, a signed-in caller's plan is
  // their own academy's, never the DEFAULT academy's Enterprise plan.
  describe("a request whose host names no academy", () => {
    const verify = verifyAccessToken as jest.Mock;
    let findUnique: jest.Mock;
    let entitlements: EntitlementService;

    const cookieContext = (cookies: Record<string, string>) =>
      ({
        getClass: () => CoreController,
        getHandler: () => CoreController.prototype.handle,
        getType: () => "http",
        switchToHttp: () => ({ getRequest: () => ({ cookies, method: "POST", path: "/batches" }) })
      }) as unknown as ExecutionContext;

    const inRequest = <T>(tenantId: string | null, fn: () => Promise<T>) =>
      runWithTenantContext({ host: null, label: "POST /batches", source: tenantId ? "host" : null, tenantId }, fn);

    beforeEach(() => {
      verify.mockReset();
      findUnique = jest.fn().mockResolvedValue({ tenantId: "tenant_rook" });
      entitlements = {
        getState: jest.fn(async () => state({ tenant: { id: getTenantContext()?.tenantId ?? "?", name: "x" } }))
      } as unknown as EntitlementService;
    });

    const guard = () =>
      new FeatureGateGuard(entitlements, new Reflector(), { user: { findUnique } } as unknown as PrismaService);

    it("takes the academy from the token's user before reading the plan", async () => {
      verify.mockResolvedValue({ sub: "user_1", type: "access" });
      const seen = await inRequest(null, async () => {
        await guard().canActivate(cookieContext({ nexa_access_token: "t" }));
        return getTenantContext()?.tenantId;
      });
      expect(seen).toBe("tenant_rook");
      expect(findUnique).toHaveBeenCalledWith({ select: { tenantId: true }, where: { id: "user_1" } });
    });

    it("keeps an academy the host already named", async () => {
      const seen = await inRequest("tenant_nexa", async () => {
        await guard().canActivate(cookieContext({ nexa_access_token: "t" }));
        return getTenantContext()?.tenantId;
      });
      expect(seen).toBe("tenant_nexa");
      expect(verify).not.toHaveBeenCalled();
    });

    it("leaves a bad token to the handler's own 401", async () => {
      verify.mockRejectedValue(new Error("bad"));
      const seen = await inRequest(null, async () => {
        await guard().canActivate(cookieContext({ nexa_access_token: "t" }));
        return getTenantContext()?.tenantId;
      });
      expect(seen).toBeNull();
      expect(findUnique).not.toHaveBeenCalled();
    });
  });
});
