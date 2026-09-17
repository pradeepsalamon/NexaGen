"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { useReversePayrollAdjustment } from "../hooks/usePayrollApi";

type Props = {
  adjustmentId: string;
  recordId: string;
  description: string;
  onClose: () => void;
};

export function ReverseAdjustmentDialog({ adjustmentId, recordId, description, onClose }: Props) {
  const reverse = useReversePayrollAdjustment();
  const [reversalReason, setReversalReason] = useState("");

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse adjustment</DialogTitle>
          <DialogDescription>
            &quot;{description}&quot; stays on the record for audit — this adds a reversal
            marker rather than deleting it, and removes its amount from the totals.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="reversal-reason">Reason</Label>
          <Textarea
            id="reversal-reason"
            onChange={(event) => setReversalReason(event.target.value)}
            placeholder="Why is this being reversed?"
            rows={2}
            value={reversalReason}
          />
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={reversalReason.trim().length === 0}
            isLoading={reverse.isPending}
            onClick={() =>
              reverse.mutate(
                { id: adjustmentId, recordId, body: { reversalReason: reversalReason.trim() } },
                { onSuccess: onClose }
              )
            }
            type="button"
            variant="destructive"
          >
            Reverse
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
