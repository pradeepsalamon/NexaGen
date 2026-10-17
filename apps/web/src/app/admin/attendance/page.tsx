"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, ClipboardCheck, Download, Loader2, Presentation, Radio, Timer, Users, XCircle, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatTile } from "@/components/ui/StatTile";
import { WidgetError } from "@/components/ui/WidgetError";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type AdminAttendanceDashboard } from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { pageTitle } from "@/lib/pageTitles";
import type { Tone } from "@/lib/tone";

const attendanceExportUrl =
  getWebEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL })
    .NEXT_PUBLIC_API_URL + API_ROUTES.attendance.adminExport;

const MORE_REPORTS = [
  {
    description: "Every completed class with its attendance.",
    href: "/admin/attendance/completed-classes",
    icon: ClipboardCheck,
    title: pageTitle("/admin/attendance/completed-classes")
  },
  {
    description: "Actual teaching hours per coach.",
    href: "/admin/attendance/coaches",
    icon: Timer,
    title: pageTitle("/admin/attendance/coaches")
  }
] as const;

export default function AdminAttendanceDashboardPage() {
  const [data, setData] = useState<AdminAttendanceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const result = await apiFetch<AdminAttendanceDashboard>(API_ROUTES.attendance.adminDashboard);
        setData(result);
      } catch (error) {
        console.error("Failed to load attendance dashboard", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, [reloadKey]);

  const trendRows = useMemo(
    () => data?.monthlyTrend.map((trend, order) => ({ ...trend, order })),
    [data]
  );
  const { rows: monthlyTrend, sortProps } = useTableSort({
    rows: trendRows,
    accessors: {
      attended: (t) => t.attended,
      classes: (t) => t.classes,
      month: (t) => t.order,
      rate: (t) => t.percent
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[50dvh]">
        <Loader2 aria-label="Loading attendance reports" className="size-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-8">
        <PageHeader title="Attendance reports" />
        <WidgetError
          message="Couldn't load attendance reports."
          onRetry={() => {
            setIsLoading(true);
            setReloadKey((key) => key + 1);
          }}
        />
      </div>
    );
  }

  const { today } = data;
  const todayTiles: { icon: LucideIcon; label: string; tone: Tone; value: number }[] = [
    { icon: Presentation, label: "Classes scheduled", tone: "primary", value: today.totalClasses },
    { icon: Radio, label: "Live now", tone: "primary", value: today.liveClasses },
    { icon: CheckCircle2, label: "Students attended", tone: "accent", value: today.studentsPresent },
    { icon: XCircle, label: "Students absent", tone: "secondary", value: today.studentsAbsent },
    { icon: Users, label: "Active students", tone: "primary", value: today.totalStudents }
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <a href={attendanceExportUrl} rel="noopener" target="_blank">
              <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Export CSV
            </a>
          </Button>
        }
        description="Student attendance and live-class activity across the academy."
        title="Attendance reports"
      />

      <section aria-labelledby="attendance-today" className="space-y-4">
        <h2 className="text-lg font-extrabold text-app-text" id="attendance-today">Today</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {todayTiles.map((tile) => (
            <StatTile icon={tile.icon} key={tile.label} label={tile.label} tone={tile.tone} value={String(tile.value)} />
          ))}
        </div>
      </section>

      <SectionCard description="Classes held and student attendance per month." title="Last 6 months">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left" scope="col"><SortButton label="Month" {...sortProps("month")} /></TableHead>
              <TableHead className="text-right" scope="col"><SortButton label="Classes" {...sortProps("classes")} /></TableHead>
              <TableHead className="text-left md:w-[260px]" scope="col"><SortButton label="Attendance rate" {...sortProps("rate")} /></TableHead>
              <TableHead className="text-right" scope="col"><SortButton label="Attended / total" {...sortProps("attended")} /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthlyTrend.map((trend) => (
              <TableRow key={trend.month}>
                <TableCell className="whitespace-nowrap text-left font-medium text-app-text">{trend.month}</TableCell>
                <TableCell className="text-right tabular-nums">{trend.classes}</TableCell>
                <TableCell className="text-left">
                  <AttendancePercentBar percent={trend.percent} />
                </TableCell>
                <TableCell className="text-right tabular-nums text-app-muted">
                  {trend.attended} / {trend.total}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>

      <section aria-labelledby="attendance-more" className="space-y-4">
        <h2 className="text-lg font-extrabold text-app-text" id="attendance-more">More reports</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {MORE_REPORTS.map(({ description, href, icon: Icon, title }) => (
            <Link
              className="group flex items-start gap-3 rounded-control border border-app-border bg-app-surface p-4 font-normal text-app-text transition-colors hover:border-primary/50 hover:bg-primary/[0.04] hover:opacity-100"
              href={href}
              key={href}
            >
              <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-control border border-primary/25 bg-primary/10 text-primary-ink">
                <Icon className="size-4" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{title}</span>
                <span className="mt-0.5 block text-sm text-app-muted">{description}</span>
              </span>
              <ChevronRight aria-hidden="true" className="mt-2 size-4 shrink-0 text-app-muted transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
