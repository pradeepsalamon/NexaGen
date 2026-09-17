"use client";

import { useState } from "react";
import { PAYROLL_PERIOD_TYPE_LABELS, type PayrollPeriodType } from "@nexa-chess/types";
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
import { useCreatePayrollPeriod } from "../hooks/usePayrollApi";

const PERIOD_TYPES = Object.keys(PAYROLL_PERIOD_TYPE_LABELS) as PayrollPeriodType[];

export function CreatePeriodDialog({ onClose }: { onClose: () => void }) {
  const create = useCreatePayrollPeriod();

  const [periodType, setPeriodType] = useState<PayrollPeriodType>("MONTHLY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const canSubmit = Boolean(startDate && endDate && endDate > startDate);

  const handleSubmit = () => {
    create.mutate(
      { periodType, startDate, endDate, notes: notes.trim() || undefined },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create payroll period</DialogTitle>
          <DialogDescription>
            Covers every coach with a class or a compensation profile in this date
            range. Nothing is calculated until you run it from the period&apos;s page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="period-type">Period type</Label>
            <Select
              id="period-type"
              onChange={(event) => setPeriodType(event.target.value as PayrollPeriodType)}
              options={PERIOD_TYPES.map((type) => ({
                label: PAYROLL_PERIOD_TYPE_LABELS[type],
                value: type
              }))}
              value={periodType}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="period-start">Start date</Label>
              <Input
                id="period-start"
                onChange={(event) => setStartDate(event.target.value)}
                type="date"
                value={startDate}
              />
            </div>
            <div>
              <Label htmlFor="period-end">End date</Label>
              <Input
                id="period-end"
                onChange={(event) => setEndDate(event.target.value)}
                type="date"
                value={endDate}
              />
            </div>
          </div>
          {startDate && endDate && endDate <= startDate ? (
            <p className="text-xs text-app-danger-ink">End date must be after start date.</p>
          ) : null}

          <div>
            <Label htmlFor="period-notes">Notes (optional)</Label>
            <Textarea
              id="period-notes"
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth noting about this run"
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
            isLoading={create.isPending}
            onClick={handleSubmit}
            type="button"
          >
            Create period
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
