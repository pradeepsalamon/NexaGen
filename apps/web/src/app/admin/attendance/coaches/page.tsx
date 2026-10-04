"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CalendarX, Users, Clock } from "lucide-react";
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
import { BackButton } from "@/components/ui/BackButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { DateStringPicker } from "@/components/ui/DatePicker";

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
    <div className="space-y-6 max-w-7xl p-4 sm:p-6">
      <BackButton />

      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
          Coach Teaching Report
        </h1>
        <p className="text-app-muted mt-1">
          Teaching statistics and completion rates for all coaches
        </p>
      </div>

      {/* Filters */}
      <Card className="border-app-border bg-app-surface shadow-card">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end justify-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted uppercase">
                From
              </label>
              <DateStringPicker
                
                value={dateFrom}
                onChange={(value) => setDateFrom(value)}
                className="w-44" placeholder="Any date"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted uppercase">
                To
              </label>
              <DateStringPicker
                
                value={dateTo}
                onChange={(value) => setDateTo(value)}
                className="w-44" placeholder="Any date"
              />
            </div>
            <Button onClick={loadReport} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Generate Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && !data ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
        </div>
      ) : coaches.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center">
          <div className="p-4 bg-app-soft rounded-full mb-4">
            <CalendarX className="h-10 w-10 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Coach Data</h2>
          <p className="text-app-muted max-w-md">
            No teaching data found for the selected date range.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card className="border-app-border bg-app-surface shadow-card">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="p-2 rounded-control bg-primary/10 border border-primary/20">
                    <Users className="h-5 w-5 text-primary-ink" />
                  </span>
                </div>
                <p className="text-3xl font-bold tracking-tight">
                  {coaches.length}
                </p>
                <p className="text-sm font-medium text-app-muted mt-1">
                  Total Coaches
                </p>
              </CardContent>
            </Card>

            <Card className="border-app-border bg-app-surface shadow-card">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="p-2 rounded-control bg-green-500/10 border border-green-500/20">
                    <CalendarX className="h-5 w-5 text-green-500" />
                  </span>
                </div>
                <p className="text-3xl font-bold tracking-tight">
                  {totalClasses}
                </p>
                <p className="text-sm font-medium text-app-muted mt-1">
                  Total Classes
                </p>
              </CardContent>
            </Card>

            <Card className="border-app-border bg-app-surface shadow-card">
              <CardContent className="p-5 flex flex-col justify-center h-full">
                <div className="flex items-center justify-between mb-3">
                  <span className="p-2 rounded-control bg-orange-500/10 border border-orange-500/20">
                    <Clock className="h-5 w-5 text-orange-500" />
                  </span>
                </div>
                <p className="text-3xl font-bold tracking-tight">
                  {formatHours(totalActualHours)}
                </p>
                <p className="text-sm font-medium text-app-muted mt-1">
                  Total Actual Hours
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card className="border-app-border bg-app-surface shadow-card overflow-hidden">
            <CardContent className="p-0">
              <p className="px-3 pt-4 pb-2 text-xs text-app-muted md:px-6">
                Click a row for that coach&apos;s full teaching history.
              </p>
              <div className="overflow-x-auto">
                <Table className="w-full text-sm text-left">
                  <TableHeader className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                    <TableRow>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Coach Name" {...sortProps("name")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Total Classes" {...sortProps("total")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Completed" {...sortProps("completed")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Cancelled" {...sortProps("cancelled")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Scheduled Hours" {...sortProps("scheduledHours")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Actual Hours" {...sortProps("actualHours")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Avg Duration" {...sortProps("avgDuration")} />
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
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-green-600 font-medium">
                          {coach.completedClasses}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-red-600 font-medium">
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
