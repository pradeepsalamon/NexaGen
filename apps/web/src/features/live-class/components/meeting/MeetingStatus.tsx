"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useConnectionState,
  useConnectionQualityIndicator,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState, ConnectionQuality, type Participant } from "livekit-client";
import { cn } from "@/lib/utils";
import { useMeetingTimer } from "../../hooks/useMeetingTimer";
import { useRecordingState } from "../../hooks/useRecordingState";
import { Z, useReducedMotion } from "../../lib/meetingUi";
import { Timer, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { SimpleTooltip } from "@/components/ui/Tooltip";

// ─── Connection quality → presentation ───────────────────────

type ConnState = "excellent" | "good" | "weak" | "reconnecting" | "offline";

interface ConnectionSummary {
  state: ConnState;
  /** Pill text. Reads "Live" whenever we are actually in the room. */
  label: string;
  /** Human name for the current network strength, shown in the tooltip. */
  quality: string;
  /** Dot + text + chrome colours, so the pill itself carries the signal. */
  dot: string;
  text: string;
  ring: string;
  /** Reconnecting is the only state worth animating. */
  pulse: boolean;
}

function useConnectionSummary(): ConnectionSummary {
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  if (
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting ||
    connectionState === ConnectionState.Connecting
  ) {
    return {
      state: "reconnecting",
      label: "Reconnecting",
      quality: "Reconnecting",
      dot: "bg-warning",
      text: "text-warning-ink",
      ring: "border-warning/40 bg-warning/10",
      pulse: true,
    };
  }
  if (connectionState === ConnectionState.Disconnected) {
    return {
      state: "offline",
      label: "Offline",
      quality: "Offline",
      dot: "bg-app-danger",
      text: "text-app-danger-ink",
      ring: "border-app-danger/40 bg-app-danger/10",
      pulse: false,
    };
  }
  if (quality === ConnectionQuality.Poor) {
    return {
      state: "weak",
      label: "Live",
      quality: "Weak network",
      dot: "bg-app-danger",
      text: "text-app-danger-ink",
      ring: "border-app-danger/40 bg-app-danger/10",
      pulse: false,
    };
  }
  if (quality === ConnectionQuality.Good) {
    return {
      state: "good",
      label: "Live",
      quality: "Good network",
      dot: "bg-warning",
      text: "text-warning-ink",
      ring: "border-warning/40 bg-warning/10",
      pulse: false,
    };
  }
  if (quality === ConnectionQuality.Unknown) {
    return {
      state: "good",
      label: "Live",
      quality: "Measuring…",
      dot: "bg-app-muted",
      text: "text-app-muted",
      ring: "border-app-border bg-app-surface",
      pulse: false,
    };
  }
  return {
    state: "excellent",
    label: "Live",
    quality: "Excellent network",
    dot: "bg-success",
    text: "text-success-ink",
    ring: "border-success/40 bg-success/10",
    pulse: false,
  };
}

/**
 * The classroom's single "are we live, and is the network holding up?" chip.
 * The word stays "Live" while connected — the colour is what carries network
 * strength (green excellent / amber good / red weak), with the precise state
 * spelled out in the tooltip. Full label on `sm+`, dot only below.
 */
export function ConnectionPill({ className }: { className?: string }) {
  const { dot, label, pulse, quality, ring, text } = useConnectionSummary();

  return (
    <SimpleTooltip label={quality} side="bottom">
      <div
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-full border px-2 text-xs font-bold sm:px-2.5",
          ring,
          text,
          className,
        )}
        role="status"
        aria-label={quality}
      >
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            dot,
            pulse && "motion-safe:animate-pulse",
          )}
        />
        <span className="hidden sm:inline">{label}</span>
      </div>
    </SimpleTooltip>
  );
}

