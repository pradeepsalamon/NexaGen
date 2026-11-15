"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CalendarX, Clock, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type AdminCoachTeachingReport,
  type AdminCoachTeachingItem,
} from "@nexa-chess/types";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { CoachAttendanceDialog } from "@/features/attendance/components/CoachAttendanceDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/layout/PageHeader";
import { Spinner } from "@/components/ui/Spinner";

export default function AdminCoachTeachingPage() {
  const [data, setData] = useState<AdminCoachTeachingReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [drilldownCoach, setDrilldownCoach] = useState<{ id: string; name: string } | null>(null);

  const loadReport = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const result = await apiFetch<AdminCoachTeachingReport>(
        `${API_ROUTES.attendance.adminCoachReport}?${params.toString()}`
      );
      setData(result);
    } catch (error) {
      console.error("Failed to load coach report", error);
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const formatHours = (hours: number) => {
    if (!hours) return "0h";
    return `${Number(hours.toFixed(1))}h`;
  };

  const formatMinutes = (minutes: number) => {
    if (!minutes) return "0m";
    return `${Math.round(minutes)}m`;
  };

  const coaches = data?.coaches ?? [];
  const { rows: sortedCoaches, sortProps } = useTableSort({
    rows: data?.coaches,
    accessors: {
      actualHours: (c) => c.totalActualHours,
      avgDuration: (c) => c.avgDurationMinutes,
      cancelled: (c) => c.cancelledClasses,
      completed: (c) => c.completedClasses,
      completion: (c) => c.completionPercent,
      name: (c) => c.coachName,
      scheduledHours: (c) => c.totalScheduledHours,
      total: (c) => c.totalClasses
    }
  });
  const totalClasses = coaches.reduce(
    (sum: number, c: AdminCoachTeachingItem) => sum + c.totalClasses,
    0
  );
  const totalActualHours = coaches.reduce(
    (sum: number, c: AdminCoachTeachingItem) => sum + c.totalActualHours,
    0
  );

  return (
    <div className="animate-fade-in space-y-6 pb-10">
      <PageHeader
        breadcrumbs={[{ href: "/admin/attendance", label: "Attendance" }, { label: "Coach teaching report" }]}
        description="Teaching statistics and completion rates for all coaches."
        title="Coach teaching report"
      />

      {/* Filters */}
      <Card className="border-app-border bg-app-surface shadow-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-2 items-end gap-4 sm:flex sm:flex-wrap sm:justify-end">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted">
                From
              </label>
              <DateStringPicker
                
                value={dateFrom}
                onChange={(value) => setDateFrom(value)}
                className="w-full sm:w-44" placeholder="Any date"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted">
                To
              </label>
              <DateStringPicker
                
                value={dateTo}
                onChange={(value) => setDateTo(value)}
                className="w-full sm:w-44" placeholder="Any date"
              />
            </div>
            <Button className="col-span-2 justify-self-end" onClick={loadReport} disabled={isLoading}>
              {isLoading ? (
                <Spinner className="h-4 w-4 mr-2" />
              ) : null}
              Generate report
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && !data ? (
        <div className="flex h-[40dvh] items-center justify-center">
          <Spinner className="h-8 w-8 text-primary-ink" />
        </div>
      ) : coaches.length === 0 ? (
        <EmptyState
          description="No teaching data found for the selected date range."
          icon={CalendarX}
          title="No coach data"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <StatTile icon={Users} label="Coaches" tone="primary" value={String(coaches.length)} />
            <StatTile icon={CalendarCheck} label="Classes" tone="primary" value={String(totalClasses)} />
            <StatTile icon={Clock} label="Actual hours" tone="accent" value={formatHours(totalActualHours)} />
          </div>

          {/* Table */}
          <Card className="border-app-border bg-app-surface shadow-card overflow-hidden">
            <CardContent className="p-0">
              <p className="px-3 pt-4 pb-2 text-xs text-app-muted md:px-6">
                Click a row for that coach&apos;s full teaching history.
              </p>
              <div className="overflow-x-auto">
                <Table className="w-full text-sm text-left">
                  <TableHeader className="text-xs bg-app-background border-b border-app-border text-app-muted">
                    <TableRow>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Coach" {...sortProps("name")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Classes" {...sortProps("total")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Completed" {...sortProps("completed")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Cancelled" {...sortProps("cancelled")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Scheduled hours" {...sortProps("scheduledHours")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Actual hours" {...sortProps("actualHours")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Avg duration" {...sortProps("avgDuration")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Completion %" {...sortProps("completion")} />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-app-border">
                    {sortedCoaches.map((coach: AdminCoachTeachingItem) => (
                      <TableRow
                        key={coach.coachId}
                        role="button"
                        tabIndex={0}
                        aria-label={`View teaching history for ${coach.coachName}`}
                        onClick={() =>
                          setDrilldownCoach({ id: coach.coachId, name: coach.coachName })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setDrilldownCoach({ id: coach.coachId, name: coach.coachName });
                          }
                        }}
                        className="cursor-pointer hover:bg-app-soft/50 transition-colors focus:outline-none focus-visible:bg-app-soft focus-visible:ring-2 focus-visible:ring-app-focus focus-visible:ring-inset"
                      >
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-text font-medium">
                          {coach.coachName}
                          <span className="text-app-muted block text-xs mt-0.5">
                            {coach.email}
                          </span>
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-text">
                          {coach.totalClasses}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-success-ink font-medium">
                          {coach.completedClasses}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-warning-ink font-medium">
                          {coach.cancelledClasses}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {formatHours(coach.totalScheduledHours)}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {formatHours(coach.totalActualHours)}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {formatMinutes(coach.avgDurationMinutes)}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                          <div className="flex flex-col gap-1">
                            <AttendancePercentBar
                              percent={coach.completionPercent}
                            />
                            <span className="text-xs text-app-muted text-right">
                              {coach.completionPercent}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <CoachAttendanceDialog
        open={drilldownCoach !== null}
        onOpenChange={(open) => {
          if (!open) setDrilldownCoach(null);
        }}
        coachId={drilldownCoach?.id ?? null}
        coachName={drilldownCoach?.name}
      />
    </div>
  );
}
