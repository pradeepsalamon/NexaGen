"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useConnectionState,
  useConnectionQualityIndicator,
  useIsRecording,
  useLocalParticipant,
} from "@livekit/components-react";
import { ConnectionState, ConnectionQuality, type Participant } from "livekit-client";
import { cn } from "@/lib/utils";
import { useMeetingTimer } from "../../hooks/useMeetingTimer";
import { useOptionalLiveClassState } from "../../providers/LiveClassProvider";
import { Z, useReducedMotion } from "../../lib/meetingUi";
import { Timer, Radio, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { SimpleTooltip } from "@/components/ui/Tooltip";

// ─── Connection quality → presentation ───────────────────────

type ConnState = "excellent" | "good" | "weak" | "reconnecting" | "offline";

function useConnectionSummary(): {
  state: ConnState;
  label: string;
  tip: string;
  dot: string;
} {
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
      tip: "Trying to restore your connection…",
      dot: "bg-amber-500",
    };
  }
  if (connectionState === ConnectionState.Disconnected) {
    return {
      state: "offline",
      label: "Offline",
      tip: "You are disconnected from the class.",
      dot: "bg-app-danger",
    };
  }
  if (quality === ConnectionQuality.Poor) {
    return {
      state: "weak",
      label: "Weak",
      tip: "Connection is unstable — video quality may drop.",
      dot: "bg-amber-500",
    };
  }
  if (quality === ConnectionQuality.Good) {
    return { state: "good", label: "Good", tip: "Connection is stable.", dot: "bg-emerald-500" };
  }
  return {
    state: "excellent",
    label: "Excellent",
    tip: "Connection is stable.",
    dot: "bg-emerald-500",
  };
}

/** Connection pill for the classroom top bar. Full label on `sm+`, dot only below. */
export function ConnectionPill({ className }: { className?: string }) {
  const { label, tip, dot } = useConnectionSummary();

  return (
    <SimpleTooltip label={tip} side="bottom">
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-2 py-1 text-xs font-semibold text-app-muted sm:px-2.5",
          className,
        )}
        role="status"
        aria-label={`Connection: ${label}`}
      >
        <span className={cn("size-2 rounded-full", dot)} />
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
            "pointer-events-none fixed inset-x-0 top-14 flex justify-center px-3",
            Z.banner,
          )}
          role="status"
        >
          <div className="flex items-center gap-2 rounded-b-app border border-t-0 border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-600 backdrop-blur dark:text-amber-400">
            <span className="size-2 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none" />
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
      ? "bg-amber-400"
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
      colorClass = "text-app-danger border-app-danger bg-app-danger/10 hover:bg-app-danger/20";
      isWarning = true;
    } else if (remainingSeconds <= 300) {
      colorClass = "text-amber-500 border-amber-500 bg-amber-500/10 hover:bg-amber-500/20";
      isWarning = true;
    } else {
      colorClass = "text-primary border-primary bg-primary/10 hover:bg-primary/20";
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
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors",
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
  const lkRecording = useIsRecording();
  const contextState = useOptionalLiveClassState();
  const isRecording =
    isRecordingProp ?? (lkRecording || contextState?.isRecording || false);

  if (!isRecording) return null;

  return (
    <span
      className={cn(
        "flex items-center gap-1.5 rounded-full bg-app-danger/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-app-danger",
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

// ─── Live Badge ──────────────────────────────────────────────

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400",
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
