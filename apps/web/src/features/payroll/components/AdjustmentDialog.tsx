"use client";

import { useState } from "react";
import { formatMoney, toMinorUnits, type PayrollAdjustmentType } from "@nexa-chess/types";
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
import { useCreatePayrollAdjustment } from "../hooks/usePayrollApi";

type Props = {
  recordId: string;
  coachName: string;
  currency: string;
  onClose: () => void;
};

/** Manual earning/deduction on a payroll record (§9). */
export function AdjustmentDialog({ recordId, coachName, currency, onClose }: Props) {
  const create = useCreatePayrollAdjustment();

  const [type, setType] = useState<PayrollAdjustmentType>("EARNING");
  const [description, setDescription] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [reason, setReason] = useState("");

  const amountMinor = toMinorUnits(Number(amountMajor) || 0, currency);
  const canSubmit = description.trim().length > 0 && amountMinor > 0 && reason.trim().length > 0;

  const handleSubmit = () => {
    create.mutate(
      {
        recordId,
        body: { type, description: description.trim(), amountMinor, reason: reason.trim() }
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add adjustment — {coachName}</DialogTitle>
          <DialogDescription>
            Added on top of the calculated amount. Reversible, never silently edited —
            this becomes a permanent, auditable line on this coach&apos;s payroll record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="adjustment-type">Type</Label>
            <Select
              id="adjustment-type"
              onChange={(event) => setType(event.target.value as PayrollAdjustmentType)}
              options={[
                { label: "Earning (adds to net payable)", value: "EARNING" },
                { label: "Deduction (subtracts from net payable)", value: "DEDUCTION" }
              ]}
              value={type}
            />
          </div>

          <div>
            <Label htmlFor="adjustment-description">Description</Label>
            <Input
              id="adjustment-description"
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tournament coaching, travel allowance, advance…"
              value={description}
            />
          </div>

          <div>
            <Label htmlFor="adjustment-amount">Amount ({currency})</Label>
            <Input
              id="adjustment-amount"
              inputMode="decimal"
              min={0}
              onChange={(event) => setAmountMajor(event.target.value)}
              step="0.01"
              type="number"
              value={amountMajor}
            />
          </div>

          <div>
            <Label htmlFor="adjustment-reason">Reason</Label>
            <Textarea
              id="adjustment-reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why is this being added? This is kept on the audit trail."
              rows={2}
              value={reason}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit} isLoading={create.isPending} onClick={handleSubmit} type="button">
            Add {amountMinor > 0 ? formatMoney(amountMinor, currency) : ""} {type.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
