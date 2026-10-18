import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type PaymentMethodKind,
  type PaymentSource,
  type UpiFlow
} from "@nexa-chess/types";
import { CashfreeProvider } from "./cashfree.provider";
import type { PaymentProviderAdapter } from "./payment-provider.interface";
import { RazorpayProvider } from "./razorpay.provider";
import { StripeProvider } from "./stripe.provider";

/**
 * The only place that maps a provider id to its adapter. Adding a fourth
 * gateway means writing an adapter and adding it here — nothing in
 * PaymentService, the router or the web app changes.
 */
@Injectable()
export class ProviderRegistry {
  private readonly adapters: Record<PaymentProvider, PaymentProviderAdapter>;

  constructor(
    razorpay: RazorpayProvider,
    cashfree: CashfreeProvider,
    stripe: StripeProvider
  ) {
    this.adapters = {
      RAZORPAY: razorpay,
      CASHFREE: cashfree,
      STRIPE: stripe
    };
  }

  /**
   * Accepts {@link PaymentSource} (a stored payment's actual provider, which
   * can be MANUAL) rather than the narrower {@link PaymentProvider} (a routing
   * candidate, which can't) so callers reading a Payment/Refund/Subscription
   * row don't need to narrow it themselves first. MANUAL has no adapter by
   * design — rejected here, once, with a clear message, instead of an opaque
   * "no adapter registered" from every call site.
   */
  get(provider: PaymentSource): PaymentProviderAdapter {
    if (provider === "MANUAL") {
      throw new BadRequestException(
        "Manual payments have no gateway adapter — they never reconcile with a provider."
      );
    }

    const adapter = this.adapters[provider];
    if (!adapter) {
      throw new ServiceUnavailableException(
        `No adapter is registered for ${provider}.`
      );
    }
    return adapter;
  }

  /** Throws rather than returning an adapter that cannot authenticate. */
  require(provider: PaymentSource): PaymentProviderAdapter {
    const adapter = this.get(provider);
    if (!adapter.isConfigured()) {
      throw new ServiceUnavailableException(
        `${provider} is not configured on this environment.`
      );
    }
    return adapter;
  }

  configuredMap(): Record<PaymentProvider, boolean> {
    return Object.fromEntries(
      PAYMENT_PROVIDERS.map((provider) => [
        provider,
        this.adapters[provider].isConfigured()
      ])
    ) as Record<PaymentProvider, boolean>;
  }

  /** Providers whose credentials are missing — never offered by the router. */
  unconfigured(): PaymentProvider[] {
    return PAYMENT_PROVIDERS.filter(
      (provider) => !this.adapters[provider].isConfigured()
    );
  }

  anyConfigured(): boolean {
    return PAYMENT_PROVIDERS.some((provider) =>
      this.adapters[provider].isConfigured()
    );
  }

  supportedMethods(
    provider: PaymentProvider,
    currency: string
  ): PaymentMethodKind[] {
    return this.get(provider).supportedMethods(currency);
  }

  upiFlows(provider: PaymentProvider, currency: string): UpiFlow[] {
    return this.get(provider).upiFlows(currency);
  }
}
