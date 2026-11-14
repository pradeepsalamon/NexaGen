"use client";

import { StudentProgressWorkspace } from "./StudentProgressWorkspace";

export function StudentProgressClient() {
  return (
    <div className="animate-fade-in pb-10">
      <StudentProgressWorkspace
        header={{
          description: "Your rating, streak, activity history and revision in one place.",
          title: "Progress"
        }}
        studentId={null}
      />
    </div>
  );
}
