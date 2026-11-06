"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { FilterChips, FilterField, FilterPopover, type ActiveFilter } from "@/components/ui/FilterPopover";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { apiFetch } from "@/lib/api";
import { formatDate, formatDuration, formatFullDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  API_ROUTES,
  type CompletedClassesResponse,
  type CompletedClassItem,
} from "@nexa-chess/types";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { PageHeader } from "@/components/layout/PageHeader";
import { Spinner } from "@/components/ui/Spinner";


const CC_STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];
export default function AdminCompletedClassesPage() {
  const router = useRouter();
  const tz = useUserTimeZone();
  const [data, setData] = useState<CompletedClassesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function loadClasses() {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("limit", "15");
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const result = await apiFetch<CompletedClassesResponse>(
          `${API_ROUTES.attendance.adminCompletedClasses}?${params.toString()}`
        );
        setData(result);
      } catch (error) {
        console.error("Failed to load completed classes", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadClasses();
  }, [page, dateFrom, dateTo]);


  const filteredClasses =
    data?.classes.filter(
      (cls) =>
        statusFilter === "all" || cls.status.toLowerCase() === statusFilter
    ) || [];
  const { rows: sortedClasses, sortProps } = useTableSort({
    rows: filteredClasses,
    accessors: {
      attendance: (c) => c.attendancePercent,
      coach: (c) => c.coachName,
      date: (c) => c.actualStart ?? c.scheduledStart,
      duration: (c) => (c.actualDuration > 0 ? c.actualDuration : c.scheduledDuration),
      status: (c) => c.status,
      teaching: (c) => c.coachTeachingDuration,
      topic: (c) => c.topic
    }
  });

  const ccFilters = [
    statusFilter !== "all" && {
      key: "status",
      label: CC_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter,
      onRemove: () => {
        setStatusFilter("all");
        setPage(1);
      }
    },
    dateFrom && { key: "from", label: `From ${formatFullDate(dateFrom, "UTC")}`, onRemove: () => { setDateFrom(""); setPage(1); } },
    dateTo && { key: "to", label: `To ${formatFullDate(dateTo, "UTC")}`, onRemove: () => { setDateTo(""); setPage(1); } },
  ].filter((filter): filter is ActiveFilter => Boolean(filter));

  return (
    <div className="animate-fade-in space-y-6 pb-10">
      <PageHeader
        breadcrumbs={[{ href: "/admin/attendance", label: "Attendance" }, { label: "Completed classes" }]}
        description="Every completed and cancelled live class."
        title="Completed classes"
      />

      {/* Filters */}
      <div className="grid gap-2">
        <div className="flex justify-end">
          <FilterPopover
            activeCount={ccFilters.length}
            emptyValue={{ dateFrom: "", dateTo: "", statusFilter: "all" }}
            onApply={(next) => {
              setDateFrom(next.dateFrom);
              setDateTo(next.dateTo);
              setStatusFilter(next.statusFilter);
              setPage(1);
            }}
            value={{ dateFrom, dateTo, statusFilter }}
          >
            {(draft, update) => (
              <>
                <FilterField htmlFor="cc-status" label="Status">
                  <Select
                    id="cc-status"
                    onChange={(e) => update({ statusFilter: e.target.value })}
                    options={CC_STATUS_OPTIONS}
                    value={draft.statusFilter}
                  />
                </FilterField>
                <div className="grid grid-cols-2">
                  <FilterField label="From">
                    <DateStringPicker
                      aria-label="From date"
                      onChange={(value) => update({ dateFrom: value })}
                      placeholder="Any date"
                      value={draft.dateFrom}
                    />
                  </FilterField>
                  <FilterField label="To">
                    <DateStringPicker
                      aria-label="To date"
                      onChange={(value) => update({ dateTo: value })}
                      placeholder="Any date"
                      value={draft.dateTo}
                    />
                  </FilterField>
                </div>
              </>
            )}
          </FilterPopover>
        </div>
        <FilterChips
          filters={ccFilters}
          onClearAll={
            ccFilters.length > 1
              ? () => {
                  setDateFrom("");
                  setDateTo("");
                  setStatusFilter("all");
                  setPage(1);
                }
              : undefined
          }
        />
      </div>

      {isLoading ? (
        <div className="flex h-[40dvh] items-center justify-center">
          <Spinner className="h-8 w-8 text-primary-ink" />
        </div>
      ) : !data || filteredClasses.length === 0 ? (
        <EmptyState
          description="No completed or cancelled classes match the current filters."
          icon={CalendarX}
          title="No classes found"
        />
      ) : (
        <>
          <Card className="border-app-border bg-app-surface shadow-card overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="w-full text-sm text-left">
                  <TableHeader className="text-xs bg-app-background border-b border-app-border text-app-muted">
                    <TableRow>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Date" {...sortProps("date")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Topic / Batch" {...sortProps("topic")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Coach" {...sortProps("coach")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[200px]">
                        <SortButton label="Attendance" {...sortProps("attendance")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Duration" {...sortProps("duration")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Teaching" {...sortProps("teaching")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        <SortButton label="Status" {...sortProps("status")} />
                      </TableHead>
                      <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-app-border">
                    {sortedClasses.map((cls: CompletedClassItem) => (
                      <TableRow
                        key={cls.id}
                        className="hover:bg-app-soft/50 transition-colors"
                      >
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 whitespace-nowrap text-app-text font-medium">
                          {formatDate(cls.actualStart ?? cls.date, tz, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                          <span className="text-app-muted block text-xs mt-0.5">
                            {formatTime(cls.actualStart ?? cls.scheduledStart, tz)}
                          </span>
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                          <div className="font-medium text-app-text">
                            {cls.topic}
                          </div>
                          <div className="text-xs text-app-muted mt-0.5">
                            {cls.batchName}
                          </div>
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-text">
                          {cls.coachName}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                          <div className="flex flex-col gap-1">
                            <AttendancePercentBar
                              percent={cls.attendancePercent}
                            />
                            <span className="text-xs text-app-muted text-right">
                              {cls.studentsAttended} / {cls.totalStudents}{" "}
                              students
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {cls.actualDuration > 0
                            ? formatDuration(cls.actualDuration)
                            : formatDuration(cls.scheduledDuration)}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {formatDuration(cls.coachTeachingDuration)}
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              cls.status === "COMPLETED"
                                ? "border border-success/40 bg-success/10 text-success-ink"
                                : "border border-warning/40 bg-warning/10 text-warning-ink"
                            }`}
                          >
                            {cls.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              router.push(
                                `/admin/attendance/completed-classes/${cls.id}`
                              )
                            }
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-app-muted">
                Showing {(page - 1) * data.pagination.limit + 1}–
                {Math.min(page * data.pagination.limit, data.pagination.total)}{" "}
                of {data.pagination.total} classes
              </p>
              <div className="flex items-center gap-2">
                <SimpleTooltip label="Previous page">
                  <Button
                    aria-label="Previous page"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft aria-hidden className="h-4 w-4" />
                  </Button>
                </SimpleTooltip>
                <span className="text-sm font-medium text-app-text">
                  {page} / {data.pagination.totalPages}
                </span>
                <SimpleTooltip label="Next page">
                  <Button
                    aria-label="Next page"
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    <ChevronRight aria-hidden className="h-4 w-4" />
                  </Button>
                </SimpleTooltip>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
