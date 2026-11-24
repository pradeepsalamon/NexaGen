"use client";

import { useRevealFormErrors } from "@/hooks/useRevealFormErrors";
import { useState } from "react";
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
import {
  formatMoney,
  toMajorUnits,
  toMinorUnits,
  type PaymentListItem
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { useRefundPayment } from "../hooks/usePaymentsApi";
import { Switch } from "@/components/ui/Switch";

type Props = {
  payment: PaymentListItem;
  onClose: () => void;
};

/**
 * Refund confirmation (§14).
 *
 * Refunds are a documented exclusion from the undo policy — money that has left
 * cannot be pulled back by a toast — so this dialog is the safeguard, and the
 * reason field is mandatory so the audit trail says why.
 *
 * The admin types major units (rupees); the API only ever speaks minor units,
 * and `toMinorUnits` is the single conversion.
 */
export function RefundDialog({ payment, onClose }: Props) {
  const refund = useRefundPayment();

  const refundable = payment.amount - payment.amountRefunded;
  const [full, setFull] = useState(true);
  const [amountMajor, setAmountMajor] = useState(
    String(toMajorUnits(refundable, payment.currency))
  );
  const [reason, setReason] = useState("");
  const [revokeAccess, setRevokeAccess] = useState(false);

  const parsedMinor = toMinorUnits(Number(amountMajor) || 0, payment.currency);
  const amountValid = full || (parsedMinor > 0 && parsedMinor <= refundable);
  const canSubmit = reason.trim().length > 0;
  // Checked when Refund is pressed, not while typing (UI_RULES § "Form errors").
  const [tried, setTried] = useState(false);
  const amountError =
    tried && !amountValid ? `Enter an amount between 0 and ${formatMoney(refundable, payment.currency)}` : undefined;
  useRevealFormErrors(amountError);

  const handleSubmit = () => {
    setTried(true);
    if (!amountValid) return;
    refund.mutate(
      {
        id: payment.id,
        data: {
          ...(full ? {} : { amount: parsedMinor }),
          reason: reason.trim(),
          revokeAccess
        }
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund {payment.orderNumber}</DialogTitle>
          <DialogDescription>
            {formatMoney(refundable, payment.currency)} can still be refunded on
            this payment. The gateway decides when it actually settles — this
            records the request and marks it complete only once the gateway
            confirms.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={full}
              onCheckedChange={(checked) => setFull(checked === true)}
            />
            Refund the full remaining balance (
            {formatMoney(refundable, payment.currency)})
          </label>

          {!full ? (
            <div className="relative">
              <Label htmlFor="refund-amount">
                Amount ({payment.currency})
              </Label>
              <Input
                aria-describedby={amountError ? fieldErrorId("refund-amount") : undefined}
                hasError={Boolean(amountError)}
                id="refund-amount"
                inputMode="decimal"
                max={toMajorUnits(refundable, payment.currency)}
                min={0}
                onChange={(event) => setAmountMajor(event.target.value)}
                step="0.01"
                type="number"
                value={amountMajor}
              />
              <FieldError id="refund-amount" message={amountError} />
            </div>
          ) : null}

          <div>
            <Label htmlFor="refund-reason">Reason</Label>
            <Textarea
              id="refund-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this being refunded? This is kept on the record."
              rows={3}
              value={reason}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <Switch
              checked={revokeAccess}
              onCheckedChange={(checked) => setRevokeAccess(checked === true)}
            />
            <span>
              Also revoke the access this payment granted.
              <span className="block text-xs text-app-muted">
                The student stays in their batch — removing them from a class
                they may already have attended is a separate, human decision.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            isLoading={refund.isPending}
            onClick={handleSubmit}
            type="button"
            variant="destructive"
          >
            Refund{" "}
            {formatMoney(full ? refundable : parsedMinor, payment.currency)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
