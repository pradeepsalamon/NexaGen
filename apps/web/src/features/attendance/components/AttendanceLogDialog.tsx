import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type AttendanceLogsResponse, type AttendanceLogEntry } from "@nexa-chess/types";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";
import { AttendancePercentBar } from "./AttendancePercentBar";
import { LogIn, LogOut, WifiOff, RefreshCcw, Clock } from "lucide-react";

interface AttendanceLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string | null;
  studentId: string | null;
  title?: string;
  date?: string;
}

export function AttendanceLogDialog({ 
  open, 
  onOpenChange, 
  classId, 
  studentId,
  title = "Class Attendance Details",
  date
}: AttendanceLogDialogProps) {
  const [data, setData] = useState<AttendanceLogsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      if (!open || !classId || !studentId) return;
      
      try {
        setIsLoading(true);
        setError(null);
        const res = await apiFetch<AttendanceLogsResponse>(
          API_ROUTES.attendance.classLogs(classId, studentId)
        );
        setData(res);
      } catch (err: any) {
        setError(err.message || "Failed to load attendance logs");
      } finally {
        setIsLoading(false);
      }
    }

    fetchLogs();
  }, [open, classId, studentId]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case "JOIN": return <LogIn className="h-4 w-4 text-green-500" />;
      case "LEAVE": return <LogOut className="h-4 w-4 text-orange-500" />;
      case "DISCONNECT": return <WifiOff className="h-4 w-4 text-red-500" />;
      case "RECONNECT": return <RefreshCcw className="h-4 w-4 text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventLabel = (type: string) => {
    switch (type) {
      case "JOIN": return "Joined Class";
      case "LEAVE": return "Left Class";
      case "DISCONNECT": return "Disconnected";
      case "RECONNECT": return "Reconnected";
      default: return type;
    }
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (!seconds && seconds !== 0) return "0 min";
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg md:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0">
        <div className="p-6 pb-4 border-b border-app-border">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-3">
              Attendance Logs
              {data && <AttendanceStatusBadge status={data.status} className="text-xs" />}
            </DialogTitle>
            <DialogDescription>
              {title} {date ? `• ${format(new Date(date), "MMM d, yyyy")}` : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-32 w-full rounded-lg" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-sm text-app-muted mb-1">Percentage</div>
                  <div className="text-xl font-bold flex flex-col gap-2">
                    {data.attendancePercent ?? 0}%
                    <AttendancePercentBar percent={data.attendancePercent ?? 0} showText={false} />
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-sm text-app-muted mb-1">Duration</div>
                  <div className="text-xl font-bold text-app-text">
                    {formatDuration(data.totalDuration)} <span className="text-sm font-normal text-app-muted">/ {formatDuration(data.scheduledDuration)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-sm text-app-muted mb-1">Interruptions</div>
                  <div className="text-xl font-bold text-app-text">
                    {data.totalInterruptions}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-sm text-app-muted mb-1">Downtime</div>
                  <div className="text-xl font-bold text-app-text">
                    {formatDuration(data.totalDowntime)}
                  </div>
                </div>
              </div>

              {/* Event Timeline */}
              <div>
                <h4 className="font-semibold text-app-text mb-4">Event Timeline</h4>
                {data.logs.length === 0 ? (
                  <p className="text-app-muted text-sm italic">No attendance events recorded for this class.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="relative pl-6 border-l-2 border-app-border ml-2 space-y-6">
                      {data.logs.map((log: AttendanceLogEntry) => (
                        <div key={log.id} className="relative">
                          <div className="absolute -left-[35px] bg-app-background p-1 rounded-full border border-app-border">
                            {getEventIcon(log.eventType)}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                            <div>
                              <div className="font-medium text-app-text">
                                {getEventLabel(log.eventType)}
                              </div>
                              {log.reason && (
                                <div className="text-sm text-app-muted">
                                  Reason: {log.reason}
                                </div>
                              )}
                              {log.sessionDuration != null && (
                                <div className="text-sm text-app-muted mt-1">
                                  Segment duration: {formatDuration(log.sessionDuration)}
                                </div>
                              )}
                            </div>
                            <div className="text-sm font-medium text-app-text tabular-nums whitespace-nowrap">
                              {format(new Date(log.timestamp), "h:mm:ss a")}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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
