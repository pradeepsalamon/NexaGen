"use client";

import { useEffect, useState } from "react";
import type { LiveClassMonitoring, LiveMonitoringStudent } from "@nexa-chess/types";
import { Radio, RefreshCw, Users, Wifi, WifiOff } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { cn } from "@/lib/utils";
import { useLiveClassMonitoring } from "../hooks/useLiveClassMonitoring";

type Connection = "online" | "left" | "absent";

function connectionOf(s: LiveMonitoringStudent): Connection {
  if (s.isOnline) return "online";
  return s.joinedAt ? "left" : "absent";
}

const ORDER: Record<Connection, number> = { online: 0, left: 1, absent: 2 };

function useElapsed(startedAt: string | null): string | null {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  if (!startedAt) return null;
  const secs = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveClassMonitor({ classId, enabled = true }: { classId: string; enabled?: boolean }) {
  const timeZone = useUserTimeZone();
  const { data, isLoading, isError, isFetching } = useLiveClassMonitoring(classId, enabled);
  const elapsed = useElapsed(data?.startedAt ?? null);

  if (isLoading) {
    return (
      <Card className="space-y-3 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="p-5">
        <p className="text-sm text-app-muted">Live monitoring is unavailable for this class.</p>
      </Card>
    );
  }

  return <MonitorBody data={data} elapsed={elapsed} isFetching={isFetching} timeZone={timeZone} />;
}

function MonitorBody({
  data,
  elapsed,
  isFetching,
  timeZone
}: {
  data: LiveClassMonitoring;
  elapsed: string | null;
  isFetching: boolean;
  timeZone: string;
}) {
  const students = [...data.students].sort((a, b) => {
    const byConn = ORDER[connectionOf(a)] - ORDER[connectionOf(b)];
    return byConn !== 0 ? byConn : a.name.localeCompare(b.name);
  });

  const online = students.filter((s) => connectionOf(s) === "online").length;
  const left = students.filter((s) => connectionOf(s) === "left").length;
  const absent = students.filter((s) => connectionOf(s) === "absent").length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border/60 p-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-2.5 items-center justify-center rounded-full",
              data.isLive ? "bg-green-500" : "bg-app-muted"
            )}
          >
            {data.isLive && <span className="size-2.5 animate-ping rounded-full bg-green-500" />}
          </span>
          <h3 className="text-sm font-bold uppercase tracking-wide text-app-text">
            {data.isLive ? "Live class monitor" : "Class not live"}
          </h3>
          {isFetching && <RefreshCw className="size-3.5 animate-spin text-app-muted" />}
        </div>
        {elapsed && data.isLive && (
          <span className="flex items-center gap-1.5 font-mono text-sm font-semibold text-app-text">
            <Radio className="size-4 text-green-500" />
            {elapsed}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 divide-x divide-app-border/60 border-b border-app-border/60">
        <Stat icon={<Wifi className="size-4 text-green-600" />} label="Online" value={online} />
        <Stat icon={<WifiOff className="size-4 text-app-muted" />} label="Left" value={left} />
        <Stat icon={<Users className="size-4 text-app-muted" />} label="Not joined" value={absent} />
      </div>

      {students.length === 0 ? (
        <p className="p-6 text-center text-sm text-app-muted">No students enrolled in this batch.</p>
      ) : (
        <ul className="divide-y divide-app-border/50">
          {students.map((s) => (
            <StudentRow key={s.id} student={s} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-3">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-app-muted">
        {icon}
        {label}
      </div>
      <span className="text-xl font-bold text-app-text">{value}</span>
    </div>
  );
}

function StudentRow({ student, timeZone }: { student: LiveMonitoringStudent; timeZone: string }) {
  const conn = connectionOf(student);
  const dot =
    conn === "online" ? "bg-green-500" : conn === "left" ? "bg-amber-500" : "bg-app-border";
  const label =
    conn === "online" ? "Online" : conn === "left" ? "Left" : "Not joined";

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn("size-2.5 shrink-0 rounded-full", dot)} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-app-text">{student.name}</p>
          <p className="text-xs text-app-muted">
            {label}
            {student.joinedAt && <> · joined {formatTime(student.joinedAt, timeZone)}</>}
            {conn === "left" && student.lastActivity && (
              <> · last seen {formatTime(student.lastActivity, timeZone)}</>
            )}
          </p>
        </div>
      </div>
      {student.reconnectCount > 0 && (
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
          {student.reconnectCount}× reconnect
        </span>
      )}
    </li>
  );
}

export function LiveClassMonitorDialog({
  classId,
  open,
  onOpenChange
}: {
  classId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live class monitor</DialogTitle>
          <DialogDescription>
            Who is connected right now, updated every few seconds.
          </DialogDescription>
        </DialogHeader>
        {classId && <LiveClassMonitor classId={classId} enabled={open} />}
      </DialogContent>
    </Dialog>
  );
}
