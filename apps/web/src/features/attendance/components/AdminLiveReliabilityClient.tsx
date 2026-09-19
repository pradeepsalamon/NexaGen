"use client";

import type { LiveReliabilityClass, LiveReliabilityParticipant } from "@nexa-chess/types";
import { AlertTriangle, RefreshCw, ShieldCheck, TrendingUp, Video, Wifi, WifiOff } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useLiveReliabilityOverview } from "../hooks/useLiveReliabilityOverview";
import { useReliabilityMetrics } from "../hooks/useReliabilityMetrics";

// Admin cross-class reliability view (RELIABILITY_DESIGN.md §4.5): every
// currently-LIVE class with a participant (coach or student) in
// RECONNECTING/OFFLINE presence right now. A healthy class simply doesn't
// appear in the list — this is a triage view, not a full roster (that's
// LiveClassMonitor, per class).

const PRESENCE_DOT: Record<"RECONNECTING" | "OFFLINE", string> = {
  RECONNECTING: "bg-amber-500 animate-pulse",
  OFFLINE: "bg-orange-500",
};

const PRESENCE_LABEL: Record<"RECONNECTING" | "OFFLINE", string> = {
  RECONNECTING: "Reconnecting",
  OFFLINE: "Offline",
};

export function AdminLiveReliabilityClient() {
  const timeZone = useUserTimeZone();
  const { data, isLoading, isError, isFetching } = useLiveReliabilityOverview();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-app-text">Live reliability</h1>
          <p className="text-sm text-app-muted">
            Currently-live classes with a coach or student losing connection right now.
          </p>
        </div>
        {isFetching && !isLoading && (
          <span className="flex items-center gap-1.5 text-xs text-app-muted">
            <RefreshCw className="size-3.5 animate-spin" />
            Updating
          </span>
        )}
      </div>

      {isLoading ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      ) : isError || !data ? (
        <Card className="p-5">
          <p className="text-sm text-app-muted">The reliability view is unavailable right now.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard icon={<Video className="size-4 text-app-muted" />} label="Live classes" value={data.liveClassCount} />
            <StatCard
              icon={<AlertTriangle className="size-4 text-amber-500" />}
              label="Affected classes"
              value={data.affectedClassCount}
              tone={data.affectedClassCount > 0 ? "warn" : undefined}
            />
            <StatCard icon={<Wifi className="size-4 text-amber-500" />} label="Reconnecting" value={data.totalReconnecting} />
            <StatCard icon={<WifiOff className="size-4 text-orange-500" />} label="Offline" value={data.totalOffline} />
          </div>

          {data.classes.length === 0 ? (
            <Card className="flex items-center gap-3 p-6">
              <ShieldCheck className="size-5 shrink-0 text-green-600" />
              <p className="text-sm text-app-muted">
                {data.liveClassCount === 0
                  ? "No classes are currently live."
                  : "All live classes look healthy — every participant is connected."}
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.classes.map((c) => (
                <ClassCard key={c.classId} liveClass={c} timeZone={timeZone} />
              ))}
            </div>
          )}
        </>
      )}

      <ReliabilityMetricsPanel />
    </div>
  );
}

function ReliabilityMetricsPanel() {
  const { data, isLoading, isError } = useReliabilityMetrics(30);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="size-4 text-app-muted" />
        <h2 className="text-sm font-bold uppercase tracking-wide text-app-text">
          Last {data?.windowDays ?? 30} days
        </h2>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : isError || !data ? (
        <p className="text-sm text-app-muted">Reliability metrics are unavailable right now.</p>
      ) : data.totalParticipantSessions === 0 ? (
        <p className="text-sm text-app-muted">
          No completed classes in this window ({data.sampledClasses} sampled).
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <MetricRow
            label="Webhook loss rate"
            hint="Participant sessions that never got a clean LiveKit leave event"
            rate={data.webhookLossRate}
            count={data.webhookLossCount}
            total={data.totalParticipantSessions}
          />
          <MetricRow
            label="Heartbeat fallback rate"
            hint="Sessions the heartbeat-timeout sweep had to close itself"
            rate={data.heartbeatFallbackRate}
            count={data.heartbeatFallbackCount}
            total={data.totalParticipantSessions}
          />
        </div>
      )}
    </Card>
  );
}

function MetricRow({
  label,
  hint,
  rate,
  count,
  total,
}: {
  label: string;
  hint: string;
  rate: number;
  count: number;
  total: number;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
      <p className="text-lg font-bold text-app-text">
        {(rate * 100).toFixed(1)}%
        <span className="ml-1.5 text-xs font-normal text-app-muted">
          ({count} of {total})
        </span>
      </p>
      <p className="text-xs text-app-muted">{hint}</p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <Card
      className={cn(
        "flex items-center gap-3 p-4",
        tone === "warn" && value > 0 && "border-amber-300 bg-amber-50"
      )}
    >
      {icon}
      <div>
        <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
        <p className="text-lg font-bold text-app-text">{value}</p>
      </div>
    </Card>
  );
}

function ClassCard({ liveClass, timeZone }: { liveClass: LiveReliabilityClass; timeZone: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border/60 bg-amber-50/60 p-4">
        <div>
          <p className="text-sm font-bold text-app-text">{liveClass.title}</p>
          <p className="text-xs text-app-muted">
            {liveClass.coachName}
            {liveClass.batchName && <> · {liveClass.batchName}</>}
            {liveClass.startedAt && <> · started {formatTime(liveClass.startedAt, timeZone)}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {liveClass.reconnectingCount > 0 && (
            <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {liveClass.reconnectingCount} reconnecting
            </span>
          )}
          {liveClass.offlineCount > 0 && (
            <span className="rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
              {liveClass.offlineCount} offline
            </span>
          )}
        </div>
      </div>
      <ul className="divide-y divide-app-border/50">
        {liveClass.affectedParticipants.map((p) => (
          <ParticipantRow key={`${p.role}-${p.id}`} participant={p} timeZone={timeZone} />
        ))}
      </ul>
    </Card>
  );
}

function ParticipantRow({
  participant,
  timeZone,
}: {
  participant: LiveReliabilityParticipant;
  timeZone: string;
}) {
  const presence = participant.presence as "RECONNECTING" | "OFFLINE";
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className={cn("size-2.5 shrink-0 rounded-full", PRESENCE_DOT[presence])} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-app-text">{participant.name}</p>
          <p className="text-xs text-app-muted">
            {participant.role === "COACH" ? "Coach" : "Student"} · {PRESENCE_LABEL[presence]}
            {participant.lastHeartbeatAt && (
              <> · last ping {formatTime(participant.lastHeartbeatAt, timeZone)}</>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}
