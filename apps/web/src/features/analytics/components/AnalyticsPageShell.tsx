"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import type { ReactNode } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
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

interface Props {
  title: string;
  description?: string;
  /** report slugs offered in the Export menu for this page */
  exports?: { report: string; label: string }[];
  showFilters?: ReactNode;
  children: (
    query: AnalyticsRangeQuery,
    update: (patch: Partial<AnalyticsRangeQuery>) => void
  ) => ReactNode;
}

export function AnalyticsPageShell({
  title,
  description,
  exports = [],
  showFilters,
  children
}: Props) {
  const { query, update } = useAnalyticsRange({ preset: "last30" });
  const refresh = useRefreshAnalytics();

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-app-text sm:text-2xl">{title}</h1>
          {description ? (
            <p className="text-sm text-app-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button className="gap-2" onClick={() => refresh()} size="sm" variant="outline">
            <RefreshCw className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {exports.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2" size="sm" variant="outline">
                  <Download className="size-4" strokeWidth={2.5} />
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
        </div>
      </header>
      {showFilters}
      {children(query, update)}
    </div>
  );
}
