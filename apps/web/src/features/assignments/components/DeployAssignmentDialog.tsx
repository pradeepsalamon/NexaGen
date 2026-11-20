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
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
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
  const [errors, setErrors] = useState<{ batches?: string; dueDate?: string }>({});

  useEffect(() => {
    if (open) {
      setBatchIds([]);
      setDueDate("");
      setErrors({});
    }
  }, [open]);

  const submit = () => {
    if (!assignment) return;
    const next = {
      batches: batchIds.length === 0 ? "Select at least one batch" : undefined,
      dueDate: dueDate ? undefined : "Pick a due date"
    };
    setErrors(next);
    if (next.batches || next.dueDate) return;
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
          <div className="relative grid gap-2" role="group" aria-labelledby="deploy-batches-label" aria-describedby={errors.batches ? fieldErrorId("deploy-batches") : undefined}>
            <p className="text-sm font-medium text-app-text" id="deploy-batches-label">Batches</p>
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
                    onCheckedChange={(v) => {
                      setBatchIds((prev) =>
                        v === true ? [...prev, batch.id] : prev.filter((id) => id !== batch.id)
                      );
                      setErrors((current) => ({ ...current, batches: undefined }));
                    }}
                  />
                ))}
              </div>
            )}
            <FieldError id="deploy-batches" message={errors.batches} />
          </div>

          <FormField error={errors.dueDate} id="deploy-dueDate" label="Due date">
            <DatePicker
              id="deploy-dueDate"
              withTime
              value={dueDate ? new Date(dueDate) : undefined}
              onChange={(date) => {
                setDueDate(date ? date.toISOString() : "");
                setErrors((current) => ({ ...current, dueDate: undefined }));
              }}
            />
          </FormField>

        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)} disabled={deployMutation.isPending}>
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
