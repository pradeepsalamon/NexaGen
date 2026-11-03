"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { StudentProgressWorkspace } from "./StudentProgressWorkspace";

export function StudentProgressClient() {
  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        description="Your rating, streak, activity history and revision in one place."
        title="Progress"
      />
      <StudentProgressWorkspace studentId={null} />
    </div>
  );
}
