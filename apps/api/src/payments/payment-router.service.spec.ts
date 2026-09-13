import { ServiceUnavailableException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DEFAULT_PAYMENT_ROUTING } from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentRouterService } from "./payment-router.service";
import { ProviderHealthService } from "./provider-health.service";
import { ProviderRegistry } from "./providers/provider-registry.service";

/**
 * Routing (§3, §17).
 *
 * The pure decision is tested in payment-contract.spec.ts. What matters here is
 * the wiring: which providers the service declares unavailable, what it does
 * when a stored config is corrupt, and — most importantly — that it degrades
 * to a working gateway rather than refusing to take money.
 */
describe("PaymentRouterService", () => {
  const build = async (options: {
    routing?: unknown;
    unavailable?: string[];
    unconfigured?: string[];
    supported?: Record<string, string[]>;
  }) => {
    const findFirst = jest.fn().mockResolvedValue(
      options.routing === undefined
        ? { id: "set_1", routing: DEFAULT_PAYMENT_ROUTING }
        : { id: "set_1", routing: options.routing }
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRouterService,
        {
          provide: PrismaService,
          useValue: {
            paymentSetting: {
              findFirst,
              create: jest
                .fn()
                .mockResolvedValue({ id: "set_1", routing: DEFAULT_PAYMENT_ROUTING }),
              update: jest.fn()
            }
          }
        },
        {
          provide: ProviderHealthService,
          useValue: {
            unavailableProviders: jest
              .fn()
              .mockResolvedValue(options.unavailable ?? [])
          }
        },
        {
          provide: ProviderRegistry,
          useValue: {
            configuredMap: () => ({
              RAZORPAY: true,
              CASHFREE: true,
              STRIPE: true
            }),
            unconfigured: () => options.unconfigured ?? [],
            supportedMethods: (provider: string) =>
              options.supported?.[provider] ?? [
                "UPI",
                "CARD",
                "NET_BANKING",
                "WALLET",
                "EMI",
                "PAY_LATER"
              ],
            upiFlows: () => ["CHECKOUT", "INTENT", "QR"]
          }
        }
      ]
    }).compile();

    return { service: module.get(PaymentRouterService), findFirst };
  };

  it("seeds the singleton from the shared defaults on first read", async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentRouterService,
        {
          provide: PrismaService,
          useValue: {
            paymentSetting: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest
                .fn()
                .mockResolvedValue({ routing: DEFAULT_PAYMENT_ROUTING })
            }
          }
        },
        { provide: ProviderHealthService, useValue: {} },
        { provide: ProviderRegistry, useValue: {} }
      ]
    }).compile();

    const config = await module.get(PaymentRouterService).getConfig();
    expect(config.rules.length).toBeGreaterThan(0);
    expect(config.failoverEnabled).toBe(false);
  });

  it("falls back to the defaults when the stored config is unusable", async () => {
    // A hand-edited row must never take payments offline.
    const { service } = await build({ routing: { rules: "not-an-array" } });

    const config = await service.getConfig();
    expect(config).toEqual(DEFAULT_PAYMENT_ROUTING);
  });

  it("routes Indian UPI to Razorpay", async () => {
    const { service } = await build({});
    const decision = await service.route({ currency: "INR", method: "UPI" });
    expect(decision.provider).toBe("RAZORPAY");
  });

  it("skips a gateway that health has taken out of rotation", async () => {
    const { service } = await build({ unavailable: ["RAZORPAY"] });
    const decision = await service.route({ currency: "INR", method: "UPI" });
    expect(decision.provider).toBe("CASHFREE");
  });

  it("uses a degraded gateway rather than refusing the payment", async () => {
    // Health is a heuristic over a rolling window. If it would leave us with
    // nothing, a degraded gateway still beats no gateway at all.
    const { service } = await build({
      unavailable: ["RAZORPAY", "CASHFREE", "STRIPE"],
      unconfigured: []
    });

    const decision = await service.route({ currency: "INR", method: "UPI" });
    expect(decision.provider).toBe("RAZORPAY");
  });

  it("throws when every gateway is genuinely unconfigured", async () => {
    const { service } = await build({
      unavailable: ["RAZORPAY", "CASHFREE", "STRIPE"],
      unconfigured: ["RAZORPAY", "CASHFREE", "STRIPE"]
    });

    await expect(
      service.route({ currency: "INR", method: "UPI" })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("only offers methods the chosen adapter can actually serve", async () => {
    // A rule may route "India · anything" to a gateway that cannot do UPI;
    // the adapter's own answer is what decides what the picker shows.
    const { service } = await build({
      supported: {
        RAZORPAY: ["CARD"],
        CASHFREE: ["CARD"],
        STRIPE: ["CARD"]
      }
    });

    const methods = await service.availableMethods("INR");
    expect(methods.map((method) => method.kind)).toEqual(["CARD"]);
  });

  it("lists UPI first for India", async () => {
    const { service } = await build({});
    const methods = await service.availableMethods("INR");
    expect(methods[0].kind).toBe("UPI");
    expect(methods[0].upiFlows).toContain("QR");
  });

  it("attaches no UPI flows to a non-UPI method", async () => {
    const { service } = await build({});
    const methods = await service.availableMethods("INR");
    const card = methods.find((method) => method.kind === "CARD");
    expect(card?.upiFlows).toEqual([]);
  });
});
