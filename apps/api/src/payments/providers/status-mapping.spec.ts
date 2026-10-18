import { PAYMENT_STATUSES } from "@nexa-chess/types";
import {
  mapOrderStatus as mapCashfreeOrderStatus,
  mapPaymentStatus as mapCashfreePayment,
  mapRefundStatus as mapCashfreeRefund
} from "./cashfree.provider";
import {
  mapMethod as mapRazorpayMethod,
  mapPaymentStatus as mapRazorpayPayment,
  mapRefundStatus as mapRazorpayRefund,
  mapSubscriptionStatus as mapRazorpaySubscription
} from "./razorpay.provider";
import {
  mapPaymentStatus as mapStripePayment,
  mapRefundStatus as mapStripeRefund,
  mapSessionStatus as mapStripeSession,
  mapSubscriptionStatus as mapStripeSubscription
} from "./stripe.provider";

/**
 * These mappers are the boundary: past them, no provider vocabulary exists.
 *
 * The rule every case here defends is the same — an unknown or ambiguous
 * provider status must NEVER map to PAID. Guessing "paid" grants access for
 * money that may never have arrived, so the safe default is always PENDING.
 */

describe("Razorpay status mapping", () => {
  it("maps the documented payment states", () => {
    expect(mapRazorpayPayment("created")).toBe("PENDING");
    expect(mapRazorpayPayment("attempted")).toBe("PROCESSING");
    expect(mapRazorpayPayment("authorized")).toBe("AUTHORIZED");
    expect(mapRazorpayPayment("captured")).toBe("PAID");
    expect(mapRazorpayPayment("refunded")).toBe("REFUNDED");
    expect(mapRazorpayPayment("failed")).toBe("FAILED");
  });

  it("falls back to PENDING, never PAID, for anything unknown", () => {
    expect(mapRazorpayPayment("some_new_state")).toBe("PENDING");
    expect(mapRazorpayPayment(null)).toBe("PENDING");
  });

  it("never reports a refund as succeeded until it is processed", () => {
    expect(mapRazorpayRefund("processed")).toBe("SUCCEEDED");
    expect(mapRazorpayRefund("pending")).toBe("PROCESSING");
    expect(mapRazorpayRefund("failed")).toBe("FAILED");
    // An accepted-but-unconfirmed refund is PENDING, not SUCCEEDED (§14).
    expect(mapRazorpayRefund(null)).toBe("PENDING");
    expect(mapRazorpayRefund("something_else")).toBe("PENDING");
  });

  it("maps subscription states", () => {
    expect(mapRazorpaySubscription("active")).toBe("ACTIVE");
    expect(mapRazorpaySubscription("authenticated")).toBe("PENDING_ACTIVATION");
    expect(mapRazorpaySubscription("halted")).toBe("PAST_DUE");
    expect(mapRazorpaySubscription("cancelled")).toBe("CANCELLED");
    expect(mapRazorpaySubscription("completed")).toBe("EXPIRED");
    expect(mapRazorpaySubscription("unknown")).toBe("CREATED");
  });

  it("maps payment methods, and anything unrecognised to OTHER", () => {
    expect(mapRazorpayMethod("upi")).toBe("UPI");
    expect(mapRazorpayMethod("card")).toBe("CARD");
    expect(mapRazorpayMethod("netbanking")).toBe("NET_BANKING");
    expect(mapRazorpayMethod("wallet")).toBe("WALLET");
    expect(mapRazorpayMethod("emi")).toBe("EMI");
    expect(mapRazorpayMethod("paylater")).toBe("PAY_LATER");
    expect(mapRazorpayMethod("cardless_new_thing")).toBe("OTHER");
    expect(mapRazorpayMethod(null)).toBeNull();
  });
});