/** Slim, non-blocking banner shown only while the room is reconnecting. */
export function ConnectionBanner() {
  const connectionState = useConnectionState();
  const reducedMotion = useReducedMotion();
  const reconnecting =
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting;

  return (
    <AnimatePresence>
      {reconnecting && (
        <motion.div
          key="reconnect-banner"
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "pointer-events-none fixed inset-x-0 top-16 flex justify-center px-3",
            Z.banner,
          )}
          role="status"
        >
          <div className="flex items-center gap-2 rounded-b-app border border-t-0 border-warning/40 bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning-ink backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
            Connection interrupted — reconnecting…
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Per-participant network quality (video tiles, participant list) ──────────

interface NetworkQualityProps {
  participant: Participant;
  className?: string;
}

export function NetworkQualityIndicator({ participant, className }: NetworkQualityProps) {
  const { quality } = useConnectionQualityIndicator({ participant });

  const isUnknown = quality === ConnectionQuality.Unknown;
  const bars = isUnknown
    ? 0
    : quality === ConnectionQuality.Excellent
      ? 3
      : quality === ConnectionQuality.Good
        ? 2
        : 1;

  const color =
    quality === ConnectionQuality.Poor
      ? "bg-warning"
      : quality === ConnectionQuality.Good
        ? "bg-white/70"
        : "bg-white";

  const qualityLabel = isUnknown ? "Calculating…" : quality;

  return (
    <SimpleTooltip label={`Connection: ${qualityLabel}`}>
      <div
        className={cn("flex items-end gap-px", className)}
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
    </SimpleTooltip>
  );
}

// ─── Timer Badge ──────────────────────────────────────────────

export function TimerBadge({
  className,
  startedAt,
  endsAt,
}: {
  className?: string;
  startedAt?: string | null;
  endsAt?: string | null;
}) {
  const { formatted, isRunning, toggleMode, mode, remainingSeconds, isOvertime } =
    useMeetingTimer(startedAt, endsAt);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const toastShownRef = useRef<{ fiveMin: boolean; oneMin: boolean }>({
    fiveMin: false,
    oneMin: false,
  });

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

  let colorClass = "text-app-muted border-app-border hover:bg-app-soft";
  let isWarning = false;

  if (mode === "down") {
    if (isOvertime || remainingSeconds <= 60) {
      colorClass = "text-app-danger-ink border-app-danger bg-app-danger/10 hover:bg-app-danger/20";
      isWarning = true;
    } else if (remainingSeconds <= 300) {
      colorClass = "text-warning-ink border-warning bg-warning/10 hover:bg-warning/20";
      isWarning = true;
    } else {
      colorClass = "text-primary-ink border-primary bg-primary/10 hover:bg-primary/20";
    }
  }

  const tooltipText =
    mode === "up"
      ? "Elapsed time — tap to show time remaining"
      : isOvertime
        ? "Overtime — tap to show elapsed time"
        : "Time remaining — tap to show elapsed time";

  return (
    <SimpleTooltip label={tooltipText} side="bottom">
      <button
        onClick={toggleMode}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold tabular-nums transition-colors",
          colorClass,
          className,
        )}
        aria-label={`Meeting duration: ${formatted}`}
      >
        {isWarning ? <TriangleAlert className="size-3.5" /> : <Timer className="size-3.5" />}
        <span>{formatted}</span>
      </button>
    </SimpleTooltip>
  );
}

// ─── Recording Badge ─────────────────────────────────────────

export function RecordingBadge({
  isRecording: isRecordingProp,
  className,
}: {
  isRecording?: boolean;
  className?: string;
}) {
  const { isRecording: liveRecording } = useRecordingState();
  const isRecording = isRecordingProp ?? liveRecording;

  if (!isRecording) return null;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-app-danger/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-app-danger-ink",
        className,
      )}
      role="status"
      aria-label="Recording in progress"
    >
      <span className="size-1.5 rounded-full bg-app-danger motion-safe:animate-pulse" />
      Rec
    </span>
  );
}
