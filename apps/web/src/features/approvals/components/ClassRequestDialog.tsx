"use client";

import { useEffect, useState } from "react";
import {
  classExtraPayloadSchema,
  classReschedulePayloadSchema,
  createApprovalRequestSchema,
  type ApprovalRequestResponse,
  type CoachBatch,
  type CoachClass,
  type CreateApprovalRequest
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
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
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { cancelApprovalRequest, createApprovalRequest } from "../api/approvalsApi";
import { APPROVAL_INVALIDATES } from "../hooks/useApprovals";

const DURATIONS = [
  { label: "30 minutes", value: "30" },
  { label: "45 minutes", value: "45" },
  { label: "60 minutes", value: "60" },
  { label: "90 minutes", value: "90" },
  { label: "120 minutes", value: "120" }
];

function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

/**
 * The coach's way to change the schedule: ask for an extra class for a batch,
 * or to move one scheduled class. Nothing changes until an admin approves.
 * Both are approval-engine requests (`CLASS_EXTRA` / `CLASS_RESCHEDULE`), so
 * they land in the admin inbox and the coach's own list.
 */
export function ClassRequestDialog({
  open,
  onOpenChange,
  batches,
  rescheduleClass
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: CoachBatch[];
  /** Set → a reschedule request for this class; unset → an extra-class request. */
  rescheduleClass?: CoachClass | null;
}) {
  const tz = useUserTimeZone();
  const isReschedule = !!rescheduleClass;
  const [batchId, setBatchId] = useState("");
  const [startsAt, setStartsAt] = useState<Date | undefined>(undefined);
  const [duration, setDuration] = useState("60");
  const [topic, setTopic] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReason("");
    setTopic("");
    if (rescheduleClass) {
      const mins = Math.round(
        (new Date(rescheduleClass.endsAt).getTime() - new Date(rescheduleClass.startsAt).getTime()) / 60000
      );
      setStartsAt(new Date(rescheduleClass.startsAt));
      setDuration(String(mins));
    } else {
      setBatchId(batches[0]?.id ?? "");
      setStartsAt(nextHour());
      setDuration("60");
    }
  }, [open, rescheduleClass, batches]);

  const { run, isPending } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (body: CreateApprovalRequest) => {
      const result = await createApprovalRequest(body);
      onOpenChange(false);
      return result;
    },
    undo: (_vars, result: ApprovalRequestResponse) => cancelApprovalRequest(result.request.id),
    toast: () => ({ title: "Request sent to the academy" }),
    invalidates: APPROVAL_INVALIDATES
  });

  const submit = () => {
    if (!startsAt) {
      setError("Pick a start time.");
      return;
    }
    const endsAt = new Date(startsAt.getTime() + Number(duration) * 60000);
    const window = { endsAt: endsAt.toISOString(), startsAt: startsAt.toISOString() };
    const payload = isReschedule
      ? classReschedulePayloadSchema.safeParse({ classId: rescheduleClass!.id, ...window })
      : classExtraPayloadSchema.safeParse({ batchId, ...window, topic: topic.trim() || undefined });
    if (!payload.success) {
      setError(payload.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    const parsed = createApprovalRequestSchema.safeParse({
      actionType: isReschedule ? "CLASS_RESCHEDULE" : "CLASS_EXTRA",
      payload: payload.data,
      reason: reason.trim()
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the details.");
      return;
    }
    setError(null);
    run(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isReschedule ? "Request a reschedule" : "Request an extra class"}</DialogTitle>
          <DialogDescription>
            {isReschedule
              ? `${rescheduleClass!.batchName} · currently ${formatDateTime(rescheduleClass!.startsAt, tz)}. The class moves only once an admin approves.`
              : "The academy schedules classes. An admin will review this and add the class if approved."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {!isReschedule ? (
            <FormField id="request-batch" label="Batch">
              <Select
                id="request-batch"
                value={batchId}
                onChange={(e) => setBatchId(e.target.value)}
                options={batches.map((b) => ({ label: b.name, value: b.id }))}
              />
            </FormField>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="request-start" label={isReschedule ? "New start time" : "Start time"}>
              <DatePicker withTime value={startsAt} onChange={(d) => setStartsAt(d ?? undefined)} />
            </FormField>
            <FormField id="request-duration" label="Duration">
              <Select
                id="request-duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                options={
                  DURATIONS.some((d) => d.value === duration)
                    ? DURATIONS
                    : [...DURATIONS, { label: `${duration} minutes`, value: duration }]
                }
              />
            </FormField>
          </div>

          {!isReschedule ? (
            <FormField id="request-topic" label="Topic (Optional)">
              <Input
                id="request-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Make-up: rook endings"
              />
            </FormField>
          ) : null}

          <FormField id="request-reason" label="Reason">
            <Textarea
              id="request-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isReschedule ? "e.g. Tournament that weekend" : "e.g. Make-up for the holiday"}
            />
          </FormField>

          {error ? <p className="text-sm text-app-danger-ink">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={isPending}>
            {isPending ? "Sending..." : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
