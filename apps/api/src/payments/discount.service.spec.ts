import { Test, type TestingModule } from "@nestjs/testing";
import { computeDiscount, describeDiscount } from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { DiscountService } from "./discount.service";

/**
 * Discounts.
 *
 * Two properties matter most here: a code can never make an order negative or
 * cost us money, and a code can never be used more times than the admin
 * allowed. Everything else is scope-matching.
 */

describe("computeDiscount", () => {
  it("takes a percentage off", () => {
    expect(computeDiscount(99900, { type: "PERCENTAGE", value: 25, maxDiscountAmount: null }))
      .toBe(24975);
  });

  it("takes a fixed amount off", () => {
    expect(computeDiscount(99900, { type: "FIXED", value: 50000, maxDiscountAmount: null }))
      .toBe(50000);
  });

  it("honours a cap on a percentage code", () => {
    // "25% off, up to ₹500" on a ₹9,999 order gives ₹500, not ₹2,499.75.
    expect(
      computeDiscount(999900, {
        type: "PERCENTAGE",
        value: 25,
        maxDiscountAmount: 50000
      })
    ).toBe(50000);
  });

  it("never discounts more than the order is worth", () => {
    // A ₹5,000-off code on a ₹999 order makes it free, never negative.
    expect(
      computeDiscount(99900, { type: "FIXED", value: 500000, maxDiscountAmount: null })
    ).toBe(99900);
    expect(
      computeDiscount(99900, { type: "PERCENTAGE", value: 100, maxDiscountAmount: null })
    ).toBe(99900);
  });

  it("never returns a negative discount", () => {
    expect(computeDiscount(0, { type: "FIXED", value: 5000, maxDiscountAmount: null }))
      .toBe(0);
  });

  it("rounds a percentage to whole minor units", () => {
    // 33% of 101 paise is 33.33 — must land on a whole paisa.
    const amount = computeDiscount(101, {
      type: "PERCENTAGE",
      value: 33,
      maxDiscountAmount: null
    });
    expect(Number.isInteger(amount)).toBe(true);
    expect(amount).toBe(33);
  });
});

describe("describeDiscount", () => {
  it("summarises a percentage code, with its cap", () => {
    expect(
      describeDiscount({
        type: "PERCENTAGE",
        value: 25,
        currency: null,
        maxDiscountAmount: 50000
      })
    ).toBe("25% off, up to ₹500.00");
  });

  it("summarises a fixed code", () => {
    expect(
      describeDiscount({
        type: "FIXED",
        value: 50000,
        currency: "INR",
        maxDiscountAmount: null
      })
    ).toBe("₹500.00 off");
  });
});

