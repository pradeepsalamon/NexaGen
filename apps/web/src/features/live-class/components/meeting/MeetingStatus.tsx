"use client";

import { useConnectionState, useConnectionQualityIndicator } from "@livekit/components-react";
import { ConnectionState, ConnectionQuality, type Participant } from "livekit-client";
import { cn } from "@/lib/utils";
import { useMeetingTimer } from "../../hooks/useMeetingTimer";
import { Timer, Wifi, WifiOff, Radio, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";

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

export function TimerBadge({ className, startedAt, endsAt }: { className?: string, startedAt?: string | null, endsAt?: string | null }) {
  const { formatted, isRunning, toggleMode, mode, remainingSeconds } = useMeetingTimer(startedAt, endsAt);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";
  const toastShownRef = useRef<{ fiveMin: boolean, oneMin: boolean }>({ fiveMin: false, oneMin: false });

  useEffect(() => {
    if (!isCoach || !endsAt) return;

    if (remainingSeconds > 0) {
      if (remainingSeconds <= 60 && !toastShownRef.current.oneMin) {
        toast.error("Class ends in less than 1 minute!", { duration: 5000 });
        toastShownRef.current.oneMin = true;
      } else if (remainingSeconds <= 300 && remainingSeconds > 60 && !toastShownRef.current.fiveMin) {
        toast.warning("Class ends in 5 minutes.", { duration: 5000 });
        toastShownRef.current.fiveMin = true;
      }
    }
  }, [remainingSeconds, isCoach, endsAt]);

  if (!isRunning) return null;

  let colorClass = "text-app-muted border-app-border hover:bg-app-surface";
  let isWarning = false;

  if (mode === "down") {
    if (remainingSeconds <= 60) {
      colorClass = "text-red-500 border-red-500 bg-red-500/10 hover:bg-red-500/20";
      isWarning = true;
    } else if (remainingSeconds <= 300) {
      colorClass = "text-amber-500 border-amber-500 bg-amber-500/10 hover:bg-amber-500/20";
      isWarning = true;
    } else {
      colorClass = "text-primary border-primary bg-primary/10 hover:bg-primary/20";
    }
  }

  const tooltipText = mode === "up" ? "Elapsed Time (Click to toggle)" : "Remaining Time (Click to toggle)";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleMode}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur-sm tabular-nums transition-colors",
              colorClass,
              className,
            )}
            role="timer"
            aria-label={`Meeting duration: ${formatted}`}
          >
            {isWarning ? <TriangleAlert className="size-3.5" /> : <Timer className="size-3.5" />}
            <span>{formatted}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
