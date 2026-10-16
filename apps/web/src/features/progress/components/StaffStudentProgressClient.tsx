"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useProgressFor } from "../hooks/useProgress";
import { StudentProgressWorkspace } from "./StudentProgressWorkspace";

/**
 * A coach's or admin's page for one student. Access is decided by the API
 * (admin: anyone; coach: students in a batch they coach) — a refusal shows
 * the API's own message in each panel.
 */
export function StaffStudentProgressClient({
  backHref,
  backLabel,
  studentId
}: {
  backHref: string;
  backLabel: string;
  studentId: string;
}) {
  // Shares the Overview tab's cached query.
  const { data } = useProgressFor(studentId);
  const name = data?.progress.studentName;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3">
        <Button asChild className="w-fit" size="sm" variant="outline">
          <Link href={backHref}>
            <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
            {backLabel}
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
            {name ? `${name}'s progress` : "Student progress"}
          </h1>
          <p className="mt-1 text-app-muted">
            Rating, results over time, areas to work on, and every recorded puzzle, class question and assignment.
          </p>
        </div>
      </div>
      <StudentProgressWorkspace studentId={studentId} />
    </div>
  );
}
