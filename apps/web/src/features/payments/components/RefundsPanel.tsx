"use client";

import {
  formatMoney,
  PAYMENT_PROVIDER_LABELS,
  REFUND_STATUS_LABELS,
  type RefundStatus
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useRefunds } from "../hooks/usePaymentsApi";

const STATUS_VARIANT: Record<
  RefundStatus,
  "success" | "destructive" | "warning" | "secondary"
> = {
  PENDING: "warning",
  PROCESSING: "warning",
  SUCCEEDED: "success",
  FAILED: "destructive",
  CANCELLED: "secondary"
};

/**
 * Every refund and where it actually is. A row stays PROCESSING until the
 * gateway confirms it settled — an accepted API request is never enough.
 */
export function RefundsPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useRefunds();

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  if (!data || data.refunds.length === 0) {
    return (
      <EmptyState
        description="Refunds issued from the transactions tab will appear here."
        title="No refunds yet"
      />
    );
  }

  return (
    <Card className="divide-y divide-app-border p-0">
      {data.refunds.map((refund) => (
        <div
          className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
          key={refund.id}
        >
          <Badge variant={STATUS_VARIANT[refund.status]}>
            {REFUND_STATUS_LABELS[refund.status]}
          </Badge>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-app-text">
              {refund.userName ?? "Unknown"} ·{" "}
              <span className="font-mono text-xs">{refund.orderNumber}</span>
            </p>
            <p className="truncate text-xs text-app-muted">
              {PAYMENT_PROVIDER_LABELS[refund.provider]}
              {refund.reason ? ` · ${refund.reason}` : ""}
              {refund.requestedByName ? ` · by ${refund.requestedByName}` : ""}
            </p>
            {refund.failureMessage ? (
              <p className="truncate text-xs text-app-danger-ink">
                {refund.failureMessage}
              </p>
            ) : null}
          </div>

          <p className="text-sm font-bold text-app-text">
            {formatMoney(refund.amount, refund.currency)}
          </p>

          <p className="text-xs text-app-muted">
            {refund.processedAt
              ? formatDateTime(refund.processedAt, timeZone)
              : `requested ${formatDateTime(refund.createdAt, timeZone)}`}
          </p>
        </div>
      ))}
    </Card>
  );
}
