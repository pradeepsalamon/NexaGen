"use client";

import {
  BILLING_INTERVAL_LABELS,
  formatMoney,
  isActiveSubscriptionStatus,
  PAYMENT_SOURCE_LABELS,
  SUBSCRIPTION_STATUS_LABELS
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useAdminSubscriptions } from "../hooks/usePaymentsApi";

/** Recurring plans and where each one stands with its gateway. */
export function SubscriptionsPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAdminSubscriptions();

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  if (!data || data.subscriptions.length === 0) {
    return (
      <EmptyState
        description="Recurring plans that members subscribe to will appear here."
        title="No subscriptions yet"
      />
    );
  }

  return (
    <Card className="divide-y divide-app-border p-0">
      {data.subscriptions.map((subscription) => (
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
          key={subscription.id}
        >
          <Badge
            variant={
              isActiveSubscriptionStatus(subscription.status)
                ? "success"
                : "secondary"
            }
          >
            {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
          </Badge>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-app-text">
              {subscription.userName ?? "Unknown"} · {subscription.planName}
            </p>
            <p className="text-xs text-app-muted">
              {BILLING_INTERVAL_LABELS[subscription.interval]} ·{" "}
              {PAYMENT_SOURCE_LABELS[subscription.provider]}
              {subscription.cancelAtPeriodEnd ? " · cancelling at period end" : ""}
            </p>
          </div>

          <p className="text-sm font-bold text-app-text">
            {formatMoney(subscription.amount, subscription.currency)}
          </p>

          <div className="text-right text-xs text-app-muted">
            {subscription.nextBillingDate ? (
              <p>
                Next {formatDateTime(subscription.nextBillingDate, timeZone)}
              </p>
            ) : null}
            {subscription.failedRenewals > 0 ? (
              <p className="text-app-danger-ink">
                {subscription.failedRenewals} failed renewal(s)
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </Card>
  );
}
