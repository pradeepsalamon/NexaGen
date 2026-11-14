"use client";

import type { AnalyticsGranularity, AnalyticsRangeQuery } from "@nexa-chess/types";
import { AreaChartCard, DonutChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { cn } from "@/lib/utils";
import { formatDayMonth } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useUserAnalyticsQuery } from "../../hooks/useAnalyticsApi";

const GRANULARITIES: AnalyticsGranularity[] = ["day", "week", "month"];

export function UserGrowthSection({
  query,
  onGranularityChange
}: {
  query: AnalyticsRangeQuery;
  onGranularityChange: (g: AnalyticsGranularity) => void;
}) {
  const { data, isLoading, isError, refetch } = useUserAnalyticsQuery(query);
  const tz = useUserTimeZone();
  const granularity = data?.growth.granularity ?? query.granularity ?? "day";

  const points =
    data?.growth.points.map((p) => ({
      date: p.date,
      "New registrations": p.value,
      "Total users": p.secondary ?? 0
    })) ?? [];

  const reg = data?.registrations;

  return (
    <SectionCard
      description="Registrations over time and the shape of the user base."
      title="User growth"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
      actions={
        <div className="hidden items-center gap-1 sm:flex">
          {GRANULARITIES.map((g) => (
            <button
              className={cn(
                "rounded-control px-2 py-1 text-xs font-semibold capitalize",
                granularity === g
                  ? "bg-secondary text-black"
                  : "text-app-muted hover:bg-app-soft"
              )}
              key={g}
              onClick={() => onGranularityChange(g)}
              type="button"
            >
              {g}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          <ChartContainer
            isEmpty={!isLoading && points.every((p) => p["New registrations"] === 0)}
            isError={isError}
            isLoading={isLoading}
            emptyMessage="No registration data available for this period."
            onRetry={() => refetch()}
          >
            <AreaChartCard
              data={points}
              series={[
                { key: "New registrations", label: "New registrations" },
                { key: "Total users", label: "Total users" }
              ]}
              xFormat={(d) => formatDayMonth(d, tz)}
              xKey="date"
            />
          </ChartContainer>
          {reg ? (
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Today", reg.today],
                ["This week", reg.thisWeek],
                ["This month", reg.thisMonth],
                ["Previous month", reg.prevMonth],
                ["This year", reg.thisYear],
                [
                  "Month-over-month",
                  reg.growthPercent === null ? "—" : `${reg.growthPercent > 0 ? "+" : ""}${reg.growthPercent}%`
                ]
              ].map(([label, value]) => (
                <div className="rounded-control bg-app-soft p-3" key={label}>
                  <dt className="text-xs font-semibold text-app-muted">
                    {label}
                  </dt>
                  <dd className="mt-0.5 text-lg font-extrabold text-app-text">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-bold text-app-text">By role</p>
            <ChartContainer
              height={200}
              isEmpty={!isLoading && (data?.byRole.length ?? 0) === 0}
              isError={isError}
              isLoading={isLoading}
            >
              <DonutChartCard
                data={(data?.byRole ?? []).map((r) => ({
                  label: r.label,
                  value: r.count
                }))}
                height={200}
              />
            </ChartContainer>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-app-text">By status</p>
            <ul className="space-y-1.5">
              {(data?.byStatus ?? []).map((s) => (
                <li
                  className="flex items-center justify-between text-sm"
                  key={s.key}
                >
                  <span className="text-app-muted">{s.label}</span>
                  <span className="font-semibold text-app-text">
                    {s.count.toLocaleString()}{" "}
                    <span className="text-app-muted">({s.percent}%)</span>
                  </span>
                </li>
              ))}
              {isLoading ? (
                <li className="text-sm text-app-muted">Loading…</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 sm:hidden">
        {GRANULARITIES.map((g) => (
          <Button
            className="mr-2 capitalize"
            key={g}
            onClick={() => onGranularityChange(g)}
            size="sm"
            variant={granularity === g ? "secondary" : "outline"}
          >
            {g}
          </Button>
        ))}
      </div>
    </SectionCard>
  );
}
