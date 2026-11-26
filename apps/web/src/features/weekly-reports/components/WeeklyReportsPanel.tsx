"use client";

import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useStudentWeeklyReports, useWeeklyReportPreview } from "../hooks/useWeeklyReports";
import { WeeklyReportCard } from "./WeeklyReportCard";

/**
 * Staff view of a student's weekly reports (docs/WEEKLY_REPORTS.md): this
 * week so far (not stored) and every finished week, exactly as the student
 * sees it in their own account.
 */
export function WeeklyReportsPanel({ studentId }: { studentId: string }) {
  const preview = useWeeklyReportPreview(studentId);
  const reports = useStudentWeeklyReports(studentId);
  const items = reports.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-app-muted">
        Each Monday the student gets a report of the week before in their own account, made from what is recorded: classes,
        homework, practice and reviewed play. Nothing is sent to anyone yet.
      </p>
      {preview.isLoading ? (
        <Skeleton className="h-56 w-full rounded-panel" />
      ) : preview.isError || !preview.data ? (
        <WidgetError message={preview.error?.message} onRetry={() => void preview.refetch()} />
      ) : (
        <WeeklyReportCard
          badge={<Badge variant="info">This week so far</Badge>}
          facts={preview.data.facts}
          text={preview.data.text}
        />
      )}
      {reports.isLoading ? (
        <Skeleton className="h-56 w-full rounded-panel" />
      ) : reports.isError ? (
        <WidgetError message={reports.error?.message} onRetry={() => void reports.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          description="The first report is made on the Monday after the student's first week."
          icon={FileText}
          title="No finished weeks yet"
          variant="inline"
        />
      ) : (
        <div className="space-y-4">
          {items.map((report) => (
            <WeeklyReportCard facts={report.facts} key={report.id} text={report.text} />
          ))}
          <InfiniteScrollTrigger endLabel="That's every report." query={reports} />
        </div>
      )}
    </div>
  );
}
