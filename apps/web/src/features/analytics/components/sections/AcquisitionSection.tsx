"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BarChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { SectionCard } from "@/components/ui/SectionCard";
import { useAcquisitionQuery } from "../../hooks/useAnalyticsApi";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { formatNumber } from "../../lib/format";
import { TableSkeletonRows } from "@/components/ui/TableSkeletonRows";

export function AcquisitionSection({ query }: { query: AnalyticsRangeQuery }) {
  const brandName = useBrandName();
  const searchParams = useSearchParams();
  const { data, isLoading, isError, refetch } = useAcquisitionQuery(query);

  const buildSourceHref = (key: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("acquisitionSource", key);
    return `/admin/analytics/users?${next.toString()}`;
  };

  const chartData =
    data?.sources
      .filter((s) => s.key !== "UNKNOWN")
      .map((s) => ({ label: s.label, Users: s.users })) ?? [];

  const totalKnown = data?.knownCount ?? 0;
  const totalUnknown = data?.unknownCount ?? 0;
  const { rows: sources, sortProps } = useTableSort({
    rows: data?.sources,
    accessors: {
      percent: (s) => s.percent,
      source: (s) => s.label,
      trend: (s) => s.deltaPct,
      users: (s) => s.users
    }
  });

  return (
    <SectionCard
      description={`How people discover ${brandName}. 'Unknown' covers legacy accounts and anyone who skipped the question — it is never guessed.`}
      title={`How users discover ${brandName}`}
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
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
              Known: {formatNumber(totalKnown)}
            </span>
            <span className="rounded-control bg-app-soft px-3 py-1.5 font-semibold text-app-muted">
              Unknown: {formatNumber(totalUnknown)}
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table className="w-full text-left text-sm">
              <TableHeader>
                <TableRow className="text-xs text-app-muted">
                  <TableHead className="pb-2"><SortButton label="Source" {...sortProps("source")} /></TableHead>
                  <TableHead className="pb-2 text-right"><SortButton label="Users" {...sortProps("users")} /></TableHead>
                  <TableHead className="pb-2 text-right"><SortButton label="%" {...sortProps("percent")} /></TableHead>
                  <TableHead className="pb-2 text-right"><SortButton label="Trend" {...sortProps("trend")} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-app-border">
                {sources.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell className="text-left py-2">
                      <Link
                        className="inline-flex items-center gap-1 font-medium text-primary-ink hover:underline"
                        href={buildSourceHref(s.key)}
                      >
                        {s.label}
                        <ArrowUpRight className="size-3" />
                      </Link>
                    </TableCell>
                    <TableCell className="py-2 text-right font-semibold text-app-text">
                      {formatNumber(s.users)}
                    </TableCell>
                    <TableCell className="py-2 text-right text-app-muted">{s.percent}%</TableCell>
                    <TableCell className="py-2 text-right">
                      {s.deltaPct === null ? (
                        <span className="text-app-muted">—</span>
                      ) : (
                        <span
                          className={
                            s.deltaPct >= 0 ? "text-success-ink" : "text-app-danger-ink"
                          }
                        >
                          {s.deltaPct > 0 ? "+" : ""}
                          {s.deltaPct}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {isLoading ? (
                  <TableSkeletonRows columns={4} />
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
