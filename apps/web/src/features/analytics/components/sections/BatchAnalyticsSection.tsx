"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import Link from "next/link";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useBatchAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi, formatHours, formatPercent } from "../../lib/format";

export function BatchAnalyticsSection({ query }: { query: AnalyticsRangeQuery }) {
  const { data, isLoading, isError, refetch } = useBatchAnalyticsQuery(query);
  const k = data?.kpis;

  return (
    <SectionCard
      description="Batch roster sizes, class delivery, attendance and teaching hours."
      title="Batch analytics"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load batch analytics." onRetry={() => refetch()} />
      ) : (
        <>
          <KpiCardRow columns={3}>
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.totalBatches)} label="Total batches" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.activeBatches)} label="Active" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.upcomingBatches)} label="Upcoming" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.completedBatches)} label="Completed" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.archivedBatches)} label="Archived" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.avgStudentsPerBatch)} label="Avg students / batch" />
          </KpiCardRow>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-app-muted">
                <tr>
                  <th className="pb-2">Batch</th>
                  <th className="pb-2">Coach</th>
                  <th className="pb-2 text-right">Students</th>
                  <th className="pb-2 text-right">Classes</th>
                  <th className="pb-2 text-right">Completed</th>
                  <th className="pb-2 text-right">Attendance</th>
                  <th className="pb-2 text-right">Hours</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {(data?.batches ?? []).slice(0, 12).map((b) => (
                  <tr key={b.batchId}>
                    <td className="py-2">
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/admin/analytics/batches/${b.batchId}`}
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="py-2 text-app-muted">
                      {b.coachNames.join(", ") || "—"}
                    </td>
                    <td className="py-2 text-right">{b.students}</td>
                    <td className="py-2 text-right">{b.classes}</td>
                    <td className="py-2 text-right">{b.completedClasses}</td>
                    <td className="py-2 text-right">{formatPercent(b.attendancePercent)}</td>
                    <td className="py-2 text-right">{formatHours(b.teachingHours)}</td>
                    <td className="py-2">
                      <span className="rounded-full bg-app-soft px-2 py-0.5 text-xs font-semibold text-app-text">
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {isLoading ? (
                  <tr><td className="py-3 text-app-muted" colSpan={8}>Loading…</td></tr>
                ) : null}
                {!isLoading && (data?.batches.length ?? 0) === 0 ? (
                  <tr><td className="py-3 text-app-muted" colSpan={8}>No batches yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Link className="mt-2 inline-block text-xs font-semibold text-primary hover:underline" href="/admin/analytics/batches">
            View all batches →
          </Link>
        </>
      )}
    </SectionCard>
  );
}
