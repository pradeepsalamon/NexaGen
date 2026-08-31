"use client";

import type { AnalyticsGranularity } from "@nexa-chess/types";
import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { analyticsExportUrl } from "../api/analyticsApi";
import { useAnalyticsRange } from "../hooks/useAnalyticsRange";
import { useRefreshAnalytics } from "../hooks/useAnalyticsApi";
import { AnalyticsFilters } from "./AnalyticsFilters";
import { AcquisitionSection } from "./sections/AcquisitionSection";
import { AttendanceAnalyticsSection } from "./sections/AttendanceAnalyticsSection";
import { BatchAnalyticsSection } from "./sections/BatchAnalyticsSection";
import { ClassAnalyticsSection } from "./sections/ClassAnalyticsSection";
import { CoachAnalyticsSection } from "./sections/CoachAnalyticsSection";
import { EngagementSection } from "./sections/EngagementSection";
import { ExecutiveOverviewSection } from "./sections/ExecutiveOverviewSection";
import { OperationsSection } from "./sections/OperationsSection";
import { RecordingStorageSection } from "./sections/RecordingStorageSection";
import { StudentAnalyticsSection } from "./sections/StudentAnalyticsSection";
import { UserGrowthSection } from "./sections/UserGrowthSection";

const EXPORTS = [
  ["users", "Users"],
  ["acquisition", "Acquisition"],
  ["coaches", "Coach performance"],
  ["batches", "Batch performance"],
  ["classes", "Classes"],
  ["attendance", "Attendance"],
  ["recordings", "Recordings"],
  ["storage", "Storage report"]
] as const;

export function AnalyticsDashboardClient() {
  const { query, update } = useAnalyticsRange({ preset: "last30" });
  const refresh = useRefreshAnalytics();

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-app-text sm:text-2xl">
            NexaChess Admin Analytics
          </h1>
          <p className="text-sm text-app-muted">
            Users, acquisition, classes, attendance, recordings, storage and daily
            operations.
          </p>
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
          <Button
            className="gap-2"
            onClick={() => refresh()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="size-4" strokeWidth={2.5} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" size="sm" variant="outline">
                <Download className="size-4" strokeWidth={2.5} />
                <span className="hidden sm:inline">Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {EXPORTS.map(([report, label]) => (
                <DropdownMenuItem asChild key={report}>
                  <a
                    href={analyticsExportUrl(report, query)}
                    rel="noopener"
                    target="_blank"
                  >
                    {label} (CSV)
                  </a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AnalyticsFilters onChange={update} query={query} />

      <ExecutiveOverviewSection query={query} />
      <UserGrowthSection
        onGranularityChange={(g: AnalyticsGranularity) =>
          update({ granularity: g })
        }
        query={query}
      />
      <AcquisitionSection query={query} />
      <StudentAnalyticsSection query={query} />
      <CoachAnalyticsSection query={query} />
      <ClassAnalyticsSection query={query} />
      <AttendanceAnalyticsSection query={query} />
      <BatchAnalyticsSection query={query} />
      <RecordingStorageSection query={query} />
      <EngagementSection query={query} />
      <OperationsSection query={query} />
    </div>
  );
}
