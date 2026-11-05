"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { AcquisitionSection } from "@/features/analytics/components/sections/AcquisitionSection";

export function AcquisitionAnalyticsPageClient() {
  const brandName = useBrandName();
  return (
    <AnalyticsPageShell
      description={`How people discover ${brandName}, and how each channel is trending.`}
      exports={[{ report: "acquisition", label: "Acquisition" }]}
      title="Acquisition analytics"
    >
      {(query) => <AcquisitionSection query={query} />}
    </AnalyticsPageShell>
  );
}
