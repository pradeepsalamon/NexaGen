import { Test, type TestingModule } from "@nestjs/testing";
import { PaymentProviderEventKind } from "@prisma/client";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderHealthService } from "./provider-health.service";

/**
 * Provider health (§17).
 *
 * The judgement that matters here is when NOT to act: a brand-new deploy, or a
 * gateway with a handful of unlucky declines, must stay in rotation. Taking a
 * working gateway offline on thin evidence costs real revenue.
 */
describe("ProviderHealthService", () => {
  const allConfigured = { RAZORPAY: true, CASHFREE: true, STRIPE: true } as const;

  const event = (
    provider: "RAZORPAY" | "CASHFREE" | "STRIPE",
    success: boolean,
    durationMs = 200
  ) => ({
    provider,
    kind: PaymentProviderEventKind.API_CALL,
    success,
    durationMs,
    createdAt: new Date("2026-09-14T10:00:00Z")
  });

  const build = async (events: unknown[]) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderHealthService,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            paymentProviderEvent: {
              findMany: jest.fn().mockResolvedValue(events),
              create: jest.fn().mockResolvedValue({}),
              deleteMany: jest.fn().mockResolvedValue({ count: 0 })
            }
          }
        }
      ]
    }).compile();

    return module.get(ProviderHealthService);
  };

  it("keeps every gateway in rotation when there is no history", async () => {
    const service = await build([]);
    const health = await service.getHealth(allConfigured);

    for (const provider of health.providers) {
      expect(provider.available).toBe(true);
      expect(provider.successRate).toBeNull();
    }
  });

  it("reports a gateway as unavailable when it is not configured", async () => {
    const service = await build([]);
    const health = await service.getHealth({
      ...allConfigured,
      STRIPE: false
    });

    const stripe = health.providers.find((p) => p.provider === "STRIPE");
    expect(stripe?.available).toBe(false);
    expect(stripe?.degradedReason).toContain("not configured");
  });

  it("does not condemn a gateway on too few samples", async () => {
    // Three failures in a row is bad luck, not an outage.
    const service = await build([
      event("RAZORPAY", false),
      event("RAZORPAY", false),
      event("RAZORPAY", false)
    ]);

    const health = await service.getHealth(allConfigured);
    const razorpay = health.providers.find((p) => p.provider === "RAZORPAY");

    expect(razorpay?.available).toBe(true);
    expect(razorpay?.successRate).toBe(0);
  });

  it("takes a gateway out of rotation once the evidence is strong enough", async () => {
    // 12 calls, 1 success: past the sample threshold and well under the rate.
    const service = await build([
      event("RAZORPAY", true),
      ...Array.from({ length: 11 }, () => event("RAZORPAY", false))
    ]);

    const health = await service.getHealth(allConfigured);
    const razorpay = health.providers.find((p) => p.provider === "RAZORPAY");

    expect(razorpay?.available).toBe(false);
    expect(razorpay?.degradedReason).toContain("Success rate");
    expect(await service.unavailableProviders(allConfigured)).toContain("RAZORPAY");
  });

  it("keeps a mostly-healthy gateway in rotation", async () => {
    const service = await build([
      ...Array.from({ length: 18 }, () => event("CASHFREE", true)),
      ...Array.from({ length: 2 }, () => event("CASHFREE", false))
    ]);

    const health = await service.getHealth(allConfigured);
    const cashfree = health.providers.find((p) => p.provider === "CASHFREE");

    expect(cashfree?.available).toBe(true);
    expect(cashfree?.successRate).toBe(90);
    expect(cashfree?.failureRate).toBe(10);
  });

  it("averages response time over API calls only", async () => {
    const service = await build([
      event("STRIPE", true, 100),
      event("STRIPE", true, 300),
      {
        provider: "STRIPE",
        kind: PaymentProviderEventKind.WEBHOOK,
        success: false,
        durationMs: 9999,
        createdAt: new Date()
      }
    ]);

    const health = await service.getHealth(allConfigured);
    const stripe = health.providers.find((p) => p.provider === "STRIPE");

    // The webhook's 9999ms must not pollute the outbound-call average.
    expect(stripe?.avgResponseMs).toBe(200);
    expect(stripe?.webhookFailures).toBe(1);
    expect(stripe?.attempts).toBe(2);
  });
});
