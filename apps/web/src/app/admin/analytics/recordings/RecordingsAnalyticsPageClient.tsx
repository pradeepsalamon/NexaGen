"use client";

import type { AnalyticsRecordingRow } from "@nexa-chess/types";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { analyticsApi } from "@/features/analytics/api/analyticsApi";
import { AnalyticsDrillTable } from "@/features/analytics/components/AnalyticsDrillTable";
import { AnalyticsFilters } from "@/features/analytics/components/AnalyticsFilters";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { RecordingStorageSection } from "@/features/analytics/components/sections/RecordingStorageSection";
import {
  formatBytes,
  formatDateTime,
  formatDuration
} from "@/features/analytics/lib/format";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

/** Recording lifecycle states, mapped to the badge that reads best for each. */
const STATUS_VARIANTS: Record<string, "success" | "destructive" | "secondary"> = {
  COMPLETED: "success",
  FAILED: "destructive",
  PURGED_STORAGE_LIMIT: "destructive",
  RECORDING: "secondary",
  STOPPING: "secondary"
};

export function RecordingsAnalyticsPageClient() {
  const tz = useUserTimeZone();
  return (
    <AnalyticsPageShell
      description="Recording volume, disk usage and the capacity forecast, plus the full recording log."
      exports={[
        { report: "recordings", label: "Recordings" },
        { report: "storage", label: "Storage" }
      ]}
      title="Recordings & Storage"
    >
      {(query, update) => (
        <div className="space-y-5">
          <AnalyticsFilters onChange={update} query={query} />
          <RecordingStorageSection query={query} />
          <div>
            <h2 className="mb-2 text-base font-extrabold text-app-text">
              Recording log
            </h2>
            <AnalyticsDrillTable<AnalyticsRecordingRow>
              columns={[
                {
                  key: "recordingCompletedAt",
                  header: "Recorded",
                  sortable: true,
                  align: "right",
                  render: (r) => formatDateTime(r.createdAt, tz)
                },
                {
                  key: "topic",
                  header: "Class",
                  render: (r) => (
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/classes/${r.classId}`}
                    >
                      {r.topic}
                    </Link>
                  )
                },
                { key: "coachName", header: "Coach", render: (r) => r.coachName },
                {
                  key: "batchName",
                  header: "Batch",
                  render: (r) => r.batchName ?? "—"
                },
                {
                  key: "recordingDurationSeconds",
                  header: "Duration",
                  sortable: true,
                  align: "right",
                  render: (r) => formatDuration(r.durationSeconds)
                },
                {
                  key: "recordingBytes",
                  header: "Size",
                  sortable: true,
                  align: "right",
                  render: (r) => formatBytes(r.sizeBytes)
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => (
                    <Badge
                      className="text-[10px]"
                      variant={STATUS_VARIANTS[r.status] ?? "secondary"}
                    >
                      {r.status}
                    </Badge>
                  )
                }
              ]}
              defaultSort={{ key: "recordingCompletedAt", order: "desc" }}
              emptyMessage="No recordings for this period."
              extraParams={{
                preset: query.preset,
                from: query.from,
                to: query.to,
                coachId: query.coachId,
                batchId: query.batchId
              }}
              fetcher={(params) => analyticsApi.recordingsTable(params as never)}
              name="recordings"
              rowKey={(r) => r.classId}
              searchPlaceholder="Search class topic…"
            />
          </div>
        </div>
      )}
    </AnalyticsPageShell>
  );
}
