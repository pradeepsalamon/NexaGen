"use client";

import { useEffect, useState } from "react";
import type { AssignmentLibraryItem, CoachBatch } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { useDeployAssignment } from "../hooks/useAssignmentsApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: AssignmentLibraryItem | null;
  coachBatches: CoachBatch[];
}

export function DeployAssignmentDialog({ open, onOpenChange, assignment, coachBatches }: Props) {
  const deployMutation = useDeployAssignment();
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setBatchIds([]);
      setDueDate("");
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (!assignment) return;
    if (batchIds.length === 0) {
      setError("Select at least one batch.");
      return;
    }
    if (!dueDate) {
      setError("Pick a due date.");
      return;
    }
    deployMutation.mutate(
      { assignmentId: assignment.id, batchIds, dueDate },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Assign to batches</DialogTitle>
          <DialogDescription>
            {assignment ? `"${assignment.title}" will be sent to every student in the selected batches.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <p className="text-sm font-medium text-app-text">Batches</p>
            {coachBatches.length === 0 ? (
              <p className="text-sm text-app-muted">You are not assigned to any batches yet.</p>
            ) : (
              <div className="grid gap-1.5">
                {coachBatches.map((batch) => (
                  <Checkbox
                    key={batch.id}
                    id={`deploy-batch-${batch.id}`}
                    label={batch.name}
                    checked={batchIds.includes(batch.id)}
                    onCheckedChange={(v) =>
                      setBatchIds((prev) =>
                        v === true ? [...prev, batch.id] : prev.filter((id) => id !== batch.id)
                      )
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <FormField id="deploy-dueDate" label="Due date">
            <DatePicker
              withTime
              value={dueDate ? new Date(dueDate) : undefined}
              onChange={(date) => setDueDate(date ? date.toISOString() : "")}
            />
          </FormField>

          {error && <p className="text-sm font-medium text-app-danger-ink">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deployMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={deployMutation.isPending || coachBatches.length === 0}
          >
            {deployMutation.isPending ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
