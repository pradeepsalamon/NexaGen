"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { HeroBanner } from "@/components/ui/HeroBanner";
import { Button } from "@/components/ui/Button";
import type { Crumb } from "@/components/ui/Breadcrumbs";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { analyticsExportUrl } from "../api/analyticsApi";
import { useRefreshAnalytics } from "../hooks/useAnalyticsApi";
import { useAnalyticsRange } from "../hooks/useAnalyticsRange";

export type AnalyticsExport = { report: string; label: string };

interface Props {
  title: ReactNode;
  /** The dashboard's navy welcome banner (with this line above the title) instead of the plain header. */
  heroEyebrow?: string;
  description?: string;
  /** Where a detail page sits; the last crumb is the current page. */
  breadcrumbs?: Crumb[];
  /** report slugs offered in the Export menu for this page */
  exports?: readonly AnalyticsExport[];
  showFilters?: ReactNode;
  children: (
    query: AnalyticsRangeQuery,
    update: (patch: Partial<AnalyticsRangeQuery>) => void
  ) => ReactNode;
}

/** The analytics template: page header, date range, refresh and CSV export. */
export function AnalyticsPageShell({
  title,
  heroEyebrow,
  description,
  breadcrumbs,
  exports = [],
  showFilters,
  children
}: Props) {
  const { query, update } = useAnalyticsRange({ preset: "last30" });

  return (
    <div className="animate-fade-in pb-10">
      {heroEyebrow ? (
        <HeroBanner
          actions={<AnalyticsToolbar exports={exports} query={query} update={update} />}
          description={description}
          eyebrow={heroEyebrow}
          title={title}
        />
      ) : (
        <PageHeader
          actions={<AnalyticsToolbar exports={exports} query={query} update={update} />}
          breadcrumbs={breadcrumbs}
          description={description}
          title={title}
        />
      )}
      <div className="space-y-5">
        {showFilters}
        {children(query, update)}
      </div>
    </div>
  );
}

function AnalyticsToolbar({
  exports,
  query,
  update
}: {
  exports: readonly AnalyticsExport[];
  query: AnalyticsRangeQuery;
  update: ReturnType<typeof useAnalyticsRange>["update"];
}) {
  const refresh = useRefreshAnalytics();

  return (
    <>
      <DateRangePicker
        onChange={(next) =>
          update({
            preset: next.preset ?? null,
            from: next.from ?? null,
            to: next.to ?? null,
            compare: next.compare ?? null
          })
        }
        value={{
          preset: query.preset,
          from: query.from,
          to: query.to,
          compare: query.compare
        }}
      />
      <Button aria-label="Refresh" onClick={() => refresh()} size="sm" variant="outline">
        <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
        <span className="hidden sm:inline">Refresh</span>
      </Button>
      {exports.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label="Export" size="sm" variant="outline">
              <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {exports.map((e) => (
              <DropdownMenuItem asChild key={e.report}>
                <a href={analyticsExportUrl(e.report, query)} rel="noopener" target="_blank">
                  {e.label} (CSV)
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
