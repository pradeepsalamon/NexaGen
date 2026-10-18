"use client";

import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { StudentAnalyticsSection } from "@/features/analytics/components/sections/StudentAnalyticsSection";

export function StudentAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="Student roster, engagement, and who needs a nudge."
      exports={[{ report: "users", label: "Users" }]}
      title="Student analytics"
    >
      {(query) => <StudentAnalyticsSection query={query} />}
    </AnalyticsPageShell>
  );
}
