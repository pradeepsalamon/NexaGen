import { useState, useEffect, useRef, useCallback } from "react";
import { useConnectionState } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";

/**
 * Tracks elapsed time since the LiveKit room reached `Connected` state.
 * Returns a formatted string like "00:05:32" and the raw elapsed seconds.
 */
export function useMeetingTimer() {
  const connectionState = useConnectionState();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      if (connectedAtRef.current === null) {
        connectedAtRef.current = Date.now();
      }

      intervalRef.current = setInterval(() => {
        if (connectedAtRef.current !== null) {
          setElapsedSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000));
        }
      }, 1000);
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
  }, [connectionState]);

  const formatted = useCallback(() => {
    const hrs = Math.floor(elapsedSeconds / 3600);
    const mins = Math.floor((elapsedSeconds % 3600) / 60);
    const secs = elapsedSeconds % 60;

    const pad = (n: number) => n.toString().padStart(2, "0");

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }, [elapsedSeconds]);

  return {
    elapsedSeconds,
    formatted: formatted(),
    isRunning: connectionState === ConnectionState.Connected,
  };
}
