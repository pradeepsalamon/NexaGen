"use client";

import { useState, type ChangeEvent } from "react";
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
import { Select } from "@/components/ui/Select";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import {
  useManualBatchPlans,
  useManualBatchStudents,
  useOfflineMethods,
  useRecordManualPayment
} from "../hooks/usePaymentsApi";

const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

type Props = {
  /** "admin" can pick any batch/student; "coach" only sees their own batches. */
  scope: "admin" | "coach";
  onClose: () => void;
};

/**
 * Records cash / personal UPI-GPay / bank transfer for tracking (§3.6f-adjacent
 * manual payments). An admin's submission grants access immediately; a coach's
 * sits PENDING until an admin approves it — the toast below reflects whichever
 * happened, driven by the record's returned status rather than the caller's role,
 * so the form itself doesn't need to special-case it.
 *
 * Split into two thin wrappers so each only fetches the batch list it is
 * allowed to see — an admin's `/batches` and a coach's `/coach/batches` are
 * different endpoints with different scoping, and React's rules of hooks
 * mean the choice can't be made inside one hook call.
 */
export function RecordManualPaymentDialog({ scope, onClose }: Props) {
  return scope === "admin" ? (
    <AdminManualPaymentForm onClose={onClose} />
  ) : (
    <CoachManualPaymentForm onClose={onClose} />
  );
}

function AdminManualPaymentForm({ onClose }: { onClose: () => void }) {
  const { data } = useBatchesQuery();
  return (
    <ManualPaymentForm batches={data?.batches ?? []} onClose={onClose} scope="admin" />
  );
}

function CoachManualPaymentForm({ onClose }: { onClose: () => void }) {
  const { data } = useCoachBatches();
  return (
    <ManualPaymentForm batches={data?.batches ?? []} onClose={onClose} scope="coach" />
  );
}

function ManualPaymentForm({
  batches,
  scope,
  onClose
}: {
  batches: { id: string; name: string }[];
  scope: "admin" | "coach";
  onClose: () => void;
}) {
  const [batchId, setBatchId] = useState("");
  const [planId, setPlanId] = useState("");
  const [studentUserId, setStudentUserId] = useState("");
  const [methodId, setMethodId] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const { data: plansData } = useManualBatchPlans(batchId || null);
  const { data: studentsData } = useManualBatchStudents(batchId || null);
  const { data: methodsData } = useOfflineMethods();
  const record = useRecordManualPayment();

  const plans = plansData?.plans ?? [];
  const students = studentsData?.students ?? [];
  const methods = methodsData?.methods ?? [];
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null;

  const canSubmit = Boolean(batchId && planId && studentUserId && methodId);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0] ?? null;
    if (picked && picked.size > ATTACHMENT_MAX_BYTES) {
      setFile(null);
      setFileError("That file is larger than 8 MB.");
      event.target.value = "";
      return;
    }
    setFileError(null);
    setFile(picked);
  };

  const handleSubmit = () => {
    record.mutate(
      {
        data: {
          studentUserId,
          planId,
          methodId,
          reference: reference.trim() || undefined,
          idempotencyKey
        },
        file: file ?? undefined
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a manual payment</DialogTitle>
          <DialogDescription>
            {scope === "coach"
              ? "For cash, personal UPI/GPay or a bank transfer collected outside the app. An admin reviews it before the student gets access."
              : "For cash, personal UPI/GPay or a bank transfer collected outside the app. This grants access immediately."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="manual-batch">Batch</Label>
            <Select
              id="manual-batch"
              onChange={(event) => {
                setBatchId(event.target.value);
                setPlanId("");
                setStudentUserId("");
              }}
              options={batches.map((batch) => ({ label: batch.name, value: batch.id }))}
              placeholder="Select a batch"
              value={batchId}
            />
          </div>

          <div>
            <Label htmlFor="manual-plan">Plan</Label>
            <Select
              disabled={!batchId}
              id="manual-plan"
              onChange={(event) => setPlanId(event.target.value)}
              options={plans.map((plan) => ({
                label: `${plan.name} — ${formatMoney(plan.amount, plan.currency)}`,
                value: plan.id
              }))}
              placeholder={batchId ? "Select a plan" : "Select a batch first"}
              value={planId}
            />
          </div>

          <div>
            <Label htmlFor="manual-student">Student</Label>
            <Select
              disabled={!batchId}
              id="manual-student"
              onChange={(event) => setStudentUserId(event.target.value)}
              options={students.map((student) => ({
                label: `${student.name} (${student.email})`,
                value: student.id
              }))}
              placeholder={batchId ? "Select a student" : "Select a batch first"}
              value={studentUserId}
            />
          </div>

          <div>
            <Label htmlFor="manual-method">Payment method</Label>
            <Select
              id="manual-method"
              onChange={(event) => setMethodId(event.target.value)}
              options={methods.map((method) => ({
                label: method.label,
                value: method.id
              }))}
              placeholder="Select a method"
              value={methodId}
            />
          </div>

          <div>
            <Label htmlFor="manual-reference">Reference (optional)</Label>
            <Input
              id="manual-reference"
              onChange={(event) => setReference(event.target.value)}
              placeholder="UPI transaction ID, cheque number, a note…"
              value={reference}
            />
          </div>

          <div>
            <Label htmlFor="manual-attachment">Proof of payment (optional)</Label>
            <input
              accept={ATTACHMENT_ACCEPT}
              className="block w-full text-sm text-app-muted file:mr-3 file:rounded-control file:border-0 file:bg-app-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-app-text hover:file:bg-app-border"
              id="manual-attachment"
              onChange={handleFileChange}
              type="file"
            />
            <p className="mt-1 text-xs text-app-muted">
              A screenshot or PDF receipt, up to 8 MB.
            </p>
            {fileError ? (
              <p className="mt-1 text-xs text-app-danger-ink">{fileError}</p>
            ) : null}
          </div>

          {selectedPlan ? (
            <p className="rounded-control bg-app-soft px-3 py-2 text-sm text-app-text">
              Recording {formatMoney(selectedPlan.amount, selectedPlan.currency)}{" "}
              for {selectedPlan.name}.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            isLoading={record.isPending}
            onClick={handleSubmit}
            type="button"
            variant="primary"
          >
            {scope === "coach" ? "Submit for approval" : "Record payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
