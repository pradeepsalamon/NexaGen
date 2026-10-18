"use client";

import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { AttendanceAnalyticsSection } from "@/features/analytics/components/sections/AttendanceAnalyticsSection";

export function AttendanceAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="Attendance rate, trend, and which batches / coaches / students need attention."
      exports={[{ report: "attendance", label: "Attendance" }]}
      title="Attendance analytics"
    >
      {(query) => <AttendanceAnalyticsSection query={query} />}
    </AnalyticsPageShell>
  );
}