describe("Cashfree status mapping", () => {
  it("maps the documented payment states", () => {
    expect(mapCashfreePayment("SUCCESS")).toBe("PAID");
    expect(mapCashfreePayment("PENDING")).toBe("PROCESSING");
    expect(mapCashfreePayment("NOT_ATTEMPTED")).toBe("PENDING");
    expect(mapCashfreePayment("FAILED")).toBe("FAILED");
  });

  it("treats a dropped checkout as cancelled, not failed", () => {
    // USER_DROPPED means the customer walked away — a retry is fine and
    // nothing was charged.
    expect(mapCashfreePayment("USER_DROPPED")).toBe("CANCELLED");
  });

  it("falls back to PENDING for anything unknown", () => {
    expect(mapCashfreePayment("BRAND_NEW_STATE")).toBe("PENDING");
    expect(mapCashfreePayment(null)).toBe("PENDING");
  });

  it("maps order-level states", () => {
    expect(mapCashfreeOrderStatus("PAID")).toBe("PAID");
    expect(mapCashfreeOrderStatus("ACTIVE")).toBe("PENDING");
    expect(mapCashfreeOrderStatus("EXPIRED")).toBe("EXPIRED");
    expect(mapCashfreeOrderStatus("TERMINATED")).toBe("CANCELLED");
    expect(mapCashfreeOrderStatus(null)).toBe("PENDING");
  });

  it("keeps an on-hold refund in flight rather than settling it", () => {
    expect(mapCashfreeRefund("SUCCESS")).toBe("SUCCEEDED");
    expect(mapCashfreeRefund("ONHOLD")).toBe("PROCESSING");
    expect(mapCashfreeRefund("PENDING")).toBe("PROCESSING");
    expect(mapCashfreeRefund("FAILED")).toBe("FAILED");
    expect(mapCashfreeRefund(null)).toBe("PENDING");
  });
});

describe("Stripe status mapping", () => {
  it("maps PaymentIntent states", () => {
    expect(mapStripePayment("requires_payment_method")).toBe("PENDING");
    expect(mapStripePayment("requires_action")).toBe("PROCESSING");
    expect(mapStripePayment("processing")).toBe("PROCESSING");
    expect(mapStripePayment("requires_capture")).toBe("AUTHORIZED");
    expect(mapStripePayment("succeeded")).toBe("PAID");
    expect(mapStripePayment("canceled")).toBe("CANCELLED");
    expect(mapStripePayment("who_knows")).toBe("PENDING");
  });

  it("trusts the session's payment_status over its lifecycle status", () => {
    // A session can be "open" while payment_status is already "paid" for an
    // async method; the money is what matters.
    expect(mapStripeSession("open", "paid")).toBe("PAID");
    expect(mapStripeSession("complete", "unpaid")).toBe("PROCESSING");
    expect(mapStripeSession("expired", "unpaid")).toBe("EXPIRED");
    expect(mapStripeSession("open", "unpaid")).toBe("PENDING");
    expect(mapStripeSession(null, null)).toBe("PENDING");
  });

  it("maps refund and subscription states", () => {
    expect(mapStripeRefund("succeeded")).toBe("SUCCEEDED");
    expect(mapStripeRefund("pending")).toBe("PROCESSING");
    expect(mapStripeRefund("canceled")).toBe("CANCELLED");
    expect(mapStripeRefund(null)).toBe("PENDING");

    expect(mapStripeSubscription("active")).toBe("ACTIVE");
    expect(mapStripeSubscription("trialing")).toBe("ACTIVE");
    expect(mapStripeSubscription("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscription("unpaid")).toBe("PAST_DUE");
    expect(mapStripeSubscription("canceled")).toBe("CANCELLED");
    expect(mapStripeSubscription("incomplete")).toBe("PENDING_ACTIVATION");
    expect(mapStripeSubscription("incomplete_expired")).toBe("EXPIRED");
  });
});

describe("every mapper stays inside the unified vocabulary", () => {
  const mappers = [mapRazorpayPayment, mapCashfreePayment, mapStripePayment];

  it("returns only declared PaymentStatus values", () => {
    const samples = [
      null,
      "",
      "captured",
      "SUCCESS",
      "succeeded",
      "totally-made-up",
      "PAID",
      "refunded"
    ];

    for (const map of mappers) {
      for (const sample of samples) {
        expect(PAYMENT_STATUSES).toContain(map(sample));
      }
    }
  });

  it("only says PAID when a provider genuinely reported success", () => {
    const notSuccess = ["", "totally-made-up", "pending", "failed", null];

    for (const map of mappers) {
      for (const sample of notSuccess) {
        expect(map(sample)).not.toBe("PAID");
      }
    }
  });
});
