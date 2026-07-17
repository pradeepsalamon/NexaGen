"use client";

import { useConnectionState, useConnectionQualityIndicator } from "@livekit/components-react";
import { ConnectionState, ConnectionQuality, type Participant } from "livekit-client";
import { cn } from "@/lib/utils";
import { useMeetingTimer } from "../../hooks/useMeetingTimer";
import { Timer, Wifi, WifiOff, Radio } from "lucide-react";

// ─── Connection Badge ────────────────────────────────────────

const connectionConfig: Record<
  ConnectionState,
  { label: string; dotClass: string; textClass: string; pulse: boolean }
> = {
  [ConnectionState.Connected]: {
    label: "Connected",
    dotClass: "bg-emerald-400",
    textClass: "text-emerald-400",
    pulse: false,
  },
  [ConnectionState.Connecting]: {
    label: "Connecting...",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    pulse: true,
  },
  [ConnectionState.Disconnected]: {
    label: "Disconnected",
    dotClass: "bg-red-400",
    textClass: "text-red-400",
    pulse: false,
  },
  [ConnectionState.Reconnecting]: {
    label: "Reconnecting...",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    pulse: true,
  },
  [ConnectionState.SignalReconnecting]: {
    label: "Reconnecting...",
    dotClass: "bg-amber-400",
    textClass: "text-amber-400",
    pulse: true,
  },
};

export function ConnectionBadge({ compact = false }: { compact?: boolean }) {
  const connectionState = useConnectionState();
  const config = connectionConfig[connectionState];

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface/80 px-3 py-1.5 shadow-sm backdrop-blur-sm"
      role="status"
      aria-label={`Connection status: ${config.label}`}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          config.dotClass,
          config.pulse && "animate-pulse",
        )}
      />
      {!compact && (
        <span className={cn("text-xs font-medium", config.textClass)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// ─── Network Quality Indicator ────────────────────────────────

interface NetworkQualityProps {
  participant: Participant;
  className?: string;
}

export function NetworkQualityIndicator({ participant, className }: NetworkQualityProps) {
  const { quality } = useConnectionQualityIndicator({
    participant: participant,
  });

  const isUnknown = quality === ConnectionQuality.Unknown;

  const bars = isUnknown
    ? 0
    : quality === ConnectionQuality.Excellent
      ? 3
      : quality === ConnectionQuality.Good
        ? 2
        : 1;

  const color = isUnknown
    ? "bg-white/30"
    : quality === ConnectionQuality.Poor
      ? "bg-red-500"
      : quality === ConnectionQuality.Good
        ? "bg-white/70"
        : "bg-white";

  const qualityLabel = isUnknown ? "Calculating..." : quality;

  return (
    <div
      className={cn(
        "flex items-end gap-px",
        className,
      )}
      title={`Connection: ${qualityLabel}`}
      role="img"
      aria-label={`Network quality: ${qualityLabel}`}
    >
      {[1, 2, 3].map((level) => (
        <div
          key={level}
          className={cn(
            "w-[3px] rounded-full transition-colors",
            level <= bars ? color : "bg-white/10",
            level === 1 ? "h-1.5" : level === 2 ? "h-2.5" : "h-3.5",
          )}
        />
      ))}
    </div>
  );
}

// ─── Timer Badge ──────────────────────────────────────────────

export function TimerBadge({ className }: { className?: string }) {
  const { formatted, isRunning } = useMeetingTimer();

  if (!isRunning) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface/80 px-3 py-1.5 text-xs font-medium text-app-muted shadow-sm backdrop-blur-sm tabular-nums",
        className,
      )}
      role="timer"
      aria-label={`Meeting duration: ${formatted}`}
    >
      <Timer className="size-3.5" />
      <span>{formatted}</span>
    </div>
  );
}

// ─── Recording Badge ─────────────────────────────────────────

export function RecordingBadge({
  isRecording = false,
  className,
}: {
  isRecording?: boolean;
  className?: string;
}) {
  if (!isRecording) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-500",
        className,
      )}
      role="status"
      aria-label="Recording in progress"
    >
      <span className="size-2 rounded-full bg-red-500 animate-pulse" />
      REC
    </div>
  );
}

// ─── Live Badge ──────────────────────────────────────────────

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400",
        className,
      )}
      role="status"
      aria-label="Live class in session"
    >
      <Radio className="size-3" />
      Live
    </span>
  );
}

// ─── Network Status Icon ─────────────────────────────────────

export function NetworkStatusIcon({ className }: { className?: string }) {
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;

  return isConnected ? (
    <Wifi className={cn("size-4 text-emerald-400", className)} aria-hidden="true" />
  ) : (
    <WifiOff className={cn("size-4 text-red-400", className)} aria-hidden="true" />
  );
}
