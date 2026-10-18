import { Injectable, NotFoundException } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  paymentRoutingConfigSchema,
  type PaymentListQuery,
  type PaymentListResponse,
  type PaymentOverviewResponse,
  type PaymentRoutingConfig,
  type ProviderHealthResponse,
  type RevenueByKey
} from "@nexa-chess/types";
import { PaymentStatus, Prisma, type User } from "@prisma/client";
import {
  DEFAULT_TIME_ZONE,
  zonedDayBounds,
  zonedDateToUtc,
  zonedMonthBounds,
  zonedYmd
} from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentRouterService } from "./payment-router.service";
import { PaymentService, type PaymentWithRelations } from "./payment.service";
import { ProviderHealthService } from "./provider-health.service";
import { ProviderRegistry } from "./providers/provider-registry.service";

/** Statuses that represent money actually collected. */
const SETTLED: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.REFUND_PENDING,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED
];

const IN_FLIGHT: PaymentStatus[] = [
  PaymentStatus.CREATED,
  PaymentStatus.PENDING,
  PaymentStatus.PROCESSING,
  PaymentStatus.AUTHORIZED
];

const TREND_DAYS = 30;

/**
 * The admin payment dashboard (§16).
 *
 * Every date bucket is computed in the requesting admin's own `User.timezone`,
 * the same convention the analytics module uses — "today's revenue" means their
 * today, not the server's.
 *
 * Revenue is always NET: a refunded amount is subtracted rather than shown as
 * income that quietly went away.
 */
@Injectable()
export class PaymentsAdminService {
  private readonly env = getApiEnv();

  constructor(
    private readonly health: ProviderHealthService,
    private readonly payments: PaymentService,
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly router: PaymentRouterService
  ) {}

  async overview(admin: User): Promise<PaymentOverviewResponse> {
    const tz = admin.timezone || DEFAULT_TIME_ZONE;
    const now = new Date();
    const today = zonedDayBounds(tz, now);
    const month = zonedMonthBounds(tz, now);
    const trendStart = new Date(
      today.start.getTime() - (TREND_DAYS - 1) * 24 * 60 * 60 * 1000
    );

    const [settled, counts, trendRows] = await Promise.all([
      this.prisma.payment.findMany({
        where: { status: { in: SETTLED } },
        select: {
          amount: true,
          amountRefunded: true,
          currency: true,
          paymentMethod: true,
          provider: true,
          paidAt: true
        }
      }),
      this.prisma.payment.groupBy({
        by: ["status"],
        _count: { _all: true }
      }),
      this.prisma.payment.findMany({
        where: { status: { in: SETTLED }, paidAt: { gte: trendStart } },
        select: { amount: true, amountRefunded: true, paidAt: true }
      })
    ]);

    const currency = this.env.PAYMENTS_DEFAULT_CURRENCY;
    const net = (row: { amount: number; amountRefunded: number }) =>
      row.amount - row.amountRefunded;

    const totalRevenue = settled.reduce((sum, row) => sum + net(row), 0);
    const todayRevenue = settled
      .filter((row) => row.paidAt && row.paidAt >= today.start && row.paidAt < today.end)
      .reduce((sum, row) => sum + net(row), 0);
    const monthRevenue = settled
      .filter((row) => row.paidAt && row.paidAt >= month.start && row.paidAt < month.end)
      .reduce((sum, row) => sum + net(row), 0);

    const countOf = (statuses: PaymentStatus[]) =>
      counts
        .filter((row) => statuses.includes(row.status))
        .reduce((sum, row) => sum + row._count._all, 0);

    const successfulPayments = countOf(SETTLED);
    const failedPayments = countOf([
      PaymentStatus.FAILED,
      PaymentStatus.CANCELLED,
      PaymentStatus.EXPIRED
    ]);
    const pendingPayments = countOf(IN_FLIGHT);

    const refundAggregate = await this.prisma.refund.aggregate({
      where: { status: "SUCCEEDED" },
      _sum: { amount: true },
      _count: { _all: true }
    });

    const resolved = successfulPayments + failedPayments;

    return {
      currency,
      totalRevenue,
      todayRevenue,
      monthRevenue,
      successfulPayments,
      failedPayments,
      pendingPayments,
      refundedAmount: refundAggregate._sum.amount ?? 0,
      refundCount: refundAggregate._count._all,
      successRate:
        resolved > 0 ? Math.round((successfulPayments / resolved) * 1000) / 10 : 0,
      revenueByMethod: groupRevenue(settled, (row) =>
        row.paymentMethod
          ? { key: row.paymentMethod, label: PAYMENT_METHOD_LABELS[row.paymentMethod] }
          : { key: "UNKNOWN", label: "Not recorded" }
      ),
      revenueByProvider: groupRevenue(settled, (row) => ({
        key: row.provider,
        label: PAYMENT_SOURCE_LABELS[row.provider]
      })),
      revenueTrend: this.buildTrend(trendRows, tz, today.start),
      activeSubscriptions: await this.prisma.subscription.count({
        where: { status: { in: ["ACTIVE", "PAST_DUE"] } }
      })
    };
  }

