"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BarChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { SectionCard } from "@/components/ui/SectionCard";
import { useAcquisitionQuery } from "../../hooks/useAnalyticsApi";

export function AcquisitionSection({ query }: { query: AnalyticsRangeQuery }) {
  const { data, isLoading, isError, refetch } = useAcquisitionQuery(query);

  const chartData =
    data?.sources
      .filter((s) => s.key !== "UNKNOWN")
      .map((s) => ({ label: s.label, Users: s.users })) ?? [];

  const totalKnown = data?.knownCount ?? 0;
  const totalUnknown = data?.unknownCount ?? 0;

  return (
    <SectionCard
      description="How people discover NexaChess. 'Unknown' covers legacy accounts and anyone who skipped the question — it is never guessed."
      title="How users discover NexaChess"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ChartContainer
          isEmpty={!isLoading && chartData.length === 0}
          isError={isError}
          isLoading={isLoading}
          emptyMessage="No acquisition data for this period."
          onRetry={() => refetch()}
          height={320}
        >
          <BarChartCard
            data={chartData}
            height={320}
            layout="vertical"
            series={[{ key: "Users", label: "Users" }]}
            xKey="label"
          />
        </ChartContainer>

        <div>
          <div className="mb-3 flex gap-3 text-sm">
            <span className="rounded-control bg-app-soft px-3 py-1.5 font-semibold text-app-text">
              Known: {totalKnown.toLocaleString()}
            </span>
            <span className="rounded-control bg-app-soft px-3 py-1.5 font-semibold text-app-muted">
              Unknown: {totalUnknown.toLocaleString()}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-app-muted">
                  <th className="pb-2">Source</th>
                  <th className="pb-2 text-right">Users</th>
                  <th className="pb-2 text-right">%</th>
                  <th className="pb-2 text-right">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {(data?.sources ?? []).map((s) => (
                  <tr key={s.key}>
                    <td className="py-2">
                      <Link
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        href={`/admin/analytics/users?acquisitionSource=${s.key}`}
                      >
                        {s.label}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </td>
                    <td className="py-2 text-right font-semibold text-app-text">
                      {s.users.toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-app-muted">{s.percent}%</td>
                    <td className="py-2 text-right">
                      {s.deltaPct === null ? (
                        <span className="text-app-muted">—</span>
                      ) : (
                        <span
                          className={
                            s.deltaPct >= 0 ? "text-accent" : "text-app-danger"
                          }
                        >
                          {s.deltaPct > 0 ? "+" : ""}
                          {s.deltaPct}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {isLoading ? (
                  <tr>
                    <td className="py-3 text-app-muted" colSpan={4}>
                      Loading…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
