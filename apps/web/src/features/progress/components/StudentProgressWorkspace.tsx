"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { RevisionReportPanel } from "@/features/revision/components/RevisionReportPanel";
import { useActivitySummary, useProgressFor } from "../hooks/useProgress";
import {
  DEFAULT_ACTIVITY_FILTERS,
  activeFilterCount,
  toActivityScope,
  type ActivityFilters
} from "../lib/activityFilters";
import { ActivityFiltersBar } from "./ActivityFiltersBar";
import { ActivityHistoryList } from "./ActivityHistoryList";
import { ActivitySummaryPanel } from "./ActivitySummaryPanel";
import { ProgressView } from "./ProgressView";

type Tab = "overview" | "performance" | "history" | "revision";

function LoadingTiles() {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 w-full rounded-app" />
      ))}
    </div>
  );
}

/**
 * One student's progress: rating + streak (Overview), period summary and
 * insights (Performance), the filterable activity history (History), and
 * Smart Revision (scheduled items + recall; staff also recommend from here).
 * `studentId` null = the signed-in student. The period and filters are shared
 * by Performance and History, so switching tabs keeps the same slice.
 */
export function StudentProgressWorkspace({ studentId }: { studentId: string | null }) {
  const tz = useUserTimeZone();
  const [tab, setTab] = useState<Tab>("overview");
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const scope = useMemo(() => toActivityScope(filters, tz), [filters, tz]);

  const progress = useProgressFor(studentId);
  // The summary also supplies the class / assignment / group filter options.
  const summary = useActivitySummary(studentId, scope);

  return (
    <Tabs className="min-w-0 grid-cols-[minmax(0,1fr)]" onValueChange={(v) => setTab(v as Tab)} value={tab}>
      <TabsList aria-label="Progress views" className="max-w-full justify-self-end overflow-x-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="history">Activity history</TabsTrigger>
        <TabsTrigger value="revision">Revision</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        {progress.isLoading ? (
          <LoadingTiles />
        ) : progress.isError || !progress.data ? (
          <WidgetError message={progress.error?.message} onRetry={() => progress.refetch()} />
        ) : (
          <ProgressView progress={progress.data.progress} />
        )}
      </TabsContent>

      <TabsContent className="space-y-5" value="performance">
        <ActivityFiltersBar facets={summary.data?.summary.facets} filters={filters} onChange={setFilters} />
        {summary.isLoading ? (
          <LoadingTiles />
        ) : summary.isError && !summary.data ? (
          <WidgetError message={summary.error?.message} onRetry={() => summary.refetch()} />
        ) : summary.data ? (
          <div aria-busy={summary.isFetching} className={summary.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
            <ActivitySummaryPanel summary={summary.data.summary} />
          </div>
        ) : null}
      </TabsContent>

      <TabsContent className="space-y-5" value="history">
        <ActivityFiltersBar
          facets={summary.data?.summary.facets}
          filters={filters}
          onChange={setFilters}
          showStatus
        />
        <ActivityHistoryList
          hasFilters={activeFilterCount(filters) > 0 || filters.period !== "all"}
          scope={scope}
          status={filters.status}
          studentId={studentId}
        />
      </TabsContent>

      <TabsContent value="revision">
        {tab === "revision" ? <RevisionReportPanel studentId={studentId} /> : null}
      </TabsContent>
    </Tabs>
  );
}
