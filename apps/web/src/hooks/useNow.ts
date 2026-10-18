import { useEffect, useState } from "react";

/**
 * The current time, re-read every `intervalMs`. For UI that flips on a clock
 * (a Start button that opens 30 minutes before class) without a refetch.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
