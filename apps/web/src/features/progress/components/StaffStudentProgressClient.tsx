"use client";

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
    <div className="animate-fade-in pb-10">
      <StudentProgressWorkspace
        header={{
          breadcrumbs: [{ href: backHref, label: backLabel }, { label: name ?? "Student" }],
          description:
            "Rating, results over time, areas to work on, and every recorded puzzle, class question and assignment.",
          title: name ? `${name}'s progress` : "Student progress"
        }}
        studentId={studentId}
      />
    </div>
  );
}
