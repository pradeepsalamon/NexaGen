"use client";

import { AnalyticsFilters } from "./AnalyticsFilters";
import { AnalyticsPageShell } from "./AnalyticsPageShell";
import { AnalyticsReportLinks } from "./AnalyticsReportLinks";
import { ExecutiveOverviewSection } from "./sections/ExecutiveOverviewSection";
import { OperationsSection } from "./sections/OperationsSection";

const EXPORTS = [
  { report: "users", label: "Users" },
  { report: "acquisition", label: "Acquisition" },
  { report: "coaches", label: "Coach performance" },
  { report: "batches", label: "Batch performance" },
  { report: "classes", label: "Classes" },
  { report: "attendance", label: "Attendance" },
  { report: "recordings", label: "Recordings" },
  { report: "storage", label: "Storage report" }
] as const;

export function AnalyticsDashboardClient() {
  return (
    <AnalyticsPageShell
      description="Headline numbers for the selected period, today's operations, and the full reports."
      exports={EXPORTS}
      title="Dashboard"
    >
      {(query, update) => (
        <>
          <AnalyticsFilters onChange={update} query={query} />
          <ExecutiveOverviewSection query={query} />
          <AnalyticsReportLinks />
          <OperationsSection query={query} />
        </>
      )}
    </AnalyticsPageShell>
  );
}
