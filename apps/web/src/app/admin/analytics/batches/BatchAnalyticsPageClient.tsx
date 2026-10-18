"use client";

import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { BatchAnalyticsSection } from "@/features/analytics/components/sections/BatchAnalyticsSection";

export function BatchAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="Batch roster sizes, class delivery, attendance and teaching hours."
      exports={[{ report: "batches", label: "Batch performance" }]}
      title="Batch analytics"
    >
      {(query) => <BatchAnalyticsSection query={query} />}
    </AnalyticsPageShell>
  );
}
