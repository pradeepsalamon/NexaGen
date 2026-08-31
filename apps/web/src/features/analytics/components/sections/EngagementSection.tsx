"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { AreaChartCard, DonutChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useEngagementAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi, relativeTime } from "../../lib/format";
import { METRIC_TOOLTIPS } from "../../lib/metricTooltips";

export function EngagementSection({ query }: { query: AnalyticsRangeQuery }) {
  const { data, isLoading, isError, refetch } = useEngagementAnalyticsQuery(query);

  return (
    <SectionCard
      description="Real activity — not just having an account. An 'active' user has a login, class join, assignment attempt or recording-watch event in the window."
      title="Engagement"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load engagement analytics." onRetry={() => refetch()} />
      ) : !isLoading && data && !data.available ? (
        <div className="rounded-app border border-dashed border-app-border p-6 text-center text-sm text-app-muted">
          Activity tracking has just been enabled — DAU / WAU / MAU history begins
          accumulating from now.
        </div>
      ) : (
        <>
          <KpiCardRow columns={4}>
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.dau)} label="DAU" tooltip={METRIC_TOOLTIPS.dau} />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.wau)} label="WAU" tooltip={METRIC_TOOLTIPS.wau} />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.mau)} label="MAU" tooltip={METRIC_TOOLTIPS.mau} />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.stickiness)} label="Stickiness (DAU/MAU)" unit="percent" />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.activeUsers)} label="Active in period" />
            <KpiCard invertDelta isLoading={isLoading} kpi={asKpi(data?.inactiveUsers)} label="Inactive users" />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.newVsReturning.new)} label="New (active)" />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.newVsReturning.returning)} label="Returning (active)" />
          </KpiCardRow>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Daily active users</p>
              <ChartContainer
                isEmpty={!isLoading && (data?.trend.points.every((p) => p.value === 0) ?? true)}
                isError={isError}
                isLoading={isLoading}
              >
                <AreaChartCard
                  data={data?.trend.points ?? []}
                  series={[{ key: "value", label: "Active users" }]}
                  xFormat={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  xKey="date"
                />
              </ChartContainer>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">By activity type</p>
              <ChartContainer
                height={200}
                isEmpty={!isLoading && (data?.byEventType.every((t) => t.count === 0) ?? true)}
                isLoading={isLoading}
              >
                <DonutChartCard
                  data={(data?.byEventType ?? []).map((t) => ({ label: t.label, value: t.count }))}
                  height={200}
                />
              </ChartContainer>
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-bold text-app-text">Recently active</p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {(data?.recentlyActive ?? []).map((u) => (
                <li className="flex items-center justify-between gap-2" key={u.userId}>
                  <span className="truncate text-app-text">
                    {u.name}{" "}
                    <span className="text-xs text-app-muted">({u.role.toLowerCase()})</span>
                  </span>
                  <span className="shrink-0 text-app-muted">
                    {relativeTime(u.lastActiveAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </SectionCard>
  );
}
