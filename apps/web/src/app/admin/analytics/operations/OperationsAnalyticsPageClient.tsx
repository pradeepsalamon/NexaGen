"use client";

import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { OperationsSection } from "@/features/analytics/components/sections/OperationsSection";
import { StudentAnalyticsSection } from "@/features/analytics/components/sections/StudentAnalyticsSection";

export function OperationsAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="Today's classes, coaches and students, plus the actionable alert feed."
      title="Operations"
    >
      {(query) => (
        <div className="space-y-5">
          <OperationsSection query={query} />
          <StudentAnalyticsSection query={query} />
        </div>
      )}
    </AnalyticsPageShell>
  );
}
