// The shared payment contract (packages/types/src/payments.ts) lives in a
// package with no test runner of its own, so its pure logic — the status
// machine and the router — is exercised here, where `npm test` reaches it.
// Both are the SAME functions the web app uses, so a regression caught here is
// a regression caught for the admin routing preview too.

import {
  canTransitionPaymentStatus,
  DEFAULT_PAYMENT_ROUTING,
  isMethodEnabled,
  methodNote,
  PAYMENT_METHOD_HINTS,
  isInFlightPaymentStatus,
  isSettledPaymentStatus,
  isTerminalPaymentStatus,
  orderStatusForPayment,
  PAYMENT_STATUSES,
  paymentRoutingConfigSchema,
  resolvePaymentProvider,
  type PaymentRoutingConfig
} from "@nexa-chess/types";

describe("payment status machine", () => {
  it("never lets a stale event un-pay a captured payment", () => {
    // The out-of-order webhook case: a queued "pending" redelivered after the
    // capture must be ignored, not applied.
    expect(canTransitionPaymentStatus("PAID", "PENDING")).toBe(false);
    expect(canTransitionPaymentStatus("PAID", "PROCESSING")).toBe(false);
    expect(canTransitionPaymentStatus("PAID", "AUTHORIZED")).toBe(false);
  });

  it("never lets a late failure revoke a captured payment", () => {
    // A failed *attempt* arriving after a successful one on the same order.
    expect(canTransitionPaymentStatus("PAID", "FAILED")).toBe(false);
    expect(canTransitionPaymentStatus("PAID", "CANCELLED")).toBe(false);
    expect(canTransitionPaymentStatus("PAID", "EXPIRED")).toBe(false);
    expect(canTransitionPaymentStatus("AUTHORIZED", "FAILED")).toBe(false);
  });

  it("allows genuine forward progress", () => {
    expect(canTransitionPaymentStatus("CREATED", "PENDING")).toBe(true);
    expect(canTransitionPaymentStatus("PENDING", "PROCESSING")).toBe(true);
    expect(canTransitionPaymentStatus("PROCESSING", "PAID")).toBe(true);
    expect(canTransitionPaymentStatus("PENDING", "FAILED")).toBe(true);
    expect(canTransitionPaymentStatus("PAID", "REFUNDED")).toBe(true);
    expect(canTransitionPaymentStatus("PAID", "PARTIALLY_REFUNDED")).toBe(true);
  });

  it("treats a repeated identical event as a no-op", () => {
    for (const status of PAYMENT_STATUSES) {
      expect(canTransitionPaymentStatus(status, status)).toBe(false);
    }
  });

  it("makes a fully refunded payment final", () => {
    for (const status of PAYMENT_STATUSES) {
      expect(canTransitionPaymentStatus("REFUNDED", status)).toBe(false);
    }
  });

  it("classifies statuses consistently", () => {
    expect(isInFlightPaymentStatus("PENDING")).toBe(true);
    expect(isInFlightPaymentStatus("PAID")).toBe(false);
    expect(isInFlightPaymentStatus("FAILED")).toBe(false);

    expect(isSettledPaymentStatus("PAID")).toBe(true);
    expect(isSettledPaymentStatus("PARTIALLY_REFUNDED")).toBe(true);
    expect(isSettledPaymentStatus("FAILED")).toBe(false);

    expect(isTerminalPaymentStatus("REFUNDED")).toBe(true);
    expect(isTerminalPaymentStatus("PAID")).toBe(false);
  });

  it("derives an order status that never claims more than the payment", () => {
    expect(orderStatusForPayment("PAID")).toBe("PAID");
    // A refund in flight has not left the account yet: the order is still paid.
    expect(orderStatusForPayment("REFUND_PENDING")).toBe("PAID");
    expect(orderStatusForPayment("REFUNDED")).toBe("REFUNDED");
    expect(orderStatusForPayment("AUTHORIZED")).toBe("PENDING");
    expect(orderStatusForPayment("FAILED")).toBe("FAILED");
  });
});

