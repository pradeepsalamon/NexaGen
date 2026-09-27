"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import Link from "next/link";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useBatchAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi, formatHours, formatPercent } from "../../lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";

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
            <Table className="w-full min-w-[720px] text-left text-sm">
              <TableHeader className="text-xs uppercase tracking-wide text-app-muted">
                <TableRow>
                  <TableHead className="pb-2">Batch</TableHead>
                  <TableHead className="pb-2">Coach</TableHead>
                  <TableHead className="pb-2 text-right">Students</TableHead>
                  <TableHead className="pb-2 text-right">Classes</TableHead>
                  <TableHead className="pb-2 text-right">Completed</TableHead>
                  <TableHead className="pb-2 text-right">Attendance</TableHead>
                  <TableHead className="pb-2 text-right">Hours</TableHead>
                  <TableHead className="pb-2">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-app-border">
                {(data?.batches ?? []).slice(0, 12).map((b) => (
                  <TableRow key={b.batchId}>
                    <TableCell className="text-left py-2">
                      <Link
                        className="font-medium text-primary-ink hover:underline"
                        href={`/admin/analytics/batches/${b.batchId}`}
                      >
                        {b.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-left py-2 text-app-muted">
                      {b.coachNames.join(", ") || "—"}
                    </TableCell>
                    <TableCell className="py-2 text-right">{b.students}</TableCell>
                    <TableCell className="py-2 text-right">{b.classes}</TableCell>
                    <TableCell className="py-2 text-right">{b.completedClasses}</TableCell>
                    <TableCell className="py-2 text-right">{formatPercent(b.attendancePercent)}</TableCell>
                    <TableCell className="py-2 text-right">{formatHours(b.teachingHours)}</TableCell>
                    <TableCell className="text-left py-2">
                      <Badge variant="secondary">{b.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {isLoading ? (
                  <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={8}>Loading…</TableCell></TableRow>
                ) : null}
                {!isLoading && (data?.batches.length ?? 0) === 0 ? (
                  <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={8}>No batches yet.</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <Link className="mt-2 inline-block text-xs font-semibold text-primary-ink hover:underline" href="/admin/analytics/batches">
            View all batches →
          </Link>
        </>
      )}
    </SectionCard>
  );
}
