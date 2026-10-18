"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

/**
 * How far the API's clock is ahead of this browser's, from the `serverTime` on
 * the last live-puzzle state response. Every countdown adds it, so a laptop
 * whose clock is a minute off still shows the same time left as everyone else.
 */
const useServerClockSkew = create<{ skewMs: number }>(() => ({ skewMs: 0 }));

/** Record the API's `serverTime` (ISO) from a response. */
export function noteServerTime(serverTimeIso: string | undefined) {
  if (!serverTimeIso) return;
  const server = Date.parse(serverTimeIso);
  if (Number.isFinite(server)) useServerClockSkew.setState({ skewMs: server - Date.now() });
}

/**
 * Seconds remaining until `deadlineIso` (clamped at 0), ticking once a second.
 * Always derived from the authoritative deadline and the server clock — never a
 * decremented counter — so a throttled background tab, a refresh or a remount
 * shows the right value immediately. Returns `null` when there is no deadline.
 * `expired` flips true once at/after the deadline.
 */
export function useCountdown(deadlineIso: string | null | undefined): {
  secondsLeft: number | null;
  expired: boolean;
} {
  const target = deadlineIso ? new Date(deadlineIso).getTime() : null;
  const skewMs = useServerClockSkew((s) => s.skewMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    // Background tabs throttle intervals; catch up the moment the tab is back.
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [target]);

  if (target === null) return { secondsLeft: null, expired: false };
  const secondsLeft = Math.max(0, Math.ceil((target - (now + skewMs)) / 1000));
  return { secondsLeft, expired: secondsLeft === 0 };
}

/** `MM:SS` for a countdown pill. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
