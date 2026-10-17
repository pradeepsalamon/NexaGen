"use client";

import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { EngagementSection } from "@/features/analytics/components/sections/EngagementSection";

export function EngagementAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="DAU / WAU / MAU, new vs returning, and recently active users."
      title="Engagement analytics"
    >
      {(query) => <EngagementSection query={query} />}
    </AnalyticsPageShell>
  );
}
