"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  CalendarX,
  LogIn,
  LogOut,
  WifiOff,
  RefreshCcw,
  Clock,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type ClassDetailReport,
} from "@nexa-chess/types";
import { AttendanceStatusBadge } from "@/features/attendance/components/AttendanceStatusBadge";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { BackButton } from "@/components/ui/BackButton";

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.id as string;
  const [data, setData] = useState<ClassDetailReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  useEffect(() => {
    async function loadClassDetail() {
      try {
        setIsLoading(true);
        const result = await apiFetch<ClassDetailReport>(
          API_ROUTES.attendance.classDetail(classId)
        );
        setData(result);
      } catch (error) {
        console.error("Failed to load class detail", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadClassDetail();
  }, [classId]);

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0 min";
    const minutes = Math.floor(seconds / 60);
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${minutes} min`;
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "JOIN":
        return <LogIn className="h-4 w-4 text-green-500" />;
      case "LEAVE":
        return <LogOut className="h-4 w-4 text-red-500" />;
      case "DISCONNECT":
        return <WifiOff className="h-4 w-4 text-orange-500" />;
      case "RECONNECT":
        return <RefreshCcw className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-app-muted" />;
    }
  };

  const toggleStudent = (id: string) => {
    setExpandedStudent(expandedStudent === id ? null : id);
  };

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 max-w-6xl p-4 sm:p-6">
        <BackButton label="Back to Classes" />
        <div className="flex flex-col items-center justify-center h-[50vh] text-center">
          <div className="p-4 bg-app-soft rounded-full mb-4">
            <CalendarX className="h-10 w-10 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Class Not Found</h2>
          <p className="text-app-muted max-w-md">
            The requested class report could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl p-4 sm:p-6">
      <BackButton label="Back to Classes" />

      {/* Class Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-bold tracking-tight text-app-text">
            {data.topic}
          </h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              data.status === "COMPLETED"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {data.status}
          </span>
        </div>
        <p className="text-app-muted">
          {data.batchName} &middot; {data.coachName}
        </p>
        <p className="text-app-muted text-sm mt-0.5">
          {new Date(data.scheduledStart).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          {" "}
          {new Date(data.scheduledStart).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          —{" "}
          {new Date(data.scheduledEnd).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Clock className="h-5 w-5 text-primary" />
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight">
              {formatDuration(data.scheduledDuration)}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Scheduled Duration
            </p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Clock className="h-5 w-5 text-blue-500" />
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-blue-600">
              {formatDuration(data.actualDuration)}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Actual Duration
            </p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Users className="h-5 w-5 text-purple-500" />
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-purple-600">
              {data.presentCount + data.lateCount + data.partialCount}{" "}
              <span className="text-lg text-app-muted font-medium">
                / {data.totalStudents}
              </span>
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Students Attended
            </p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <Users className="h-5 w-5 text-green-500" />
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-2xl font-bold tracking-tight">
                {Math.round(data.overallPercent)}%
              </p>
              <AttendancePercentBar percent={data.overallPercent} showText={false} />
            </div>
            <p className="text-sm font-medium text-app-muted mt-1">
              Overall Attendance
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Coach Attendance */}
      {data.coachAttendance && (
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardHeader className="bg-app-soft/50 border-b border-app-border">
            <CardTitle className="text-lg">
              Coach Attendance — {data.coachAttendance.coachName}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs font-medium text-app-muted uppercase">
                  Joined
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatTime(data.coachAttendance.joinedAt)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase">
                  Left
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatTime(data.coachAttendance.leftAt)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase">
                  Total Duration
                </p>
                <p className="text-sm font-medium text-app-text">
                  {data.coachAttendance.totalDuration
                    ? formatDuration(data.coachAttendance.totalDuration)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted uppercase">
                  Reconnects
                </p>
                <p className="text-sm font-medium text-app-text">
                  {data.coachAttendance.reconnectCount}
                </p>
              </div>
            </div>

            {/* Coach Event Timeline */}
            {data.coachAttendance.logs.length > 0 && (
              <div className="border-t border-app-border pt-4">
                <h4 className="text-sm font-semibold text-app-text mb-3">
                  Event Timeline
                </h4>
                <div className="space-y-2">
                  {data.coachAttendance.logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 text-sm"
                    >
                      {getEventIcon(log.eventType)}
                      <span className="text-app-muted">
                        {new Date(log.timestamp).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="font-medium text-app-text">
                        {log.eventType}
                      </span>
                      {log.reason && (
                        <span className="text-app-muted italic">
                          — {log.reason}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Student Attendance Table */}
      <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
        <CardHeader className="bg-app-soft/50 border-b border-app-border">
          <CardTitle className="text-lg flex justify-between items-center">
            Student Attendance
            <span className="text-sm font-normal text-app-muted">
              Click a row for event details
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                <tr>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold" />
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                    Name
                  </th>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                    Status
                  </th>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                    Joined
                  </th>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                    Left
                  </th>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                    Duration
                  </th>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[160px]">
                    Attendance %
                  </th>
                  <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                    Reconnects
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {data.students.map((student) => (
                  <Fragment key={student.id}>
                    <tr
                      onClick={() => toggleStudent(student.id)}
                      className="hover:bg-app-soft/50 transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-3 md:px-6 md:py-4 w-10">
                        {student.logs.length > 0 &&
                          (expandedStudent === student.id ? (
                            <ChevronDown className="h-4 w-4 text-app-muted" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-app-muted" />
                          ))}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="font-medium text-app-text">
                          {student.name}
                        </div>
                        <div className="text-xs text-app-muted mt-0.5">
                          {student.email}
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <AttendanceStatusBadge status={student.status} />
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                        {formatTime(student.joinedAt)}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                        {formatTime(student.leftAt)}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                        {formatDuration(student.duration)}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <AttendancePercentBar
                          percent={student.attendancePercent}
                        />
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                        {student.reconnectCount}
                      </td>
                    </tr>
                    {expandedStudent === student.id && student.logs.length > 0 && (
                      <tr key={`${student.id}-timeline`}>
                        <td colSpan={8} className="px-3 py-3 md:px-6 md:py-4 bg-app-soft/30">
                          <div className="space-y-1.5 pl-4">
                            <p className="text-xs font-semibold text-app-muted uppercase mb-2">
                              Event Timeline
                            </p>
                            {student.logs.map((log) => (
                              <div
                                key={log.id}
                                className="flex items-center gap-3 text-sm"
                              >
                                {getEventIcon(log.eventType)}
                                <span className="text-app-muted">
                                  {new Date(log.timestamp).toLocaleTimeString(
                                    undefined,
                                    {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      second: "2-digit",
                                    }
                                  )}
                                </span>
                                <span className="font-medium text-app-text">
                                  {log.eventType}
                                </span>
                                {log.reason && (
                                  <span className="text-app-muted italic">
                                    — {log.reason}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight">
              {data.totalStudents}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Total Enrolled
            </p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight text-green-600">
              {data.presentCount + data.lateCount + data.partialCount}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight text-red-600">
              {data.absentCount}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">Absent</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight">
              {Math.round(data.overallPercent)}%
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Average Attendance
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
