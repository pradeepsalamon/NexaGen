import { useState, useEffect, useRef, useCallback } from "react";
import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";

/**
 * Tracks elapsed time and remaining time.
 * Returns a formatted string like "00:05:32" depending on the mode.
 */
export function useMeetingTimer(startedAt?: string | null, endsAt?: string | null) {
  const connectionState = useConnectionState();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [overtimeSeconds, setOvertimeSeconds] = useState(0);
  const [mode, setMode] = useState<"up" | "down">(endsAt ? "down" : "up");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected && startedAt) {
      const startMs = new Date(startedAt).getTime();
      const endMs = endsAt ? new Date(endsAt).getTime() : 0;
      
      const update = () => {
        const now = Date.now();
        setElapsedSeconds(Math.max(0, Math.floor((now - startMs) / 1000)));
        if (endMs) {
          const diff = Math.floor((endMs - now) / 1000);
          if (diff >= 0) {
            setRemainingSeconds(diff);
            setOvertimeSeconds(0);
          } else {
            setRemainingSeconds(0);
            setOvertimeSeconds(Math.abs(diff));
          }
        }
      };

      update();

      intervalRef.current = setInterval(update, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [connectionState, startedAt, endsAt]);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "up" ? "down" : "up"));
  }, []);

  const formatSeconds = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, "0");

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const isOvertime = mode === "down" && remainingSeconds === 0 && overtimeSeconds > 0;
  const formatted = mode === "up"
    ? formatSeconds(elapsedSeconds)
    : isOvertime
      ? `+${formatSeconds(overtimeSeconds)}`
      : formatSeconds(remainingSeconds);

  return {
    elapsedSeconds,
    remainingSeconds,
    overtimeSeconds,
    isOvertime,
    formatted,
    mode,
    toggleMode,
    isRunning: connectionState === ConnectionState.Connected,
  };
}
