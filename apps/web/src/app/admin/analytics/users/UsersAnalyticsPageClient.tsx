"use client";

import type { AnalyticsGranularity, AnalyticsUserRow } from "@nexa-chess/types";
import Link from "next/link";
import { analyticsApi } from "@/features/analytics/api/analyticsApi";
import { AnalyticsDrillTable } from "@/features/analytics/components/AnalyticsDrillTable";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { AnalyticsFilters } from "@/features/analytics/components/AnalyticsFilters";
import { UserGrowthSection } from "@/features/analytics/components/sections/UserGrowthSection";
import { formatDate, relativeTime } from "@/features/analytics/lib/format";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

export function UsersAnalyticsPageClient() {
  const tz = useUserTimeZone();
  return (
    <AnalyticsPageShell
      description="Registrations, role and status mix, and the full user directory."
      exports={[{ report: "users", label: "Users" }]}
      title="User analytics"
    >
      {(query, update) => (
        <div className="space-y-5">
          <AnalyticsFilters onChange={update} query={query} />
          <UserGrowthSection
            onGranularityChange={(g: AnalyticsGranularity) => update({ granularity: g })}
            query={query}
          />
          <div>
            <h2 className="mb-2 text-base font-extrabold text-app-text">
              User directory
            </h2>
            <AnalyticsDrillTable<AnalyticsUserRow>
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (r) => (
                    <div>
                      <p className="font-medium text-app-text">{r.name}</p>
                      <p className="text-xs text-app-muted">{r.email}</p>
                    </div>
                  )
                },
                { key: "role", header: "Role", render: (r) => r.role },
                { key: "status", header: "Status", render: (r) => r.status },
                {
                  key: "acquisitionSource",
                  header: "Acquisition",
                  render: (r) => (
                    <span className="capitalize">
                      {r.acquisitionSource.toLowerCase().replace("_", " ")}
                    </span>
                  )
                },
                {
                  key: "createdAt",
                  header: "Registered",
                  sortable: true,
                  align: "right",
                  render: (r) => formatDate(r.createdAt, tz)
                },
                {
                  key: "lastActiveAt",
                  header: "Last active",
                  sortable: true,
                  align: "right",
                  render: (r) => relativeTime(r.lastActiveAt, tz)
                },
                {
                  key: "batches",
                  header: "Batches",
                  render: (r) =>
                    r.batchNames.length ? (
                      <span className="text-xs text-app-muted">
                        {r.batchNames.slice(0, 2).join(", ")}
                        {r.batchNames.length > 2 ? ` +${r.batchNames.length - 2}` : ""}
                      </span>
                    ) : (
                      <span className="text-app-muted">—</span>
                    )
                }
              ]}
              defaultSort={{ key: "createdAt", order: "asc" }}
              extraParams={{
                role: query.role,
                status: query.status,
                acquisitionSource: query.acquisitionSource,
                preset: query.preset,
                from: query.from,
                to: query.to
              }}
              fetcher={(params) => analyticsApi.usersTable(params as never)}
              name="users"
              rowKey={(r) => r.id}
              searchPlaceholder="Search name or email…"
            />
          </div>
          <p className="text-xs text-app-muted">
            Tip: filter by acquisition source above, then{" "}
            <Link className="text-primary-ink hover:underline" href="/admin/analytics/acquisition">
              see the full acquisition breakdown →
            </Link>
          </p>
        </div>
      )}
    </AnalyticsPageShell>
  );
}
