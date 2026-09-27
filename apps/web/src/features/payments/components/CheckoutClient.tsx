"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";
import {
  BILLING_INTERVAL_LABELS,
  formatMoney,
  isRecurringInterval,
  percentOf,
  type AppliedDiscount,
  type CheckoutHandoff,
  type PaymentMethodKind
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useToast } from "@/providers/ToastProvider";
import {
  useCheckoutConfig,
  useCreateCheckout,
  usePaymentStatus,
  useRetryPayment,
  useVerifyPayment
} from "../hooks/usePaymentsApi";
import { openGateway } from "../lib/gatewayHandoff";
import { checkoutKeyFor, clearCheckoutKey } from "../lib/checkoutKey";
import { DiscountField } from "./DiscountField";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { PaymentStatusCard } from "./PaymentStatusCard";
import { UpiQrPanel } from "./UpiQrPanel";

type Props = { planId: string };

/**
 * The checkout screen.
 *
 * The whole flow is built on one rule: this component never decides that a
 * payment succeeded. The gateway modal's "success" callback only triggers a
 * server-side verification, and the page renders whatever the server says —
 * which is also what a refresh, a closed tab, or a webhook arriving first
 * would produce.
 */
export function CheckoutClient({ planId }: Props) {
  const router = useRouter();
  const toast = useToast();

  const { data: config, error, isLoading, refetch } = useCheckoutConfig(planId);
  const checkout = useCreateCheckout();
  const verify = useVerifyPayment();
  const retry = useRetryPayment();

  const [method, setMethod] = useState<PaymentMethodKind | null>(null);
  const [discount, setDiscount] = useState<AppliedDiscount | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [qrHandoff, setQrHandoff] = useState<CheckoutHandoff | null>(null);

  // One key per (user, plan) checkout intent, held in sessionStorage. A double
  // click, a refresh or a second tab replays the same key, and the server's
  // unique index turns that into one order instead of two (§11).
  const idempotencyKey = useMemo(() => checkoutKeyFor(planId), [planId]);

  const {
    data: status,
    isFetching: checking,
    refetch: refetchStatus
  } = usePaymentStatus(paymentId, { poll: true });

  // A payment already in flight when the page loads (a refresh mid-payment, or
  // a return from a redirect) is adopted rather than replaced.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current || !config?.pendingPaymentId) return;
    adopted.current = true;
    setPaymentId(config.pendingPaymentId);
  }, [config?.pendingPaymentId]);

  // Once access is granted the key has done its job; a later purchase of the
  // same plan (a renewal) must be allowed to open a new order.
  useEffect(() => {
    if (status?.accessGranted) clearCheckoutKey(planId);
  }, [planId, status?.accessGranted]);

  useEffect(() => {
    if (config && !method && config.methods.length > 0) {
      setMethod(config.methods[0].kind);
    }
  }, [config, method]);

  // A code can be scoped to one method, so switching method invalidates the
  // preview. Clearing it is honest: the buyer re-applies and sees the truth.
  const selectMethod = useCallback((next: PaymentMethodKind) => {
    setMethod(next);
    setDiscount(null);
  }, []);

  const handlePay = useCallback(async () => {
    if (!config || !method) return;

    try {
      const session = await checkout.mutateAsync({
        planId,
        method,
        idempotencyKey,
        discountCode: discount?.code,
        returnPath: `/checkout/${planId}`
      });

      // The server re-resolved the code; render what it actually applied.
      setDiscount(session.discount);
      setPaymentId(session.paymentId);

      if (!session.handoff) {
        // The server replayed an already-paid order.
        return;
      }

      if (session.handoff.kind === "QR") {
        setQrHandoff(session.handoff);
        return;
      }

      const outcome = await openGateway(session.handoff, {
        amount: session.amount,
        currency: session.currency,
        description: config.plan.name
      });

      if (outcome.kind === "completed") {
        // Advisory: hand the gateway's claim to the server and render its
        // answer, not the claim.
        await verify.mutateAsync({
          paymentId: session.paymentId,
          data: {
            providerPaymentId: outcome.providerPaymentId,
            providerOrderId: outcome.providerOrderId,
            signature: outcome.signature
          }
        });
      } else if (outcome.kind === "failed") {
        toast.error({ title: "Could not open checkout", message: outcome.message });
      }
      // "dismissed" deliberately does nothing: closing the modal does not mean
      // the payment failed, and the poll will find out either way.
    } catch (mutationError) {
      toast.error({
        title: "Checkout could not be opened",
        message: (mutationError as Error).message
      });
    }
  }, [
    checkout,
    config,
    discount?.code,
    idempotencyKey,
    method,
    planId,
    toast,
    verify
  ]);

  const handleRetry = useCallback(async () => {
    if (!paymentId) return;
    try {
      const session = await retry.mutateAsync({
        paymentId,
        method: method ?? undefined
      });
      setPaymentId(session.paymentId);

      if (session.handoff && session.handoff.kind !== "QR") {
        const outcome = await openGateway(session.handoff, {
          amount: session.amount,
          currency: session.currency,
          description: config?.plan.name ?? "NexaChess"
        });
        if (outcome.kind === "completed") {
          await verify.mutateAsync({
            paymentId: session.paymentId,
            data: {
              providerPaymentId: outcome.providerPaymentId,
              providerOrderId: outcome.providerOrderId,
              signature: outcome.signature
            }
          });
        }
      } else if (session.handoff?.kind === "QR") {
        setQrHandoff(session.handoff);
      }
    } catch (mutationError) {
      toast.error({
        title: "Could not start another attempt",
        message: (mutationError as Error).message
      });
    }
  }, [config?.plan.name, method, paymentId, retry, toast, verify]);

  if (isLoading) {
    return <Skeleton className="mx-auto h-[520px] w-full max-w-lg" />;
  }

  if (error || !config) {
    return (
      <WidgetError
        message="We could not load this plan."
        onRetry={() => void refetch()}
      />
    );
  }

  if (config.methods.length === 0) {
    return (
      <EmptyState
        description="No payment gateway is available right now. Please try again shortly, or contact the academy."
        title="Payments are unavailable"
      />
    );
  }

  const busy = checkout.isPending || verify.isPending;

  // Mirrors the server: tax is charged on the DISCOUNTED subtotal, so a code
  // reduces the tax too rather than being applied after it.
  const discountedSubtotal = config.subtotal - (discount?.amount ?? 0);
  const taxAmount =
    config.taxPercent > 0 ? percentOf(discountedSubtotal, config.taxPercent) : 0;
  const total = discountedSubtotal + taxAmount;

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      {status ? (
        <PaymentStatusCard
          checking={checking}
          onCheckStatus={() => void refetchStatus()}
          onRetry={handleRetry}
          retrying={retry.isPending}
          status={status}
        />
      ) : null}

      {status?.accessGranted ? (
        <Button
          fullWidth
          onClick={() => router.push("/student/billing")}
          type="button"
          variant="primary"
        >
          View your invoice
        </Button>
      ) : null}

      {qrHandoff && paymentId ? (
        <UpiQrPanel
          amount={config.total}
          currency={config.currency}
          handoff={qrHandoff}
          onClose={() => setQrHandoff(null)}
          paymentId={paymentId}
        />
      ) : null}

      {!status?.accessGranted && !qrHandoff ? (
        <Card className="p-5 sm:p-6">
          <header className="mb-5 border-b border-app-border pb-4">
            <h1 className="text-lg font-bold text-app-text">
              {config.plan.name}
            </h1>
            <p className="mt-1 text-2xl font-bold text-primary-ink">
              {formatMoney(config.plan.amount, config.currency)}
              {isRecurringInterval(config.plan.interval) ? (
                <span className="text-sm font-semibold text-app-muted">
                  {" / "}
                  {BILLING_INTERVAL_LABELS[config.plan.interval].toLowerCase()}
                </span>
              ) : null}
            </p>
            {config.plan.description ? (
              <p className="mt-2 text-sm text-app-muted">
                {config.plan.description}
              </p>
            ) : null}
          </header>

          {config.recurring ? (
            <p className="mb-4 rounded-app border border-app-border bg-app-soft px-3 py-2 text-sm text-app-muted">
              This is a{" "}
              {BILLING_INTERVAL_LABELS[config.plan.interval].toLowerCase()}{" "}
              subscription. The gateway charges it each cycle until you cancel,
              and you can cancel any time from Billing.
            </p>
          ) : null}

          {config.alreadySubscribed ? (
            <p className="mb-4 rounded-app border border-secondary bg-secondary/10 px-3 py-2 text-sm text-secondary-ink">
              You already have an active subscription to this plan.
            </p>
          ) : null}

          {config.alreadyOwned ? (
            <p className="mb-4 rounded-app border border-accent bg-accent/10 px-3 py-2 text-sm text-accent-ink">
              You already have active access to this plan. Buying again will
              start a separate purchase.
            </p>
          ) : null}

          <PaymentMethodPicker
            disabled={busy || Boolean(status?.pending)}
            methods={config.methods}
            onChange={selectMethod}
            value={method}
          />

          <div className="mt-5 border-t border-app-border pt-4">
            <DiscountField
              applied={discount}
              currency={config.currency}
              disabled={busy || Boolean(status?.pending)}
              method={method}
              onApply={setDiscount}
              planId={planId}
            />
          </div>

          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-app-muted">Subtotal</dt>
              <dd className="text-app-text">
                {formatMoney(config.subtotal, config.currency)}
              </dd>
            </div>
            {discount ? (
              <div className="flex justify-between">
                <dt className="text-accent-ink">Discount ({discount.code})</dt>
                <dd className="text-accent-ink">
                  -{formatMoney(discount.amount, config.currency)}
                </dd>
              </div>
            ) : null}
            {taxAmount > 0 ? (
              <div className="flex justify-between">
                <dt className="text-app-muted">
                  {config.taxLabel} ({config.taxPercent}%)
                </dt>
                <dd className="text-app-text">
                  {formatMoney(taxAmount, config.currency)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 text-base font-bold">
              <dt className="text-app-text">
                {config.recurring ? "Total per cycle" : "Total"}
              </dt>
              <dd className="text-app-text">
                {formatMoney(total, config.currency)}
              </dd>
            </div>
          </dl>

          <Button
            className="mt-5"
            disabled={!method || Boolean(status?.pending)}
            fullWidth
            isLoading={busy}
            onClick={() => void handlePay()}
            size="lg"
            type="button"
            variant="primary"
          >
            <Lock className="size-4" strokeWidth={2.5} />
            {status?.pending
              ? "Payment in progress"
              : `Pay ${formatMoney(total, config.currency)} securely`}
          </Button>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-app-muted">
            <ShieldCheck aria-hidden className="size-3.5" strokeWidth={2.5} />
            Card and UPI details are entered on the payment gateway. NexaChess
            never sees them.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
