"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type AttendanceLogsResponse,
  type AttendanceLogEntry,
} from "@nexa-chess/types";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";
import { AttendancePercentBar } from "./AttendancePercentBar";
import { LogIn, LogOut, WifiOff, RefreshCcw, Clock, AlertCircle } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate, formatTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

interface AttendanceLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string | null;
  studentId: string | null;
  /** Shown while the logs load; the response's own topic/date replace them. */
  title?: string;
  date?: string;
}

export function AttendanceLogDialog({
  open,
  onOpenChange,
  classId,
  studentId,
  title = "Class Attendance Details",
  date,
}: AttendanceLogDialogProps) {
  const timeZone = useUserTimeZone();

  // Keyed by (class, student): opening another row can never show this row's
  // logs (the old effect kept the previous response on screen until the next
  // one landed, and a slow earlier response could overwrite a later one).
  const query = useQuery({
    queryKey: queryKeys.attendance.classLogs(classId ?? "", studentId ?? ""),
    queryFn: () =>
      apiFetch<AttendanceLogsResponse>(API_ROUTES.attendance.classLogs(classId!, studentId!)),
    enabled: open && Boolean(classId && studentId),
    retry: 1
  });
  const data = query.data && query.data.classId === classId ? query.data : null;
  const isLoading = query.isLoading;
  const error = query.error ? query.error.message || "Failed to load attendance logs" : null;

  // The same label and date the history row shows: actual start when known.
  const headerTitle = data?.topic ?? title;
  const headerDate = data ? (data.actualStart ?? data.classStartsAt) : date;

  const getEventIcon = (type: string) => {
    switch (type) {
      case "JOIN":
        return <LogIn className="h-3.5 w-3.5 text-emerald-600" />;
      case "LEAVE":
        return <LogOut className="h-3.5 w-3.5 text-app-muted" />;
      case "DISCONNECT":
        return <WifiOff className="h-3.5 w-3.5 text-rose-500" />;
      case "RECONNECT":
        return <RefreshCcw className="h-3.5 w-3.5 text-primary-ink" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-app-muted" />;
    }
  };

  const getEventDotClass = (type: string) => {
    switch (type) {
      case "JOIN":
        return "bg-emerald-500 ring-2 ring-emerald-100";
      case "LEAVE":
        return "bg-gray-400 ring-2 ring-app-border";
      case "DISCONNECT":
        return "bg-rose-500 ring-2 ring-rose-100";
      case "RECONNECT":
        return "bg-primary ring-2 ring-primary/40";
      default:
        return "bg-gray-400 ring-2 ring-app-border";
    }
  };

  const getEventLabel = (type: string) => {
    switch (type) {
      case "JOIN":
        return "Joined Class";
      case "LEAVE":
        return "Left Class";
      case "DISCONNECT":
        return "Connection Dropped";
      case "RECONNECT":
        return "Reconnected";
      default:
        return type;
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds && seconds !== 0) return "0 min";
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg md:max-w-xl max-h-[85dvh] overflow-hidden flex flex-col p-0 rounded-app border-app-border bg-app-surface shadow-lift">
        <div className="p-6 pb-4 border-b border-app-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center justify-between gap-3 text-app-text">
              <span>Session Logs</span>
              {data && <AttendanceStatusBadge status={data.status} className="text-xs" />}
            </DialogTitle>
            <DialogDescription className="text-app-muted text-sm mt-1">
              <span className="font-medium text-app-text">{headerTitle}</span>
              {headerDate
                ? ` • ${formatFullDate(headerDate, timeZone)} • ${formatTime(headerDate, timeZone)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full rounded-control" />
              <Skeleton className="h-36 w-full rounded-control" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-control bg-red-50 text-red-700 border border-red-200 flex items-center gap-3">
              <AlertCircle className="size-5 shrink-0 text-red-600" />
              <p className="text-sm">{error}</p>
            </div>
          ) : data ? (
            <>
              {/* Summary Stats Card (Stitch style) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-app-soft/40 border border-app-border rounded-control p-3.5">
                <div className="flex flex-col justify-center">
                  <span className="text-xs font-medium text-app-muted mb-1">Engagement</span>
                  <div className="text-lg font-bold text-app-text flex flex-col gap-1.5">
                    <span>{data.attendancePercent ?? 0}%</span>
                    <AttendancePercentBar percent={data.attendancePercent ?? 0} showText={false} />
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <span className="text-xs font-medium text-app-muted mb-1">Duration</span>
                  <div className="text-base font-bold text-app-text">
                    {formatDuration(data.totalDuration)}{" "}
                    {/* Same denominator as the row and the %: how long the class ran. */}
                    <span className="text-xs font-normal text-app-muted">
                      / {formatDuration(data.classDuration)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <span className="text-xs font-medium text-app-muted mb-1">Interruptions</span>
                  <div className="text-lg font-bold text-app-text">
                    {data.totalInterruptions}
                  </div>
                </div>

                <div className="flex flex-col justify-center">
                  <span className="text-xs font-medium text-app-muted mb-1">Downtime</span>
                  <div className="text-lg font-bold text-app-text">
                    {formatDuration(data.totalDowntime)}
                  </div>
                </div>
              </div>

              {/* Connection Timeline */}
              <div>
                <h4 className="text-sm font-bold uppercase tracking-wider text-app-muted mb-4">
                  Connection Timeline
                </h4>
                {data.logs.length === 0 ? (
                  <p className="text-app-muted text-sm italic py-2">
                    No attendance events recorded for this class session.
                  </p>
                ) : (
                  <div className="relative pl-6 border-l-2 border-app-border space-y-6 ml-3">
                    {data.logs.map((log: AttendanceLogEntry) => (
                      <div key={log.id} className="relative">
                        <div
                          className={cn(
                            "absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-app-surface",
                            getEventDotClass(log.eventType)
                          )}
                        />
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-sm text-app-text">
                                {getEventLabel(log.eventType)}
                              </span>
                              {getEventIcon(log.eventType)}
                            </div>
                            {log.reason && (
                              <div className="text-xs text-app-muted mt-0.5">
                                Reason: {log.reason}
                              </div>
                            )}
                            {log.sessionDuration != null && (
                              <div className="text-xs text-app-muted mt-0.5">
                                Segment duration: {formatDuration(log.sessionDuration)}
                              </div>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-app-muted tabular-nums whitespace-nowrap">
                            {formatTime(log.timestamp, timeZone)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
