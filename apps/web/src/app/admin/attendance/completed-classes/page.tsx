"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { apiFetch } from "@/lib/api";
import { formatDate, formatDuration, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  API_ROUTES,
  type CompletedClassesResponse,
  type CompletedClassItem,
} from "@nexa-chess/types";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";

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

  return (
    <div className="space-y-6 max-w-7xl p-4 sm:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-app-text">
          Completed Classes
        </h1>
        <p className="text-app-muted mt-1">
          View all completed and cancelled live classes
        </p>
      </div>

      {/* Filters */}
      <Card className="border-app-border bg-app-surface shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted uppercase">
                From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted uppercase">
                To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-app-muted uppercase">
                Status
              </label>
              <Select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                options={[
                  { label: "All", value: "all" },
                  { label: "Completed", value: "completed" },
                  { label: "Cancelled", value: "cancelled" },
                ]}
                className="w-40"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setStatusFilter("all");
                setPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !data || filteredClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-center">
          <div className="p-4 bg-app-soft rounded-full mb-4">
            <CalendarX className="h-10 w-10 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Classes Found</h2>
          <p className="text-app-muted max-w-md">
            No completed or cancelled classes match the current filters.
          </p>
        </div>
      ) : (
        <>
          <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                    <tr>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Date
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Topic / Batch
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Coach
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[200px]">
                        Attendance
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Duration
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Teaching
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Status
                      </th>
                      <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border">
                    {filteredClasses.map((cls: CompletedClassItem) => (
                      <tr
                        key={cls.id}
                        className="hover:bg-app-soft/50 transition-colors"
                      >
                        <td className="px-3 py-3 md:px-6 md:py-4 whitespace-nowrap text-app-text font-medium">
                          {formatDate(cls.actualStart ?? cls.date, tz, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                          <span className="text-app-muted block text-xs mt-0.5">
                            {formatTime(cls.actualStart ?? cls.scheduledStart, tz)}
                          </span>
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4">
                          <div className="font-medium text-app-text">
                            {cls.topic}
                          </div>
                          <div className="text-xs text-app-muted mt-0.5">
                            {cls.batchName}
                          </div>
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4 text-app-text">
                          {cls.coachName}
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4">
                          <div className="flex flex-col gap-1">
                            <AttendancePercentBar
                              percent={cls.attendancePercent}
                            />
                            <span className="text-xs text-app-muted text-right">
                              {cls.studentsAttended} / {cls.totalStudents}{" "}
                              students
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {cls.actualDuration > 0
                            ? formatDuration(cls.actualDuration)
                            : formatDuration(cls.scheduledDuration)}
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                          {formatDuration(cls.coachTeachingDuration)}
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              cls.status === "COMPLETED"
                                ? "bg-green-50 text-green-700 border border-green-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {cls.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 md:px-6 md:py-4">
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-app-text">
                  {page} / {data.pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
