"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Circle, Eye, Radio, RefreshCw, UserRound, Users } from "lucide-react";
import type { LiveClassMonitorItem } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { useLiveClassesMonitor } from "../hooks/useLiveMonitor";

/** "12 min" / "1 h 05 min" since `iso`, against a ticking clock. */
export function formatElapsed(iso: string | null, now: number): string {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function LiveClassCard({ item, now, tz }: { item: LiveClassMonitorItem; now: number; tz: string }) {
  const students =
    item.studentsInRoom === null
      ? "—"
      : item.enrolledCount > 0
        ? `${item.studentsInRoom} / ${item.enrolledCount}`
        : String(item.studentsInRoom);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="destructive">
          <Circle aria-hidden className="size-2 fill-current motion-safe:animate-pulse" />
          LIVE
        </Badge>
        {item.isDemo ? <Badge variant="info">Demo</Badge> : null}
        {item.isRecording ? <Badge variant="warning">Recording</Badge> : null}
        {item.coachInRoom === false ? <Badge variant="outline">Coach not in room</Badge> : null}
      </div>

      <div className="min-w-0">
        <h2 className="truncate text-lg font-extrabold leading-tight text-app-text">{item.title}</h2>
        {item.topic && item.topic !== item.title ? (
          <p className="mt-0.5 truncate text-sm text-app-muted">{item.topic}</p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-app-muted">Coach</dt>
          <dd className="flex items-center gap-1.5 truncate font-semibold text-app-text">
            <UserRound aria-hidden className="size-3.5 shrink-0 text-app-muted" />
            <span className="truncate">{item.coachName}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-app-muted">{item.isDemo ? "Guests in room" : "Students in room"}</dt>
          <dd className="flex items-center gap-1.5 font-semibold text-app-text">
            <Users aria-hidden className="size-3.5 shrink-0 text-app-muted" />
            {students}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-app-muted">Batch</dt>
          <dd className="truncate font-semibold text-app-text">
            {item.batchName ?? (item.isDemo ? "Demo class" : "—")}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-app-muted">Running for</dt>
          <dd className="font-semibold text-app-text">
            {formatElapsed(item.startedAt, now)}
            <span className="ml-1 text-xs font-normal text-app-muted">
              (ends {formatTime(item.endsAt, tz)})
            </span>
          </dd>
        </div>
      </dl>

      <Button asChild className="mt-auto w-full" variant="primary">
        <Link href={`/admin/live-classes/${item.classId}`}>
          <Eye aria-hidden className="size-4" />
          Watch class
        </Link>
      </Button>
    </Card>
  );
}

export function LiveClassesMonitorClient() {
  const tz = useUserTimeZone();
  const now = useNow();
  const { data, error, isFetching, isLoading, refetch } = useLiveClassesMonitor({ refetchIntervalMs: 10_000 });
  const classes = data?.classes ?? [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Live Now</h1>
          <p className="mt-1 text-app-muted">
            Every class running right now. Watch any of them silently — the coach and students won&apos;t see
            you, and you can&apos;t be heard or change anything in the room.
          </p>
        </div>
        <Button disabled={isFetching} onClick={() => void refetch()} variant="outline">
          <RefreshCw aria-hidden className={isFetching ? "size-4 motion-safe:animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>

      {error ? (
        <WidgetError message="Couldn't load the live classes." onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton className="h-64 rounded-app" key={i} />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          description="When a coach starts a class it shows up here within a few seconds."
          icon={Radio}
          title="No classes are live right now"
        />
      ) : (
        <>
          <p className="text-sm text-app-muted">
            {classes.length} {classes.length === 1 ? "class" : "classes"} live
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((item) => (
              <LiveClassCard item={item} key={item.classId} now={now} tz={tz} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