describe("DiscountService.resolve", () => {
  const plan = {
    id: "plan_1",
    batchId: "batch_1",
    amount: 99900,
    currency: "INR"
  };

  const baseDiscount = {
    id: "disc_1",
    code: "DIWALI25",
    name: "Diwali",
    type: "PERCENTAGE" as const,
    value: 25,
    currency: null,
    maxDiscountAmount: null,
    minOrderAmount: null,
    startsAt: null,
    endsAt: null,
    maxRedemptions: null,
    maxPerUser: 1,
    redemptionCount: 0,
    planIds: [] as string[],
    batchIds: [] as string[],
    methods: [] as string[],
    isActive: true
  };

  const build = async (
    discount: Record<string, unknown> | null,
    redemptionsByUser = 0
  ) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountService,
        {
          provide: PrismaService,
          useValue: {
            discount: { findUnique: jest.fn().mockResolvedValue(discount) },
            discountRedemption: {
              count: jest.fn().mockResolvedValue(redemptionsByUser)
            }
          }
        }
      ]
    }).compile();

    return module.get(DiscountService);
  };

  const resolve = (service: DiscountService, method?: string) =>
    service.resolve({
      code: "DIWALI25",
      userId: "usr_1",
      plan,
      method: method as never
    });

  it("applies a valid code", async () => {
    const service = await build(baseDiscount);
    const result = await resolve(service);

    expect(result.valid).toBe(true);
    if (result.valid) expect(result.amount).toBe(24975);
  });

  it("matches the code case-insensitively", async () => {
    const service = await build(baseDiscount);
    const result = await service.resolve({
      code: "  diwali25 ",
      userId: "usr_1",
      plan
    });
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown code", async () => {
    const service = await build(null);
    const result = await resolve(service);
    expect(result).toMatchObject({ valid: false, reason: "NOT_FOUND" });
  });

  it("rejects a deactivated code", async () => {
    const service = await build({ ...baseDiscount, isActive: false });
    expect(await resolve(service)).toMatchObject({ reason: "INACTIVE" });
  });

  it("rejects a code before it starts and after it ends", async () => {
    const future = await build({
      ...baseDiscount,
      startsAt: new Date(Date.now() + 86_400_000)
    });
    expect(await resolve(future)).toMatchObject({ reason: "NOT_STARTED" });

    const past = await build({
      ...baseDiscount,
      endsAt: new Date(Date.now() - 86_400_000)
    });
    expect(await resolve(past)).toMatchObject({ reason: "EXPIRED" });
  });

  it("rejects a code that has been fully claimed", async () => {
    const service = await build({
      ...baseDiscount,
      maxRedemptions: 100,
      redemptionCount: 100
    });
    expect(await resolve(service)).toMatchObject({
      reason: "USAGE_LIMIT_REACHED"
    });
  });

  it("rejects a second use by the same account", async () => {
    const service = await build({ ...baseDiscount, maxPerUser: 1 }, 1);
    expect(await resolve(service)).toMatchObject({ reason: "ALREADY_USED" });
  });

  it("allows a repeat use when the per-user limit permits it", async () => {
    const service = await build({ ...baseDiscount, maxPerUser: 3 }, 2);
    expect((await resolve(service)).valid).toBe(true);
  });

  it("rejects a plan outside the code's scope", async () => {
    const service = await build({ ...baseDiscount, planIds: ["plan_other"] });
    expect(await resolve(service)).toMatchObject({
      reason: "PLAN_NOT_ELIGIBLE"
    });
  });

  it("rejects a batch outside the code's scope", async () => {
    const service = await build({ ...baseDiscount, batchIds: ["batch_other"] });
    expect(await resolve(service)).toMatchObject({
      reason: "PLAN_NOT_ELIGIBLE"
    });
  });

  it("applies a method-scoped code only for that method", async () => {
    const service = await build({ ...baseDiscount, methods: ["UPI"] });

    // Before a method is chosen it cannot be priced.
    expect(await resolve(service)).toMatchObject({
      reason: "METHOD_NOT_ELIGIBLE"
    });
    expect(await resolve(service, "CARD")).toMatchObject({
      reason: "METHOD_NOT_ELIGIBLE"
    });
    expect((await resolve(service, "UPI")).valid).toBe(true);
  });

  it("rejects a fixed code in another currency", async () => {
    // "₹500 off" is not "$500 off".
    const service = await build({
      ...baseDiscount,
      type: "FIXED",
      value: 50000,
      currency: "USD"
    });
    expect(await resolve(service)).toMatchObject({
      reason: "CURRENCY_MISMATCH"
    });
  });

  it("rejects an order below the code's minimum", async () => {
    const service = await build({ ...baseDiscount, minOrderAmount: 500000 });
    expect(await resolve(service)).toMatchObject({ reason: "BELOW_MINIMUM" });
  });

  it("refuses a code that would take nothing off", async () => {
    // A code that "applies" but changes nothing is worse than no code.
    const service = await build({
      ...baseDiscount,
      type: "FIXED",
      value: 0,
      currency: "INR"
    });
    expect((await resolve(service)).valid).toBe(false);
  });
});

describe("DiscountService.redeem", () => {
  const build = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscountService,
        { provide: PrismaService, useValue: {} }
      ]
    }).compile();
    return module.get(DiscountService);
  };

  it("records the redemption and bumps the counter", async () => {
    const service = await build();
    const create = jest.fn().mockResolvedValue({});
    const update = jest.fn().mockResolvedValue({});
    const tx = {
      discountRedemption: {
        findUnique: jest.fn().mockResolvedValue(null),
        create
      },
      discount: { update }
    };

    await service.redeem(tx as never, {
      discountId: "disc_1",
      userId: "usr_1",
      orderId: "ord_1",
      amount: 24975
    });

    expect(create).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { redemptionCount: { increment: 1 } }
      })
    );
  });

  it("is idempotent on a replayed capture", async () => {
    const service = await build();
    const create = jest.fn();
    const update = jest.fn();
    const tx = {
      discountRedemption: {
        findUnique: jest.fn().mockResolvedValue({ id: "red_1" }),
        create
      },
      discount: { update }
    };

    await service.redeem(tx as never, {
      discountId: "disc_1",
      userId: "usr_1",
      orderId: "ord_1",
      amount: 24975
    });

    // A duplicate webhook must not consume a second use of the code.
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("never throws — money has already moved by the time it runs", async () => {
    const service = await build();
    const tx = {
      discountRedemption: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockRejectedValue(new Error("database is down"))
      },
      discount: { update: jest.fn() }
    };

    await expect(
      service.redeem(tx as never, {
        discountId: "disc_1",
        userId: "usr_1",
        orderId: "ord_1",
        amount: 100
      })
    ).resolves.toBeUndefined();
  });
});
