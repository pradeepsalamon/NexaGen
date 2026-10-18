"use client";

import { formatMoney, type RevenueByKey } from "@nexa-chess/types";
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  Percent,
  RotateCcw,
  TrendingUp,
  XCircle
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { StatTile } from "@/components/ui/StatTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePaymentOverview } from "../hooks/usePaymentsApi";

/**
 * Revenue at a glance (§16). Every figure is NET of refunds, and every date
 * bucket is computed server-side in the admin's own timezone.
 */
export function PaymentsOverviewPanel() {
  const { data, error, isLoading, refetch } = usePaymentOverview();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error || !data) {
    return (
      <WidgetError
        message="Could not load payment figures."
        onRetry={() => void refetch()}
      />
    );
  }

  const money = (minor: number) => formatMoney(minor, data.currency);

  return (
    <div className="space-y-4">
      <KpiCardRow>
        <StatTile
          context="Net of refunds"
          icon={Banknote}
          label="Total revenue"
          tone="primary"
          value={money(data.totalRevenue)}
        />
        <StatTile
          icon={TrendingUp}
          label="Today"
          tone="accent"
          value={money(data.todayRevenue)}
        />
        <StatTile
          icon={CalendarDays}
          label="This month"
          tone="warm"
          value={money(data.monthRevenue)}
        />
        <StatTile
          icon={Percent}
          label="Success rate"
          progress={data.successRate}
          tone="accent"
          value={`${data.successRate}%`}
        />
      </KpiCardRow>

      <KpiCardRow>
        <StatTile
          icon={CheckCircle2}
          label="Successful"
          tone="accent"
          value={String(data.successfulPayments)}
        />
        <StatTile
          icon={XCircle}
          label="Failed"
          tone="secondary"
          value={String(data.failedPayments)}
        />
        <StatTile
          icon={Clock}
          label="Pending"
          tone="secondary"
          value={String(data.pendingPayments)}
        />
        <StatTile
          context={`${data.refundCount} refund(s)`}
          icon={RotateCcw}
          label="Refunded"
          tone="warm"
          value={money(data.refundedAmount)}
        />
      </KpiCardRow>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownCard
          currency={data.currency}
          rows={data.revenueByMethod}
          title="Revenue by method"
        />
        <BreakdownCard
          currency={data.currency}
          rows={data.revenueByProvider}
          title="Revenue by gateway"
        />
      </div>

      <RevenueTrend
        currency={data.currency}
        trend={data.revenueTrend}
      />
    </div>
  );
}

function BreakdownCard({
  currency,
  rows,
  title
}: {
  currency: string;
  rows: RevenueByKey[];
  title: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-app-text">{title}</h3>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-app-muted">No revenue recorded yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => {
            const share = total > 0 ? (row.amount / total) * 100 : 0;
            return (
              <li key={row.key}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold text-app-text">{row.label}</span>
                  <span className="tabular-nums text-app-text">
                    {formatMoney(row.amount, currency)}
                    <span className="ml-2 text-xs text-app-muted">
                      {row.count}
                    </span>
                  </span>
                </div>
                {/* Decorative bar — the figures beside it carry the meaning,
                    so it needs no label of its own. */}
                <div
                  aria-hidden
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-app-soft"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(share, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RevenueTrend({
  currency,
  trend
}: {
  currency: string;
  trend: { date: string; amount: number; count: number }[];
}) {
  const peak = Math.max(...trend.map((day) => day.amount), 1);

  return (
    <Card className="p-5">
      <h3 className="text-sm font-bold text-app-text">Last 30 days</h3>

      <div className="mt-4 flex h-28 items-end gap-1 overflow-x-auto">
        {trend.map((day) => (
          <div
            className="flex min-w-[6px] flex-1 flex-col justify-end"
            key={day.date}
            // Non-interactive bar: a native title is acceptable here, and a
            // tooltip on 30 sibling bars would be noise.
            title={`${day.date}: ${formatMoney(day.amount, currency)} (${day.count})`}
          >
            <div
              className="rounded-t bg-primary/70"
              style={{
                height: `${Math.max((day.amount / peak) * 100, day.amount > 0 ? 4 : 1)}%`
              }}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
