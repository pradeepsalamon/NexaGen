"use client";

import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { AcquisitionSection } from "@/features/analytics/components/sections/AcquisitionSection";

export function AcquisitionAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="How people discover NexaChess, and how each channel is trending."
      exports={[{ report: "acquisition", label: "Acquisition" }]}
      title="Acquisition Analytics"
    >
      {(query) => <AcquisitionSection query={query} />}
    </AnalyticsPageShell>
  );
}
