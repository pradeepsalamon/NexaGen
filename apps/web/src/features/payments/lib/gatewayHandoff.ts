import type { CheckoutHandoff } from "@nexa-chess/types";

/**
 * Hands the browser to the gateway.
 *
 * This file is the only place in the web app that knows a gateway SDK exists.
 * Everything it returns is *advisory*: the server decides what actually
 * happened, so a "completed" result only means the modal closed claiming
 * success, and the caller must still ask the API.
 *
 * No gateway script is bundled — each is loaded from the provider's own CDN on
 * demand, so a student who pays by UPI never downloads Stripe's SDK.
 */

const SDK_URLS = {
  RAZORPAY: "https://checkout.razorpay.com/v1/checkout.js",
  CASHFREE: "https://sdk.cashfree.com/js/v3/cashfree.js"
} as const;

export type HandoffOutcome =
  | {
      /** The gateway says it is done. Verify server-side before believing it. */
      kind: "completed";
      providerPaymentId?: string;
      providerOrderId?: string;
      signature?: string;
    }
  /** The user closed the modal. The payment may still complete — poll. */
  | { kind: "dismissed" }
  /** The tab is navigating away; nothing further will run here. */
  | { kind: "redirected" }
  | { kind: "failed"; message: string };

export async function openGateway(
  handoff: CheckoutHandoff,
  options: { amount: number; currency: string; description: string }
): Promise<HandoffOutcome> {
  switch (handoff.kind) {
    case "REDIRECT":
      return redirect(handoff);
    case "SDK":
      return handoff.provider === "RAZORPAY"
        ? openRazorpay(handoff, options)
        : openCashfree(handoff);
    case "QR":
      // The QR panel renders in React and resolves by polling, not here.
      return { kind: "dismissed" };
    default:
      return { kind: "failed", message: "Unsupported checkout type." };
  }
}

function redirect(handoff: CheckoutHandoff): HandoffOutcome {
  if (!handoff.redirectUrl) {
    return { kind: "failed", message: "The gateway did not return a checkout URL." };
  }
  window.location.assign(handoff.redirectUrl);
  return { kind: "redirected" };
}

async function openRazorpay(
  handoff: CheckoutHandoff,
  options: { amount: number; currency: string; description: string }
): Promise<HandoffOutcome> {
  if (!handoff.publicKey || !handoff.providerOrderId) {
    return { kind: "failed", message: "The gateway session is incomplete." };
  }

  await loadScript(SDK_URLS.RAZORPAY);
  const Razorpay = (window as unknown as { Razorpay?: RazorpayConstructor })
    .Razorpay;
  if (!Razorpay) {
    return { kind: "failed", message: "Could not load the payment gateway." };
  }

  return new Promise<HandoffOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: HandoffOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const instance = new Razorpay({
      key: handoff.publicKey as string,
      order_id: handoff.providerOrderId as string,
      amount: options.amount,
      currency: options.currency,
      name: "NexaChess",
      description: options.description,
      prefill: {
        name: handoff.customer?.name,
        email: handoff.customer?.email,
        contact: handoff.customer?.phone
      },
      notes: handoff.notes,
      // A method hint, not a restriction: Razorpay still decides which UPI apps
      // and banks it can actually show this customer.
      ...(handoff.method === "UPI" ? { method: { upi: true } } : {}),
      handler: (response) =>
        settle({
          kind: "completed",
          providerPaymentId: response.razorpay_payment_id,
          providerOrderId: response.razorpay_order_id,
          signature: response.razorpay_signature
        }),
      modal: { ondismiss: () => settle({ kind: "dismissed" }) }
    });

    instance.on?.("payment.failed", () => settle({ kind: "dismissed" }));
    instance.open();
  });
}

async function openCashfree(handoff: CheckoutHandoff): Promise<HandoffOutcome> {
  if (!handoff.publicKey) {
    return { kind: "failed", message: "The gateway session is incomplete." };
  }

  await loadScript(SDK_URLS.CASHFREE);
  const factory = (window as unknown as { Cashfree?: CashfreeFactory }).Cashfree;
  if (!factory) {
    return { kind: "failed", message: "Could not load the payment gateway." };
  }

  const cashfree = factory({
    mode: handoff.environment === "production" ? "production" : "sandbox"
  });

  const result = await cashfree.checkout({
    paymentSessionId: handoff.publicKey,
    redirectTarget: "_modal"
  });

  if (result?.error) {
    // Cashfree reports a closed modal as an error too; either way the server
    // is the one that knows whether money moved.
    return { kind: "dismissed" };
  }

  return {
    kind: "completed",
    providerOrderId: handoff.providerOrderId
  };
}

const loaded = new Map<string, Promise<void>>();

/** Loads a gateway script once per page, reusing the in-flight promise. */
function loadScript(src: string): Promise<void> {
  const existing = loaded.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loaded.delete(src);
      reject(new Error(`Could not load ${src}`));
    };
    document.body.appendChild(script);
  });

  loaded.set(src, promise);
  return promise;
}

// ── Minimal shapes for the two gateway SDKs. ──
// Typed only as far as we actually use them, so a gateway adding options never
// breaks the build.

type RazorpayResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  method?: Record<string, boolean>;
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on?: (event: string, handler: () => void) => void;
};

type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

type CashfreeFactory = (config: { mode: "sandbox" | "production" }) => {
  checkout: (options: {
    paymentSessionId: string;
    redirectTarget?: string;
  }) => Promise<{ error?: unknown } | undefined>;
};
