"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import {
  CalendarClock,
  CalendarDays,
  Clock,
  Database,
  GraduationCap,
  HardDrive,
  Layers3,
  UserCheck,
  UserPlus,
  UserRoundCheck,
  Users,
  Video
} from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useOverviewQuery } from "../../hooks/useAnalyticsApi";
import { METRIC_TOOLTIPS } from "../../lib/metricTooltips";

export function ExecutiveOverviewSection({
  query
}: {
  query: AnalyticsRangeQuery;
}) {
  const { data, isLoading, isError, refetch } = useOverviewQuery(query);
  const k = data?.kpis;

  return (
    <SectionCard
      description="The numbers an administrator needs at a glance for the selected period."
      title="Executive overview"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load the executive overview." onRetry={() => refetch()} />
      ) : (
        <KpiCardRow columns={4}>
          <KpiCard icon={Users} isLoading={isLoading} kpi={k?.totalUsers} label="Total users" tooltip={METRIC_TOOLTIPS.totalUsers} href="/admin/analytics/users" />
          <KpiCard icon={UserCheck} isLoading={isLoading} kpi={k?.activeUsers} label="Active users" tooltip={METRIC_TOOLTIPS.activeUsers} href="/admin/analytics/engagement" />
          <KpiCard icon={UserPlus} isLoading={isLoading} kpi={k?.newUsersThisMonth} label="New users (month)" tooltip={METRIC_TOOLTIPS.newUsersThisMonth} href="/admin/analytics/users" />
          <KpiCard icon={GraduationCap} isLoading={isLoading} kpi={k?.totalStudents} label="Total students" tooltip={METRIC_TOOLTIPS.totalStudents} href="/admin/analytics/students" />
          <KpiCard icon={UserRoundCheck} isLoading={isLoading} kpi={k?.totalCoaches} label="Total coaches" tooltip={METRIC_TOOLTIPS.totalCoaches} href="/admin/analytics/coaches" />
          <KpiCard icon={UserRoundCheck} isLoading={isLoading} kpi={k?.activeCoaches} label="Active coaches" tooltip={METRIC_TOOLTIPS.activeCoaches} href="/admin/analytics/coaches" />
          <KpiCard icon={Layers3} isLoading={isLoading} kpi={k?.activeBatches} label="Active batches" tooltip={METRIC_TOOLTIPS.activeBatches} href="/admin/analytics/batches" />
          <KpiCard icon={Video} isLoading={isLoading} kpi={k?.completedLiveClasses} label="Completed live classes" tooltip={METRIC_TOOLTIPS.completedLiveClasses} href="/admin/analytics/classes" />
          <KpiCard icon={Clock} isLoading={isLoading} kpi={k?.totalLiveClassHours} label="Live class hours" tooltip={METRIC_TOOLTIPS.totalLiveClassHours} unit="hours" href="/admin/analytics/classes" />
          <KpiCard icon={Video} isLoading={isLoading} kpi={k?.demoClassesCompleted} label="Demos completed" tooltip={METRIC_TOOLTIPS.demoClassesCompleted} href="/admin/analytics/classes" />
          <KpiCard icon={Video} isLoading={isLoading} kpi={k?.batchClassesCompleted} label="Batch classes completed" tooltip={METRIC_TOOLTIPS.batchClassesCompleted} href="/admin/analytics/classes" />
          <KpiCard icon={Database} isLoading={isLoading} kpi={k?.totalRecordings} label="Total recordings" tooltip={METRIC_TOOLTIPS.totalRecordings} href="/admin/analytics/recordings" />
          <KpiCard icon={HardDrive} isLoading={isLoading} kpi={k?.recordingStorageUsedGb} label="Storage used" tooltip={METRIC_TOOLTIPS.recordingStorageUsedGb} unit="gb" href="/admin/analytics/recordings" />
          <KpiCard icon={HardDrive} isLoading={isLoading} kpi={k?.recordingStorageRemainingGb} label="Storage remaining" tooltip={METRIC_TOOLTIPS.recordingStorageRemainingGb} unit="gb" href="/admin/analytics/recordings" />
          <KpiCard icon={UserCheck} isLoading={isLoading} kpi={k?.attendanceRate} label="Attendance rate" tooltip={METRIC_TOOLTIPS.attendanceRate} unit="percent" href="/admin/analytics/attendance" />
          <KpiCard icon={CalendarDays} isLoading={isLoading} kpi={k?.classesThisMonth} label="Classes this month" tooltip={METRIC_TOOLTIPS.classesThisMonth} href="/admin/analytics/classes" />
        </KpiCardRow>
      )}
      {data?.meta.cached ? (
        <p className="mt-3 flex items-center gap-1 text-xs text-app-muted">
          <CalendarClock className="size-3" /> Served from a ~5 minute cache — use Refresh for live numbers.
        </p>
      ) : null}
    </SectionCard>
  );
}
