import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import {
  DEFAULT_PAYMENT_ROUTING,
  isMethodEnabled,
  methodNote,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PROVIDERS,
  paymentRoutingConfigSchema,
  resolvePaymentProvider,
  type CheckoutMethodOption,
  type PaymentMethodKind,
  type PaymentProvider,
  type PaymentRoutingConfig,
  type RoutingDecision
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { ProviderHealthService } from "./provider-health.service";
import { ProviderRegistry } from "./providers/provider-registry.service";

/**
 * Decides which gateway handles an attempt. The frontend never names one.
 *
 * Routing itself is the pure `resolvePaymentProvider` from @nexa-chess/types —
 * shared with the admin UI so the preview and the real decision can never
 * drift. This service only supplies the inputs: the stored config, which
 * providers are configured, and which are currently unhealthy.
 */
@Injectable()
export class PaymentRouterService {
  private readonly logger = new Logger(PaymentRouterService.name);

  constructor(
    private readonly health: ProviderHealthService,
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry
  ) {}

  /** Lazily seeds the singleton from the shared defaults, like LiveClassPolicy. */
  async getConfig(): Promise<PaymentRoutingConfig> {
    const row = await this.prisma.paymentSetting.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" }
    });

    if (!row) {
      const created = await this.prisma.paymentSetting.create({
        data: { routing: DEFAULT_PAYMENT_ROUTING }
      });
      return paymentRoutingConfigSchema.parse(created.routing);
    }

    const parsed = paymentRoutingConfigSchema.safeParse(row.routing);
    if (!parsed.success) {
      // A hand-edited row must never take payments offline; fall back loudly.
      this.logger.error(
        `Stored payment routing is invalid, using defaults: ${parsed.error.message}`
      );
      return DEFAULT_PAYMENT_ROUTING;
    }
    return parsed.data;
  }

  async saveConfig(
    config: PaymentRoutingConfig,
    updatedById: string
  ): Promise<PaymentRoutingConfig> {
    const existing = await this.prisma.paymentSetting.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" }
    });

    const row = existing
      ? await this.prisma.paymentSetting.update({
          where: { id: existing.id },
          data: { routing: config, updatedById }
        })
      : await this.prisma.paymentSetting.create({
          data: { routing: config, updatedById }
        });

    return paymentRoutingConfigSchema.parse(row.routing);
  }

  /**
   * Picks a provider for one attempt.
   *
   * `exclude` carries the providers already tried on this order. §17: that list
   * is only ever populated once the original attempt has been reconciled, so a
   * re-route can never happen while it is unclear whether money moved.
   */
  async route(request: {
    currency: string;
    method?: PaymentMethodKind;
    exclude?: PaymentProvider[];
    /** A recurring plan needs a gateway that can hold a mandate. */
    recurring?: boolean;
  }): Promise<RoutingDecision> {
    const config = await this.getConfig();
    const unavailable = await this.health.unavailableProviders(
      this.registry.configuredMap()
    );

    const recurringCapable = request.recurring
      ? this.recurringCapableProviders(request.currency)
      : undefined;

    const decision = resolvePaymentProvider(config, {
      currency: request.currency,
      method: request.method,
      unavailable,
      exclude: request.exclude,
      recurringCapable
    });

    if (!decision) {
      // Retry once ignoring health: a degraded gateway still beats no gateway,
      // and health is a heuristic over a rolling window, not a fact.
      const relaxed = resolvePaymentProvider(config, {
        currency: request.currency,
        method: request.method,
        unavailable: this.registry.unconfigured(),
        exclude: request.exclude,
        recurringCapable
      });

      if (!relaxed) {
        throw new ServiceUnavailableException(
          "No payment gateway is available for this payment method right now. Please try another method."
        );
      }

      this.logger.warn(
        `Routing to ${relaxed.provider} despite degraded health — no healthy alternative.`
      );
      return relaxed;
    }

    return decision;
  }

  /**
   * The method picker for the checkout screen: every method some configured,
   * healthy gateway can actually serve, each already routed to the gateway
   * that would take it.
   */
  async availableMethods(
    currency: string,
    options: { recurring?: boolean } = {}
  ): Promise<CheckoutMethodOption[]> {
    const config = await this.getConfig();
    const unavailable = await this.health.unavailableProviders(
      this.registry.configuredMap()
    );

    const recurringCapable = options.recurring
      ? this.recurringCapableProviders(currency)
      : undefined;

    const result: CheckoutMethodOption[] = [];

    for (const kind of METHOD_DISPLAY_ORDER) {
      // An admin switching a method off removes it here too, not just from the
      // router — one switch, every surface.
      if (!isMethodEnabled(config, kind)) continue;

      const decision = resolvePaymentProvider(config, {
        currency,
        method: kind,
        unavailable,
        recurringCapable
      });
      if (!decision) continue;

      // The router may answer with a gateway that cannot serve this method —
      // a rule matching "India · anything" would. Only offer it if the adapter
      // itself says yes.
      if (!this.registry.supportedMethods(decision.provider, currency).includes(kind)) {
        continue;
      }

      result.push({
        kind,
        label: PAYMENT_METHOD_LABELS[kind],
        // The admin's own wording when they set one, otherwise the built-in.
        hint: methodNote(config, kind),
        provider: decision.provider,
        upiFlows:
          kind === "UPI"
            ? this.registry.upiFlows(decision.provider, currency)
            : []
      });
    }

    return result;
  }

  /** Gateways that can actually mandate a recurring charge in this currency. */
  private recurringCapableProviders(currency: string): PaymentProvider[] {
    return PAYMENT_PROVIDERS.filter((provider) =>
      this.registry.get(provider).supportsRecurring(currency)
    );
  }
}

/** UPI first for India; the rest in the order the checkout screen lists them. */
const METHOD_DISPLAY_ORDER: PaymentMethodKind[] = [
  "UPI",
  "CARD",
  "NET_BANKING",
  "WALLET",
  "EMI",
  "PAY_LATER",
  "APPLE_PAY",
  "GOOGLE_PAY"
];
