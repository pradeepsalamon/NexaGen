"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, UserRoundCheck, X } from "lucide-react";
import type { PendingStudent, UpdateStudentStatusRequest } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { getPendingStudents, updateStudentStatus } from "@/features/admin/api/adminApi";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

type ReviewVars = { student: PendingStudent; status: UpdateStudentStatusRequest["status"] };

export default function PendingStudentsPage() {
  const tz = useUserTimeZone();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.pendingStudents,
    queryFn: getPendingStudents
  });

  const toggleHidden = (id: string, hidden: boolean) =>
    setHiddenIds((current) => {
      const next = new Set(current);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });

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
    onSchedule: ({ student }) => toggleHidden(student.id, true),
    onCancel: ({ student }) => toggleHidden(student.id, false)
  });

  const students = data?.students.filter((student) => !hiddenIds.has(student.id)) ?? [];

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <BackButton />
          </div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Pending Student Registrations</h1>
          <p className="mt-2 text-app-muted">Students who registered themselves can sign in only after you approve them.</p>
        </header>

        {isLoading ? (
          <div className="flex animate-pulse flex-col gap-4">
            <div className="h-24 w-full rounded-panel border border-app-border bg-app-surface" />
            <div className="h-24 w-full rounded-panel border border-app-border bg-app-surface" />
          </div>
        ) : !students.length ? (
          <div className="rounded-panel border border-app-border bg-app-surface p-6 text-center shadow-card sm:p-12">
            <UserRoundCheck className="mx-auto size-12 text-app-muted opacity-50" />
            <h3 className="mt-4 text-lg font-bold text-app-text">No pending registrations</h3>
            <p className="mt-2 text-sm text-app-muted">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex flex-col gap-4 rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-app-text">
                    {student.firstName} {student.lastName}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-app-muted">
                    <span className="break-all">{student.email}</span>
                    {student.phoneNumber && (
                      <>
                        <span>•</span>
                        <span>{student.phoneNumber}</span>
                      </>
                    )}
                    {student.parentName && (
                      <>
                        <span>•</span>
                        <span>Parent: {student.parentName}</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-app-muted opacity-75">
                    Registered on {formatFullDate(student.createdAt, tz)}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                    onClick={() => review.run({ student, status: "ARCHIVED" })}
                  >
                    <X className="mr-2 size-4" />
                    Decline
                  </Button>
                  <Button onClick={() => review.run({ student, status: "ACTIVE" })}>
                    <Check className="mr-2 size-4" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
