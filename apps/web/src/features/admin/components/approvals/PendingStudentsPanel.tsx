"use client";

import { UserRoundCheck } from "lucide-react";
import type { PendingStudent, PendingStudentsResponse, UpdateStudentStatusRequest } from "@nexa-chess/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { updateStudentStatus } from "@/features/admin/api/adminApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { ApplicationCard, ApplicationListSkeleton } from "./ApplicationCard";
import { useHiddenIds } from "./useHiddenIds";

type ReviewVars = { student: PendingStudent; status: UpdateStudentStatusRequest["status"] };

export function PendingStudentsPanel({ data, isLoading }: { data?: PendingStudentsResponse; isLoading: boolean }) {
  const tz = useUserTimeZone();
  const { hiddenIds, toggle } = useHiddenIds();

  // Deferred: approval sends the "account approved" message, which can't be unsent.
  const review = useUndoableMutation<ReviewVars, { ok: boolean }>({
    strategy: "defer",
    mutationFn: ({ student, status }) => updateStudentStatus({ id: student.id, status }),
    undo: async () => {},
    toast: ({ student, status }) => ({
      title: status === "ACTIVE" ? "Approving student" : "Declining student",
      message: `${student.firstName} ${student.lastName ?? ""}`.trim()
    }),
    invalidates: [queryKeys.admin.pendingStudents],
    onSchedule: ({ student }) => toggle(student.id, true),
    onCancel: ({ student }) => toggle(student.id, false)
  });

  if (isLoading) return <ApplicationListSkeleton />;

  const students = data?.students.filter((student) => !hiddenIds.has(student.id)) ?? [];
  if (!students.length) {
    return (
      <EmptyState
        description="Students who register themselves can sign in only after you approve them."
        icon={UserRoundCheck}
        title="No pending student registrations"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {students.map((student) => (
        <ApplicationCard
          details={[
            student.email,
            student.phoneNumber,
            student.parentName ? `Parent: ${student.parentName}` : null
          ]}
          footnote={`Registered on ${formatFullDate(student.createdAt, tz)}`}
          key={student.id}
          name={`${student.firstName} ${student.lastName ?? ""}`.trim()}
          onApprove={() => review.run({ student, status: "ACTIVE" })}
          onDecline={() => review.run({ student, status: "ARCHIVED" })}
        />
      ))}
    </div>
  );
}
