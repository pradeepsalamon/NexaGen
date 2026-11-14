"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { attendanceCorrectionStatusSchema, type AttendanceCorrectionStatus } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { RequestApprovalDialog } from "@/features/approvals/components/RequestApprovalDialog";
import { enumLabel } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { correctStudentAttendance } from "../../api/attendanceApi";

export type CorrectionTarget = { id: string; name: string; status: string };

function StatusField({
  current,
  onChange,
  value
}: {
  current: string;
  onChange: (next: AttendanceCorrectionStatus | "") => void;
  value: AttendanceCorrectionStatus | "";
}) {
  return (
    <FormField id="attendance-status" label="Correct status">
      <Select
        id="attendance-status"
        onChange={(e) => onChange(e.target.value as AttendanceCorrectionStatus | "")}
        options={attendanceCorrectionStatusSchema.options
          .filter((status) => status !== current)
          .map((status) => ({ label: enumLabel(status), value: status }))}
        placeholder="Choose a status"
        value={value}
      />
    </FormField>
  );
}

/** A coach asks an admin to correct a student's attendance in their own class. */
export function RequestAttendanceCorrectionDialog({
  classId,
  student,
  onClose
}: {
  classId: string;
  student: CorrectionTarget | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<AttendanceCorrectionStatus | "">("");
  useEffect(() => setStatus(""), [student?.id]);

  return (
    <RequestApprovalDialog
      actionType="ATTENDANCE_CORRECTION"
      canSubmit={!!status}
      description="An admin has to approve this. The attendance stays as it is until then."
      onOpenChange={(open) => !open && onClose()}
      open={!!student}
      payload={{ classId, status, studentId: student?.id ?? "" }}
      submitLabel="Ask an admin"
      title={`Correct ${student?.name ?? "attendance"}`}
    >
      <StatusField current={student?.status ?? ""} onChange={setStatus} value={status} />
    </RequestApprovalDialog>
  );
}

/** An admin corrects a student's attendance directly; the change and reason are audited. */
export function CorrectAttendanceDialog({
  classId,
  student,
  onClose,
  onCorrected
}: {
  classId: string;
  student: CorrectionTarget | null;
  onClose: () => void;
  onCorrected?: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<AttendanceCorrectionStatus | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("");
    setReason("");
    setError(null);
  }, [student?.id]);

  const mutation = useMutation({
    mutationFn: () =>
      correctStudentAttendance(classId, student!.id, {
        reason: reason.trim(),
        status: status as AttendanceCorrectionStatus
      }),
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't correct the attendance."),
    onSuccess: () => {
      toast.success({ title: "Attendance corrected", message: `${student?.name ?? "The student"} is updated.` });
      onCorrected?.();
      onClose();
    }
  });

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={!!student}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="px-6 sm:pl-0">{`Correct ${student?.name ?? "attendance"}`}</DialogTitle>
          <DialogDescription>
            The status changes and stays changed. The measured time in class is kept, and the audit log records who
            did this and why.
          </DialogDescription>
        </DialogHeader>
        <StatusField current={student?.status ?? ""} onChange={setStatus} value={status} />
        <FormField error={error ?? undefined} id="attendance-reason" label="Reason">
          <Textarea
            id="attendance-reason"
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            value={reason}
          />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!status || reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
            type="button"
            variant="primary"
          >
            {mutation.isPending ? "Saving…" : "Correct attendance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
