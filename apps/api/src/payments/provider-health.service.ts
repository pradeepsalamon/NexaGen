import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  type ProviderHealthItem,
  type ProviderHealthResponse
} from "@nexa-chess/types";
import { PaymentProviderEventKind } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";

/** Provider telemetry rows older than this are pruned nightly. */
const EVENT_RETENTION_DAYS = 30;

/**
 * Provider health (§17): success rate, failure rate, response time and webhook
 * failures per gateway, over a rolling window.
 *
 * Deliberately knows nothing about the adapters — the registry passes in which
 * providers are configured. That keeps the dependency one-way, so an adapter
 * can record into it without a cycle.
 */
@Injectable()
export class ProviderHealthService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(ProviderHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService
  ) {}

  /**
   * Records one provider interaction. Never throws and never awaits the
   * caller's critical path in a way that can fail it — telemetry must not be
   * able to sink a payment.
   */
  record(input: {
    provider: PaymentProvider;
    kind: "API_CALL" | "WEBHOOK";
    operation: string;
    success: boolean;
    durationMs?: number | null;
    statusCode?: number | null;
    errorCode?: string | null;
  }): void {
    void this.prisma.paymentProviderEvent
      .create({
        data: {
          provider: input.provider,
          kind:
            input.kind === "WEBHOOK"
              ? PaymentProviderEventKind.WEBHOOK
              : PaymentProviderEventKind.API_CALL,
          operation: input.operation.slice(0, 120),
          success: input.success,
          durationMs: input.durationMs ?? null,
          statusCode: input.statusCode ?? null,
          errorCode: input.errorCode?.slice(0, 120) ?? null
        }
      })
      .catch((error: Error) => {
        this.logger.warn(`Could not record provider telemetry: ${error.message}`);
      });
  }

  /**
   * Providers that should be taken out of rotation right now: unconfigured, or
   * failing hard enough over the window with enough samples to be sure it is
   * the gateway and not one unlucky card.
   */
  async unavailableProviders(
    configured: Record<PaymentProvider, boolean>
  ): Promise<PaymentProvider[]> {
    const health = await this.getHealth(configured);
    return health.providers
      .filter((item) => !item.available)
      .map((item) => item.provider);
  }

  async getHealth(
    configured: Record<PaymentProvider, boolean>
  ): Promise<ProviderHealthResponse> {
    const windowHours = this.env.PAYMENTS_HEALTH_WINDOW_HOURS;
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const events = await this.prisma.paymentProviderEvent.findMany({
      where: { createdAt: { gte: since } },
      select: {
        provider: true,
        kind: true,
        success: true,
        durationMs: true,
        createdAt: true
      }
    });

    const providers = PAYMENT_PROVIDERS.map((provider) =>
      this.summarize(
        provider,
        configured[provider] ?? false,
        events.filter((event) => event.provider === provider)
      )
    );

    return { windowHours, providers };
  }

  private summarize(
    provider: PaymentProvider,
    isConfigured: boolean,
    events: {
      kind: PaymentProviderEventKind;
      success: boolean;
      durationMs: number | null;
      createdAt: Date;
    }[]
  ): ProviderHealthItem {
    const apiCalls = events.filter(
      (event) => event.kind === PaymentProviderEventKind.API_CALL
    );
    const attempts = apiCalls.length;
    const succeeded = apiCalls.filter((event) => event.success).length;
    const failed = attempts - succeeded;

    const durations = apiCalls
      .map((event) => event.durationMs)
      .filter((value): value is number => typeof value === "number");

    const successRate = attempts > 0 ? (succeeded / attempts) * 100 : null;

    const webhookFailures = events.filter(
      (event) =>
        event.kind === PaymentProviderEventKind.WEBHOOK && !event.success
    ).length;

    const lastSuccessAt = latest(events.filter((event) => event.success));
    const lastFailureAt = latest(events.filter((event) => !event.success));

    // Too few samples is never a reason to disable a gateway — a brand new
    // deploy has zero events and every provider must still be usable.
    const degraded =
      attempts >= this.env.PAYMENTS_HEALTH_MIN_SAMPLES &&
      successRate !== null &&
      successRate < this.env.PAYMENTS_HEALTH_MIN_SUCCESS_RATE;

    return {
      provider,
      configured: isConfigured,
      available: isConfigured && !degraded,
      successRate: successRate === null ? null : round(successRate),
      failureRate: successRate === null ? null : round(100 - successRate),
      avgResponseMs:
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null,
      webhookFailures,
      attempts,
      succeeded,
      failed,
      lastFailureAt: lastFailureAt?.toISOString() ?? null,
      lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
      degradedReason: !isConfigured
        ? "Credentials are not configured."
        : degraded
          ? `Success rate ${round(successRate ?? 0)}% over the last ${this.env.PAYMENTS_HEALTH_WINDOW_HOURS}h is below the ${this.env.PAYMENTS_HEALTH_MIN_SUCCESS_RATE}% threshold.`
          : null
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async pruneOldEvents(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.paymentProviderEventPrune, () => this.pruneOldEventsNow());
  }

  private async pruneOldEventsNow(): Promise<void> {
    const cutoff = new Date(
      Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    const { count } = await this.prisma.paymentProviderEvent.deleteMany({
      where: { createdAt: { lt: cutoff } }
    });
    if (count > 0) {
      this.logger.log(`Pruned ${count} provider telemetry rows.`);
    }
  }
}

function latest(events: { createdAt: Date }[]): Date | null {
  return events.reduce<Date | null>(
    (newest, event) =>
      !newest || event.createdAt > newest ? event.createdAt : newest,
    null
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