describe("payment routing", () => {
  const all = ["RAZORPAY", "CASHFREE", "STRIPE"] as const;

  it("sends Indian UPI to Razorpay", () => {
    const decision = resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
      currency: "INR",
      method: "UPI"
    });
    expect(decision?.provider).toBe("RAZORPAY");
    expect(decision?.ruleId).toBe("india-upi");
  });

  it("sends anything non-INR to Stripe", () => {
    expect(
      resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
        currency: "USD",
        method: "CARD"
      })?.provider
    ).toBe("STRIPE");
    expect(
      resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, { currency: "EUR" })
        ?.provider
    ).toBe("STRIPE");
  });

  it("falls through to Cashfree when Razorpay is unavailable", () => {
    const decision = resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
      currency: "INR",
      method: "UPI",
      unavailable: ["RAZORPAY"]
    });
    expect(decision?.provider).toBe("CASHFREE");
  });

  it("hides fallbacks unless failover is explicitly enabled", () => {
    // §17: automatic re-routing is off by default, because a retry against a
    // second gateway while the first may have debited the customer is how
    // people get charged twice.
    const off = resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
      currency: "INR",
      method: "UPI"
    });
    expect(off?.fallbacks).toEqual([]);

    const on = resolvePaymentProvider(
      { ...DEFAULT_PAYMENT_ROUTING, failoverEnabled: true },
      { currency: "INR", method: "UPI" }
    );
    expect(on?.fallbacks).toEqual(["CASHFREE"]);
  });

  it("never offers a provider already tried on this order", () => {
    const decision = resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
      currency: "INR",
      method: "UPI",
      exclude: ["RAZORPAY", "CASHFREE"]
    });
    expect(decision).toBeNull();
  });

  it("returns null rather than guessing when nothing is usable", () => {
    expect(
      resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
        currency: "USD",
        unavailable: [...all]
      })
    ).toBeNull();
  });

  it("skips disabled rules and falls through to the next match", () => {
    const config: PaymentRoutingConfig = {
      ...DEFAULT_PAYMENT_ROUTING,
      rules: DEFAULT_PAYMENT_ROUTING.rules.map((rule) =>
        rule.id === "india-upi" ? { ...rule, enabled: false } : rule
      )
    };

    const decision = resolvePaymentProvider(config, {
      currency: "INR",
      method: "UPI"
    });
    // "india-any" is the next rule that matches an INR UPI payment.
    expect(decision?.ruleId).toBe("india-any");
  });

  it("uses defaultProviders when no rule matches at all", () => {
    const decision = resolvePaymentProvider(
      {
        rules: [],
        methodSettings: {},
        defaultProviders: ["STRIPE"],
        failoverEnabled: false
      },
      { currency: "INR", method: "UPI" }
    );
    expect(decision?.provider).toBe("STRIPE");
    expect(decision?.ruleId).toBeNull();
  });

  it("matches currency case-insensitively", () => {
    expect(
      resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
        currency: "inr",
        method: "UPI"
      })?.provider
    ).toBe("RAZORPAY");
  });

  it("accepts its own defaults as valid config", () => {
    expect(() =>
      paymentRoutingConfigSchema.parse(DEFAULT_PAYMENT_ROUTING)
    ).not.toThrow();
  });

  it("rejects a rule with no provider", () => {
    expect(() =>
      paymentRoutingConfigSchema.parse({
        rules: [{ id: "x", label: "x", providers: [] }],
        defaultProviders: ["STRIPE"]
      })
    ).toThrow();
  });
});

describe("per-method settings", () => {
  it("treats a method absent from the map as enabled", () => {
    // Adding a method to PAYMENT_METHOD_KINDS must never silently disable it
    // on an install whose stored config predates it.
    expect(isMethodEnabled(DEFAULT_PAYMENT_ROUTING, "UPI")).toBe(true);
    expect(isMethodEnabled(DEFAULT_PAYMENT_ROUTING, "APPLE_PAY")).toBe(true);
  });

  it("honours an explicit switch-off", () => {
    const config = {
      ...DEFAULT_PAYMENT_ROUTING,
      methodSettings: { EMI: { enabled: false } }
    };
    expect(isMethodEnabled(config, "EMI")).toBe(false);
    expect(isMethodEnabled(config, "UPI")).toBe(true);
  });

  it("removes a disabled method from routing entirely", () => {
    const config = {
      ...DEFAULT_PAYMENT_ROUTING,
      methodSettings: { UPI: { enabled: false } }
    };

    // One switch has to take it out everywhere, not just the picker.
    expect(
      resolvePaymentProvider(config, { currency: "INR", method: "UPI" })
    ).toBeNull();
    // Other methods are untouched.
    expect(
      resolvePaymentProvider(config, { currency: "INR", method: "CARD" })
        ?.provider
    ).toBe("RAZORPAY");
  });

  it("falls back to the built-in hint when no note is set", () => {
    expect(methodNote(DEFAULT_PAYMENT_ROUTING, "UPI")).toBe(
      PAYMENT_METHOD_HINTS.UPI
    );
  });

  it("prefers the admin's own wording", () => {
    const config = {
      ...DEFAULT_PAYMENT_ROUTING,
      methodSettings: { UPI: { enabled: true, note: "GPay, PhonePe, Paytm" } }
    };
    expect(methodNote(config, "UPI")).toBe("GPay, PhonePe, Paytm");
  });

  it("ignores a blank note rather than showing an empty line", () => {
    const config = {
      ...DEFAULT_PAYMENT_ROUTING,
      methodSettings: { UPI: { enabled: true, note: "   " } }
    };
    expect(methodNote(config, "UPI")).toBe(PAYMENT_METHOD_HINTS.UPI);
  });
});

describe("recurring routing", () => {
  it("only picks a gateway that can hold a mandate", () => {
    const decision = resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
      currency: "INR",
      method: "UPI",
      // Cashfree can, Razorpay cannot, in this hypothetical.
      recurringCapable: ["CASHFREE", "STRIPE"]
    });
    expect(decision?.provider).toBe("CASHFREE");
  });

  it("returns null rather than routing a subscription to a one-off gateway", () => {
    const decision = resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
      currency: "INR",
      method: "UPI",
      recurringCapable: ["STRIPE"]
    });
    // The India rules only name Razorpay and Cashfree, so nothing matches.
    expect(decision).toBeNull();
  });

  it("leaves one-off payments unaffected", () => {
    expect(
      resolvePaymentProvider(DEFAULT_PAYMENT_ROUTING, {
        currency: "INR",
        method: "UPI"
      })?.provider
    ).toBe("RAZORPAY");
  });
});
