"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApprovalStudentOption, CoachBatch, CoachStudent } from "@nexa-chess/types";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { searchStudentOptions } from "../api/approvalsApi";
import { RequestApprovalDialog } from "./RequestApprovalDialog";

const MIN_SEARCH_LENGTH = 2;

/** A coach asks to add a student to their batch; students are found by typing a name. */
export function AddStudentRequestDialog({
  batch,
  onClose
}: {
  batch: Pick<CoachBatch, "id" | "name"> | null;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [student, setStudent] = useState<ApprovalStudentOption | null>(null);
  const query = useDebouncedValue(search.trim());

  useEffect(() => {
    setSearch("");
    setStudent(null);
  }, [batch?.id]);

  const { data, isFetching } = useQuery({
    enabled: !!batch && query.length >= MIN_SEARCH_LENGTH,
    queryFn: () => searchStudentOptions(query),
    queryKey: queryKeys.approvals.studentOptions(query)
  });
  const results = query.length >= MIN_SEARCH_LENGTH ? (data?.students ?? []) : [];

  return (
    <RequestApprovalDialog
      actionType="BATCH_STUDENT_ENROL"
      canSubmit={!!student}
      description="An admin has to approve adding a student. The student joins the batch only once it's approved."
      onOpenChange={(open) => !open && onClose()}
      open={!!batch}
      payload={{ batchId: batch?.id ?? "", studentId: student?.id ?? "" }}
      submitLabel="Ask an admin"
      title={`Add a student to ${batch?.name ?? "this batch"}`}
    >
      <FormField id="enrol-student" label="Student">
        <Input
          autoComplete="off"
          id="enrol-student"
          onChange={(e) => {
            setSearch(e.target.value);
            setStudent(null);
          }}
          placeholder="Type a name or username"
          value={search}
        />
      </FormField>
      {query.length >= MIN_SEARCH_LENGTH ? (
        <ul className="max-h-44 space-y-1 overflow-y-auto" aria-label="Matching students">
          {results.map((option) => (
            <li key={option.id}>
              <button
                aria-pressed={student?.id === option.id}
                className={cn(
                  "w-full break-words rounded-control border px-3 py-2 text-left text-sm transition-colors",
                  student?.id === option.id
                    ? "border-primary bg-primary/10 text-app-text"
                    : "border-app-border text-app-text hover:bg-app-soft"
                )}
                onClick={() => setStudent(option)}
                type="button"
              >
                <span className="font-semibold">{option.name}</span>
                {option.username ? <span className="ml-2 text-app-muted">@{option.username}</span> : null}
              </button>
            </li>
          ))}
          {results.length === 0 && !isFetching ? (
            <li className="px-1 py-2 text-sm text-app-muted">No active student matches that.</li>
          ) : null}
        </ul>
      ) : null}
    </RequestApprovalDialog>
  );
}

type Change = "REMOVE" | "TRANSFER";

/**
 * A coach asks to take a student out of a batch or move them to another of the
 * coach's own batches (a move into someone else's batch is an admin's roster edit).
 */
export function ChangeStudentBatchDialog({
  student,
  batches,
  onClose
}: {
  student: CoachStudent | null;
  batches: Pick<CoachBatch, "id" | "name" | "status">[];
  onClose: () => void;
}) {
  const [change, setChange] = useState<Change>("REMOVE");
  const [fromBatchId, setFromBatchId] = useState("");
  const [toBatchId, setToBatchId] = useState("");

  useEffect(() => {
    setChange("REMOVE");
    setFromBatchId(student?.batches[0]?.id ?? "");
    setToBatchId("");
  }, [student]);

  const destinations = batches.filter(
    (batch) => batch.status !== "ARCHIVED" && !student?.batches.some((own) => own.id === batch.id)
  );
  const isTransfer = change === "TRANSFER";
  const name = student ? `${student.firstName} ${student.lastName ?? ""}`.trim() : "";

  return (
    <RequestApprovalDialog
      actionType={isTransfer ? "BATCH_STUDENT_TRANSFER" : "BATCH_STUDENT_REMOVE"}
      canSubmit={!!fromBatchId && (!isTransfer || !!toBatchId)}
      description="An admin has to approve this. Nothing changes for the student until it's approved."
      onOpenChange={(open) => !open && onClose()}
      open={!!student}
      payload={
        isTransfer
          ? { fromBatchId, studentId: student?.id ?? "", toBatchId }
          : { batchId: fromBatchId, studentId: student?.id ?? "" }
      }
      submitLabel="Ask an admin"
      title={`Change ${name}'s batch`}
    >
      <FormField id="batch-change-kind" label="What should change">
        <Select
          id="batch-change-kind"
          onChange={(e) => setChange(e.target.value as Change)}
          options={[
            { label: "Remove from a batch", value: "REMOVE" },
            { disabled: destinations.length === 0, label: "Move to another of my batches", value: "TRANSFER" }
          ]}
          value={change}
        />
      </FormField>
      <FormField id="batch-change-from" label={isTransfer ? "From" : "Batch"}>
        <Select
          id="batch-change-from"
          onChange={(e) => setFromBatchId(e.target.value)}
          options={(student?.batches ?? []).map((batch) => ({ label: batch.name, value: batch.id }))}
          value={fromBatchId}
        />
      </FormField>
      {isTransfer ? (
        <FormField id="batch-change-to" label="To">
          <Select
            id="batch-change-to"
            onChange={(e) => setToBatchId(e.target.value)}
            options={destinations.map((batch) => ({ label: batch.name, value: batch.id }))}
            placeholder="Choose a batch"
            value={toBatchId}
          />
        </FormField>
      ) : null}
    </RequestApprovalDialog>
  );
}
