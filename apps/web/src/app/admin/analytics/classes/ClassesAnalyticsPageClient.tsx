"use client";

import type { AnalyticsClassRow } from "@nexa-chess/types";
import Link from "next/link";
import { analyticsApi } from "@/features/analytics/api/analyticsApi";
import { AnalyticsDrillTable } from "@/features/analytics/components/AnalyticsDrillTable";
import { AnalyticsFilters } from "@/features/analytics/components/AnalyticsFilters";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { ClassAnalyticsSection } from "@/features/analytics/components/sections/ClassAnalyticsSection";
import { formatDateTime, formatPercent } from "@/features/analytics/lib/format";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

export function ClassesAnalyticsPageClient() {
  const tz = useUserTimeZone();
  return (
    <AnalyticsPageShell
      description="Demo vs batch, lifecycle status, and the full class log."
      exports={[{ report: "classes", label: "Classes" }]}
      title="Class analytics"
    >
      {(query, update) => (
        <div className="space-y-5">
          <AnalyticsFilters onChange={update} query={query} />
          <ClassAnalyticsSection query={query} />
          <div>
            <h2 className="mb-2 text-base font-extrabold text-app-text">Class log</h2>
            <AnalyticsDrillTable<AnalyticsClassRow>
              columns={[
                { key: "date", header: "When", sortable: true, align: "right", render: (r) => formatDateTime(r.date, tz) },
                {
                  key: "topic",
                  header: "Class",
                  render: (r) => (
                    <Link className="font-medium text-primary-ink hover:underline" href={`/classes/${r.id}`}>
                      {r.topic}
                    </Link>
                  )
                },
                { key: "type", header: "Type", render: (r) => r.type },
                { key: "coachName", header: "Coach", render: (r) => r.coachName },
                { key: "batchName", header: "Batch", render: (r) => r.batchName ?? "—" },
                { key: "students", header: "Students", align: "right", render: (r) => r.students },
                { key: "durationMinutes", header: "Duration", align: "right", render: (r) => `${r.durationMinutes} min` },
                { key: "status", header: "Status", sortable: true, render: (r) => r.status },
                { key: "recording", header: "Rec", render: (r) => (r.hasRecording ? "✓" : "—") },
                { key: "attendancePercent", header: "Attn", align: "right", render: (r) => formatPercent(r.attendancePercent) }
              ]}
              defaultSort={{ key: "date", order: "asc" }}
              extraParams={{
                preset: query.preset,
                from: query.from,
                to: query.to,
                classType: query.classType,
                coachId: query.coachId,
                batchId: query.batchId,
                status: query.status
              }}
              fetcher={(params) => analyticsApi.classesTable(params as never)}
              name="classes"
              rowKey={(r) => r.id}
              searchPlaceholder="Search topic…"
            />
          </div>
        </div>
      )}
    </AnalyticsPageShell>
  );
}