  async list(
    admin: User,
    query: PaymentListQuery
  ): Promise<PaymentListResponse> {
    const where = this.buildWhere(admin, query);

    const [total, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          order: { include: { plan: true } },
          user: { select: { firstName: true, lastName: true, email: true } },
          invoice: { select: { id: true, number: true } },
          attempts: { select: { id: true } }
        },
        orderBy: { createdAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);

    return {
      payments: rows.map((row) =>
        this.payments.toListItem(row as PaymentWithRelations)
      ),
      meta: {
        total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize))
      }
    };
  }

  /** CSV of the current filter, for reconciliation against a bank statement. */
  async exportCsv(admin: User, query: PaymentListQuery): Promise<string> {
    const rows = await this.prisma.payment.findMany({
      where: this.buildWhere(admin, query),
      include: {
        order: { include: { plan: true } },
        user: { select: { firstName: true, lastName: true, email: true } },
        invoice: { select: { id: true, number: true } },
        attempts: { select: { id: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 10000
    });

    const header = [
      "Date",
      "Paid at",
      "Order",
      "User",
      "Email",
      "Plan",
      "Amount (minor units)",
      "Refunded",
      "Currency",
      "Method",
      "Provider",
      "Status",
      "Transaction ID",
      "Invoice"
    ];

    const lines = rows.map((row) => {
      const item = this.payments.toListItem(row as PaymentWithRelations);
      return [
        item.createdAt,
        item.paidAt ?? "",
        item.orderNumber,
        item.userName ?? "",
        item.userEmail ?? "",
        item.planName ?? "",
        String(item.amount),
        String(item.amountRefunded),
        item.currency,
        item.method ?? "",
        item.provider,
        item.status,
        item.providerPaymentId ?? "",
        item.invoiceNumber ?? ""
      ].map(csvCell);
    });

    return [header.map(csvCell), ...lines].map((cells) => cells.join(",")).join("\n");
  }

  async getPayment(paymentId: string) {
    const payment = await this.payments.requirePayment(paymentId);
    if (!payment) throw new NotFoundException("Payment not found.");

    const [attempts, refunds, webhooks] = await Promise.all([
      this.prisma.paymentAttempt.findMany({
        where: { orderId: payment.orderId },
        orderBy: { attemptNumber: "asc" }
      }),
      this.prisma.refund.findMany({
        where: { paymentId },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.paymentWebhookEvent.findMany({
        where: { paymentId },
        orderBy: { receivedAt: "desc" },
        take: 20,
        select: {
          id: true,
          eventType: true,
          status: true,
          receivedAt: true,
          error: true
        }
      })
    ]);

    return {
      payment: this.payments.toListItem(payment),
      // The attempt trail: Razorpay failed, Cashfree failed, Razorpay paid.
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        provider: attempt.provider,
        method: attempt.method,
        status: attempt.status,
        failureMessage: attempt.failureMessage,
        createdAt: attempt.createdAt.toISOString()
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: refund.amount,
        status: refund.status,
        reason: refund.reason,
        createdAt: refund.createdAt.toISOString(),
        processedAt: refund.processedAt?.toISOString() ?? null
      })),
      webhooks: webhooks.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        status: event.status,
        error: event.error,
        receivedAt: event.receivedAt.toISOString()
      }))
    };
  }

  async providerHealth(): Promise<ProviderHealthResponse> {
    return this.health.getHealth(this.registry.configuredMap());
  }

  async getRouting(): Promise<{
    config: PaymentRoutingConfig;
    configured: Record<string, boolean>;
  }> {
    return {
      config: await this.router.getConfig(),
      configured: this.registry.configuredMap()
    };
  }

  async saveRouting(
    admin: User,
    config: unknown
  ): Promise<{ config: PaymentRoutingConfig; configured: Record<string, boolean> }> {
    const parsed = paymentRoutingConfigSchema.parse(config);

    // A rule naming an unconfigured gateway is not rejected — an admin may be
    // preparing one before its keys land — but the router skips it at runtime.
    return {
      config: await this.router.saveConfig(parsed, admin.id),
      configured: this.registry.configuredMap()
    };
  }

  private buildWhere(admin: User, query: PaymentListQuery): Prisma.PaymentWhereInput {
    const tz = admin.timezone || DEFAULT_TIME_ZONE;
    const where: Prisma.PaymentWhereInput = {};

    if (query.provider) where.provider = query.provider;
    if (query.status) where.status = query.status;
    if (query.method) where.paymentMethod = query.method;
    if (query.userId) where.userId = query.userId;
    if (query.orderId) where.orderId = query.orderId;

    if (query.minAmount !== undefined || query.maxAmount !== undefined) {
      where.amount = {
        ...(query.minAmount !== undefined ? { gte: query.minAmount } : {}),
        ...(query.maxAmount !== undefined ? { lte: query.maxAmount } : {})
      };
    }

    // Date-only bounds are read as whole days in the admin's zone, so "to"
    // includes everything that happened on that date.
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: dayStart(tz, query.from) } : {}),
        ...(query.to ? { lt: dayAfter(tz, query.to) } : {})
      };
    }

    if (query.search) {
      const search = query.search;
      where.OR = [
        { order: { orderNumber: { contains: search, mode: "insensitive" } } },
        { providerPaymentId: { contains: search, mode: "insensitive" } },
        { user: { email: { contains: search, mode: "insensitive" } } },
        { user: { firstName: { contains: search, mode: "insensitive" } } },
        { user: { lastName: { contains: search, mode: "insensitive" } } },
        { invoice: { number: { contains: search, mode: "insensitive" } } }
      ];
    }

    return where;
  }

  private buildTrend(
    rows: { amount: number; amountRefunded: number; paidAt: Date | null }[],
    tz: string,
    todayStart: Date
  ): { date: string; amount: number; count: number }[] {
    const buckets = new Map<string, { amount: number; count: number }>();

    for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
      const day = new Date(todayStart.getTime() - offset * 24 * 60 * 60 * 1000);
      buckets.set(ymdKey(tz, day), { amount: 0, count: 0 });
    }

    for (const row of rows) {
      if (!row.paidAt) continue;
      const key = ymdKey(tz, row.paidAt);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.amount += row.amount - row.amountRefunded;
      bucket.count += 1;
    }

    return [...buckets.entries()].map(([date, bucket]) => ({ date, ...bucket }));
  }
}

function groupRevenue<T extends { amount: number; amountRefunded: number }>(
  rows: T[],
  keyOf: (row: T) => { key: string; label: string }
): RevenueByKey[] {
  const groups = new Map<string, RevenueByKey>();

  for (const row of rows) {
    const { key, label } = keyOf(row);
    const existing = groups.get(key) ?? { key, label, amount: 0, count: 0 };
    existing.amount += row.amount - row.amountRefunded;
    existing.count += 1;
    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) => b.amount - a.amount);
}

/** "YYYY-MM-DD" for a UTC instant, as seen in `tz`. Bucket key for the trend. */
function ymdKey(tz: string, at: Date): string {
  const { year, month, day } = zonedYmd(tz, at);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Local midnight of a "YYYY-MM-DD" filter bound, as a UTC instant. */
function dayStart(tz: string, ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return zonedDateToUtc(tz, year, month, day);
}

/** Exclusive upper bound: the instant local midnight rolls into the next day. */
function dayAfter(tz: string, ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return zonedDateToUtc(
    tz,
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate()
  );
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
