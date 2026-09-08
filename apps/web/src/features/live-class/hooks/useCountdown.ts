"use client";

import { useEffect, useState } from "react";

/**
 * Seconds remaining until `deadlineIso` (clamped at 0), ticking once a second.
 * Returns `null` when there is no deadline. `expired` flips true once at/after
 * the deadline.
 */
export function useCountdown(deadlineIso: string | null | undefined): {
  secondsLeft: number | null;
  expired: boolean;
} {
  const target = deadlineIso ? new Date(deadlineIso).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [target]);

  if (target === null) return { secondsLeft: null, expired: false };
  const secondsLeft = Math.max(0, Math.ceil((target - now) / 1000));
  return { secondsLeft, expired: secondsLeft === 0 };
}

/** `M:SS` for a countdown pill. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
