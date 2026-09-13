"use client";

import { Loader2, X } from "lucide-react";
import { formatMoney, type CheckoutHandoff } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { usePaymentStatus } from "../hooks/usePaymentsApi";

type Props = {
  handoff: CheckoutHandoff;
  paymentId: string;
  amount: number;
  currency: string;
  onClose: () => void;
};

/**
 * The UPI QR flow (§6).
 *
 * The QR image comes from the gateway — we never construct a UPI collect
 * request ourselves. The panel polls the server for the real state, and the
 * "I have completed payment" button does exactly one thing: ask the server
 * again. It cannot mark anything paid, which is the whole point.
 */
export function UpiQrPanel({
  handoff,
  paymentId,
  amount,
  currency,
  onClose
}: Props) {
  const { data: status, isFetching, refetch } = usePaymentStatus(paymentId, {
    poll: true
  });

  const settled = status && !status.pending;

  return (
    <Card className="p-5 text-center sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3 text-left">
        <div>
          <h2 className="text-base font-bold text-app-text">
            Scan with any supported UPI app
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            Paying {formatMoney(amount, currency)}
          </p>
        </div>

        <SimpleTooltip label="Close the QR and go back">
          <Button
            aria-label="Close the QR code"
            className="size-8 rounded-full border-app-border p-0 hover:bg-app-soft"
            onClick={onClose}
            size="icon"
            type="button"
            variant="outline"
          >
            <X className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>

      {handoff.qrImageUrl ? (
        // A plain <img>, not next/image: the gateway hands us a data URL or a
        // one-off host, and re-encoding a QR through an optimiser risks making
        // it unscannable.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt="UPI QR code for this payment"
          className="mx-auto aspect-square w-full max-w-[240px] rounded-app border border-app-border bg-white p-3"
          src={handoff.qrImageUrl}
        />
      ) : (
        <p className="rounded-app bg-app-soft p-6 text-sm text-app-muted">
          The gateway did not return a QR code. Close this and choose another
          payment method.
        </p>
      )}

      {handoff.qrPayload ? (
        <a
          className="mt-3 inline-block text-sm font-semibold text-primary underline sm:hidden"
          href={handoff.qrPayload}
        >
          Open your UPI app instead
        </a>
      ) : null}

      <p
        aria-live="polite"
        className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-app-text"
      >
        {settled ? (
          status?.message
        ) : (
          <>
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Waiting for payment…
          </>
        )}
      </p>

      {!settled ? (
        <p className="mt-1 text-xs text-app-muted">
          Do not close this window. We will update as soon as your bank
          confirms.
        </p>
      ) : null}

      {/*
        Status check only. It re-reads the payment from the gateway server-side
        and renders the answer — it never marks the payment successful.
      */}
      <Button
        className="mt-4"
        isLoading={isFetching}
        onClick={() => void refetch()}
        type="button"
        variant="outline"
      >
        I have completed payment
      </Button>
    </Card>
  );
}
