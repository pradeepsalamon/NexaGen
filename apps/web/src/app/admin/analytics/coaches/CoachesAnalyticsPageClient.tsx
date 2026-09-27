"use client";

import type { CoachLeaderboardRow } from "@nexa-chess/types";
import Link from "next/link";
import { analyticsApi } from "@/features/analytics/api/analyticsApi";
import { AnalyticsDrillTable } from "@/features/analytics/components/AnalyticsDrillTable";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { CoachAnalyticsSection } from "@/features/analytics/components/sections/CoachAnalyticsSection";
import { formatHours, formatPercent } from "@/features/analytics/lib/format";

export function CoachesAnalyticsPageClient() {
  return (
    <AnalyticsPageShell
      description="Teaching hours, class completion and a full performance leaderboard."
      exports={[{ report: "coaches", label: "Coach performance" }]}
      title="Coach Analytics"
    >
      {(query) => (
        <div className="space-y-5">
          <CoachAnalyticsSection query={query} showTable={false} />
          <div>
            <h2 className="mb-2 text-base font-extrabold text-app-text">Leaderboard</h2>
            <AnalyticsDrillTable<CoachLeaderboardRow>
              columns={[
                {
                  key: "name",
                  header: "Coach",
                  render: (r) => (
                    <Link className="font-medium text-primary-ink hover:underline" href={`/admin/analytics/coaches/${r.coachId}`}>
                      {r.name}
                    </Link>
                  )
                },
                { key: "classesConducted", header: "Classes", sortable: true, align: "right", render: (r) => `${r.completedClasses}/${r.classesConducted}` },
                { key: "teachingHours", header: "Hours", sortable: true, align: "right", render: (r) => formatHours(r.teachingHours) },
                { key: "students", header: "Students", sortable: true, align: "right", render: (r) => r.students },
                { key: "avgAttendancePercent", header: "Attendance", sortable: true, align: "right", render: (r) => formatPercent(r.avgAttendancePercent) },
                { key: "avgClassDurationMinutes", header: "Avg duration", sortable: true, align: "right", render: (r) => (r.avgClassDurationMinutes ? `${r.avgClassDurationMinutes} min` : "—") },
                { key: "cancelledClasses", header: "Cancelled", sortable: true, align: "right", render: (r) => r.cancelledClasses }
              ]}
              defaultSort={{ key: "teachingHours", order: "desc" }}
              extraParams={{ preset: query.preset, from: query.from, to: query.to }}
              fetcher={(params) => analyticsApi.coachesTable(params as never)}
              name="coaches"
              rowKey={(r) => r.coachId}
              searchPlaceholder="(sorting only)"
            />
          </div>
        </div>
      )}
    </AnalyticsPageShell>
  );
}
