"use client";

import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useMyWeeklyReports } from "../hooks/useWeeklyReports";
import { WeeklyReportCard } from "./WeeklyReportCard";

/** The student's weekly reports (docs/WEEKLY_REPORTS.md), newest week first. */
export function StudentReportsClient() {
  const query = useMyWeeklyReports();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="animate-fade-in space-y-6 pb-10">
      <PageHeader
        description="Every Monday, a short look back at your week: classes, homework, practice and play."
        title="Weekly reports"
      />
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-panel" />
          <Skeleton className="h-56 w-full rounded-panel" />
        </div>
      ) : query.isError ? (
        <WidgetError message="Your weekly reports couldn't be loaded." onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          description="Your first report appears on the Monday after your first week."
          icon={FileText}
          title="No weekly reports yet"
        />
      ) : (
        <div className="space-y-4">
          {items.map((report) => (
            <WeeklyReportCard facts={report.facts} key={report.id} text={report.text} />
          ))}
          <InfiniteScrollTrigger endLabel="That's every report." query={query} />
        </div>
      )}
    </div>
  );
}
