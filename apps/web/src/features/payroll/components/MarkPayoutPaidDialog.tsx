"use client";

import { useState } from "react";
import { formatMoney } from "@nexa-chess/types";
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
import { useMarkPayoutPaid } from "../hooks/usePayrollApi";

type Props = {
  payoutId: string;
  amountMinor: number;
  currency: string;
  onClose: () => void;
};

/** §22's "Mark as Paid Manually" — no bank-transfer integration yet. */
export function MarkPayoutPaidDialog({ payoutId, amountMinor, currency, onClose }: Props) {
  const markPaid = useMarkPayoutPaid();

  const [reference, setReference] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  const canSubmit = reference.trim().length > 0 && method.trim().length > 0 && paidAt.length > 0;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark payout paid — {formatMoney(amountMinor, currency)}</DialogTitle>
          <DialogDescription>
            Records that this was paid outside NexaChess. There is no bank-transfer
            integration yet — this is the paper trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="payout-reference">Payment reference</Label>
            <Input
              id="payout-reference"
              onChange={(event) => setReference(event.target.value)}
              placeholder="UTR / transaction ID"
              value={reference}
            />
          </div>
          <div>
            <Label htmlFor="payout-method">Method</Label>
            <Input
              id="payout-method"
              onChange={(event) => setMethod(event.target.value)}
              placeholder="Bank transfer, UPI, cash…"
              value={method}
            />
          </div>
          <div>
            <Label htmlFor="payout-date">Payment date</Label>
            <Input
              id="payout-date"
              onChange={(event) => setPaidAt(event.target.value)}
              type="date"
              value={paidAt}
            />
          </div>
          <div>
            <Label htmlFor="payout-notes">Notes (optional)</Label>
            <Textarea
              id="payout-notes"
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              value={notes}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            isLoading={markPaid.isPending}
            onClick={() =>
              markPaid.mutate(
                {
                  id: payoutId,
                  body: {
                    reference: reference.trim(),
                    method: method.trim(),
                    paidAt: new Date(paidAt).toISOString(),
                    notes: notes.trim() || undefined
                  }
                },
                { onSuccess: onClose }
              )
            }
            type="button"
          >
            Mark paid
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
