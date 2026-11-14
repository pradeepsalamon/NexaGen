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
import { RefreshCw, Timer, TriangleAlert } from "lucide-react";
import { StatusChip } from "../room-ui/StatusChip";
import { useEffect, useRef } from "react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";
import { SimpleTooltip } from "@/components/ui/Tooltip";

// ─── Live + connection chips (top bar) ───────────────────────

type ConnState = "good" | "weak" | "reconnecting" | "offline" | "measuring";

function useConnectionSummary(): { state: ConnState; label: string } {
  const connectionState = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant });

  if (
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting ||
    connectionState === ConnectionState.Connecting
  ) {
    return { state: "reconnecting", label: "Reconnecting…" };
  }
  if (connectionState === ConnectionState.Disconnected) return { state: "offline", label: "Offline" };
  if (quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost) {
    return { state: "weak", label: "Weak connection" };
  }
  if (quality === ConnectionQuality.Unknown) return { state: "measuring", label: "Measuring connection" };
  return { state: "good", label: quality === ConnectionQuality.Excellent ? "Good connection" : "Fair connection" };
}

/** Red-dot Live chip, shown while this tab is in the room. */
export function LiveChip() {
  const connectionState = useConnectionState();
  if (connectionState !== ConnectionState.Connected && connectionState !== ConnectionState.Reconnecting && connectionState !== ConnectionState.SignalReconnecting) return null;
  return (
    <StatusChip tone="live" role="status" aria-label="Class is live">
      Live
    </StatusChip>
  );
}

/**
 * Connection chip: good (green), weak (amber), reconnecting (amber, the only
 * pulsing state). On phones a good connection shows just its dot, or nothing
 * with `onlyProblemsBelowMd` (a crowded bar), so weak/reconnecting/offline
 * always stay visible.
 */
export function ConnectionChip({ className, onlyProblemsBelowMd = false }: { className?: string; onlyProblemsBelowMd?: boolean }) {
  const { state, label } = useConnectionSummary();
  const fine = state === "good" || state === "measuring";
  const tone = state === "good" ? "success" : state === "measuring" ? "neutral" : "warning";
  return (
    <StatusChip
      tone={tone}
      role="status"
      aria-live="polite"
      hideLabelBelowSm={fine}
      pulse={state === "reconnecting"}
      icon={state === "reconnecting" ? <RefreshCw aria-hidden="true" className="size-3.5 motion-safe:animate-spin" strokeWidth={2} /> : undefined}
      className={cn(onlyProblemsBelowMd && fine && "max-md:hidden", className)}
    >
      {label}
    </StatusChip>
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
        ? "bg-on-scrim/70"
        : "bg-on-scrim";

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
              level <= bars ? color : "bg-on-scrim/10",
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
    toastShownRef.current = { fiveMin: false, oneMin: false };
  }, [endsAt]);

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

  // Neutral while there is time; amber for the last five minutes and over time (red is for Live and destructive actions only).
  const late = mode === "down" && (isOvertime || remainingSeconds <= 300);
  const overBy = isOvertime ? formatted.replace(/^[-+]/, "") : null;
  const text = mode === "up" ? formatted : isOvertime ? `Over by ${overBy}` : formatted;
  const suffix = mode === "down" && !isOvertime ? " left" : "";

  const tooltipText =
    mode === "up"
      ? "Time since the class started. Select to show time left"
      : isOvertime
        ? "Past the scheduled end. Select to show elapsed time"
        : "Time left. Select to show elapsed time";

  return (
    <SimpleTooltip label={tooltipText} side="bottom">
      <button
        type="button"
        onClick={toggleMode}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold tabular-nums transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
          late ? "bg-warning-soft text-warning-ink" : "bg-app-soft text-app-text hover:bg-app-border",
          className,
        )}
        aria-label={mode === "up" ? `Elapsed time ${formatted}` : isOvertime ? `Class is over time by ${overBy}` : `${formatted} left in class`}
      >
        {late ? <TriangleAlert aria-hidden="true" className="size-3.5" strokeWidth={2} /> : <Timer aria-hidden="true" className="size-3.5" strokeWidth={2} />}
        <span>
          {text}
          {suffix ? <span className="hidden sm:inline">{suffix}</span> : null}
        </span>
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
    <StatusChip tone="recording" role="status" aria-label="Recording in progress" hideLabelBelowSm className={className}>
      Recording
    </StatusChip>
  );
}
