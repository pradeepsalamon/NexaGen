"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCw,
  XCircle,
  type LucideIcon
} from "lucide-react";
import {
  formatMoney,
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
  type PaymentStatusResponse
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

type Tone = "success" | "pending" | "danger" | "neutral";

const TONE_BY_STATUS: Record<PaymentStatus, Tone> = {
  CREATED: "neutral",
  PENDING: "pending",
  PROCESSING: "pending",
  AUTHORIZED: "pending",
  PAID: "success",
  FAILED: "danger",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  REFUND_PENDING: "pending",
  PARTIALLY_REFUNDED: "neutral",
  REFUNDED: "neutral"
};

const ICON_BY_TONE: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  pending: Clock,
  danger: XCircle,
  neutral: AlertTriangle
};

// The four-colour design language: accent = gained, secondary = waiting,
// danger = lost, soft = neutral. Same mapping as Badge's variants.
const RING_BY_TONE: Record<Tone, string> = {
  success: "border-accent bg-accent/10 text-accent-ink",
  pending: "border-secondary bg-secondary/10 text-secondary-ink",
  danger: "border-app-danger/40 bg-app-danger/[0.08] text-app-danger-ink",
  neutral: "border-app-border bg-app-soft text-app-muted"
};

type Props = {
  status: PaymentStatusResponse;
  /** True while the status query is refetching. */
  checking?: boolean;
  onCheckStatus?: () => void;
  onRetry?: () => void;
  retrying?: boolean;
};

/**
 * States what the payment actually is, in the customer's words (§20).
 *
 * The "Check payment status" button only ever triggers a server-side
 * reconciliation — it cannot mark anything paid, which is exactly why it is
 * safe to offer while a payment is still in the air.
 */
export function PaymentStatusCard({
  status,
  checking,
  onCheckStatus,
  onRetry,
  retrying
}: Props) {
  const tone = TONE_BY_STATUS[status.status];
  const Icon = ICON_BY_TONE[tone];

  return (
    <Card className={cn("border p-5 sm:p-6", RING_BY_TONE[tone])}>
      <div className="flex items-start gap-3">
        {status.pending && checking ? (
          <Loader2 aria-hidden className="mt-0.5 size-6 shrink-0 animate-spin" />
        ) : (
          <Icon aria-hidden className="mt-0.5 size-6 shrink-0" strokeWidth={2.5} />
        )}

        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-app-text">
            {PAYMENT_STATUS_LABELS[status.status]}
          </h2>
          <p className="mt-1 text-sm text-app-muted">{status.message}</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-app-muted">Amount</dt>
              <dd className="font-semibold text-app-text">
                {formatMoney(status.amount, status.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-app-muted">Order</dt>
              <dd className="font-mono text-xs font-semibold text-app-text">
                {status.orderNumber}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-app-muted">Access</dt>
              <dd className="font-semibold text-app-text">
                {status.accessGranted ? "Activated" : "Not yet"}
              </dd>
            </div>
          </dl>

          {status.amountRefunded > 0 ? (
            <p className="mt-3 text-sm text-app-muted">
              {formatMoney(status.amountRefunded, status.currency)} has been
              refunded.
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {onCheckStatus ? (
              <Button
                isLoading={checking}
                onClick={onCheckStatus}
                size="sm"
                type="button"
                variant="outline"
              >
                <RotateCw className="size-4" strokeWidth={2.5} />
                Check payment status
              </Button>
            ) : null}

            {/*
              A retry is only offered on a state the server has confirmed is
              dead. While anything is still in flight the only safe action is
              to wait — paying again could take the money twice.
            */}
            {status.retryable && onRetry ? (
              <Button
                isLoading={retrying}
                onClick={onRetry}
                size="sm"
                type="button"
                variant="primary"
              >
                Try again
              </Button>
            ) : null}
          </div>

          {status.pending ? (
            <p className="mt-4 rounded-app bg-app-surface/70 px-3 py-2 text-xs font-semibold text-app-text">
              Do not make another payment while we verify the current
              transaction.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
