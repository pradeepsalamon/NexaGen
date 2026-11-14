"use client";

import { useState } from "react";
import {
  CREDIT_NOTE_REASON_LABELS,
  formatMoney,
  toMajorUnits,
  toMinorUnits,
  type CreditNoteReason
} from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
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
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateCreditNote } from "../hooks/useInvoicesApi";
import { Switch } from "@/components/ui/Switch";

const REASONS = Object.keys(CREDIT_NOTE_REASON_LABELS) as CreditNoteReason[];

type Props = {
  currency: string;
  invoiceId: string;
  invoiceNumber: string;
  /** Minor units still uncredited on this invoice. */
  maxAmount: number;
  onClose: () => void;
};

/**
 * Issues a credit note against an invoice (§19).
 *
 * Deliberately not an undo-able toast: a credit note is an accounting document
 * with its own permanent number, and the safeguard is this dialog rather than a
 * five-second window. The original invoice is never modified.
 *
 * The admin types major units (rupees); `toMinorUnits` is the one conversion.
 */
export function CreditNoteDialog({
  currency,
  invoiceId,
  invoiceNumber,
  maxAmount,
  onClose
}: Props) {
  const createCreditNote = useCreateCreditNote();

  const [full, setFull] = useState(true);
  const [amountMajor, setAmountMajor] = useState(
    String(toMajorUnits(maxAmount, currency))
  );
  const [reason, setReason] = useState<CreditNoteReason>("REFUND");
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amountMinor = full
    ? maxAmount
    : toMinorUnits(Number(amountMajor || 0), currency);

  const invalid =
    !full && (amountMinor <= 0 || amountMinor > maxAmount || !amountMajor);

  const submit = async () => {
    setSubmitError(null);
    try {
      await createCreditNote.mutateAsync({
        invoiceId,
        amount: full ? undefined : amountMinor,
        reason,
        note: note.trim() || undefined
      });
      onClose();
    } catch (error) {
      // Stay open so the admin can correct the amount and retry.
      setSubmitError(error instanceof Error ? error.message : "The credit note could not be issued.");
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue a credit note</DialogTitle>
          <DialogDescription>
            Against invoice {invoiceNumber}. The invoice itself stays exactly as
            issued — the credit note is a separate, numbered document that
            records the reversal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={full}
              id="credit-full"
              onCheckedChange={(checked) => setFull(checked === true)}
            />
            <Label htmlFor="credit-full">
              Credit the full remaining {formatMoney(maxAmount, currency)}
            </Label>
          </div>

          {!full ? (
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">Amount ({currency})</Label>
              <Input
                id="credit-amount"
                max={toMajorUnits(maxAmount, currency)}
                min={0}
                onChange={(event) => {
                  setAmountMajor(event.target.value);
                  setSubmitError(null);
                }}
                step="0.01"
                type="number"
                value={amountMajor}
              />
              <p className="text-xs text-app-muted">
                Up to {formatMoney(maxAmount, currency)}. Tax is reversed in the
                same proportion it was originally charged.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="credit-reason">Reason</Label>
            <Select
              id="credit-reason"
              onChange={(event) =>
                setReason(event.target.value as CreditNoteReason)
              }
              options={REASONS.map((value) => ({
                label: CREDIT_NOTE_REASON_LABELS[value],
                value
              }))}
              value={reason}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-note">Note (optional)</Label>
            <Textarea
              id="credit-note"
              onChange={(event) => setNote(event.target.value)}
              placeholder="Appears on the credit note and in the audit trail."
              rows={3}
              value={note}
            />
          </div>
        </div>

        {submitError ? <Alert variant="error">{submitError}</Alert> : null}

        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={invalid || createCreditNote.isPending}
            onClick={submit}
            variant="primary"
          >
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
