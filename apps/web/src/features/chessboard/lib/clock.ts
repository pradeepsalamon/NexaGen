import type { BoardColor, ClockState } from "../types/sync";

export const DEFAULT_CLOCK: ClockState = {
  enabled: false,
  initialMs: 5 * 60 * 1000,
  incrementMs: 0,
  whiteMs: 5 * 60 * 1000,
  blackMs: 5 * 60 * 1000,
  running: null,
  updatedAt: 0,
};

/**
 * Time left for `color`, ms, derived from the banked value plus the live
 * deduction for whichever side's clock is currently running. Never negative.
 */
export function remainingMs(clock: ClockState, color: BoardColor, now: number): number {
  const banked = color === "white" ? clock.whiteMs : clock.blackMs;
  if (clock.running !== color) return Math.max(0, banked);
  const elapsed = Math.max(0, now - clock.updatedAt);
  return Math.max(0, banked - elapsed);
}

export function hasFlagFallen(clock: ClockState, color: BoardColor, now: number): boolean {
  return clock.enabled && remainingMs(clock, color, now) <= 0;
}

/**
 * Bank the running side's live deduction back into its stored value and stop
 * the clock. Used before any manual edit (pause, configure, reset) so the
 * displayed time doesn't jump.
 */
export function freezeClock(clock: ClockState, now: number): ClockState {
  if (!clock.running) return { ...clock, updatedAt: now };
  const running = clock.running;
  const left = remainingMs(clock, running, now);
  return {
    ...clock,
    whiteMs: running === "white" ? left : clock.whiteMs,
    blackMs: running === "black" ? left : clock.blackMs,
    running: null,
    updatedAt: now,
  };
}

/**
 * Apply a completed move by `mover`: bank the mover's remaining time, add the
 * increment, and hand the running clock to the other side. No-op unless the
 * clock is enabled and was running for the mover.
 */
export function applyMoveToClock(
  clock: ClockState,
  mover: BoardColor,
  now: number,
): ClockState {
  if (!clock.enabled || clock.running !== mover) return clock;
  const left = remainingMs(clock, mover, now);
  const banked = left + clock.incrementMs;
  const other: BoardColor = mover === "white" ? "black" : "white";
  return {
    ...clock,
    whiteMs: mover === "white" ? banked : clock.whiteMs,
    blackMs: mover === "black" ? banked : clock.blackMs,
    running: other,
    updatedAt: now,
  };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 100) / 10); // seconds, 0.1 resolution
  const mins = Math.floor(total / 60);
  const secs = total - mins * 60;
  if (ms < 20_000) {
    return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
  }
  return `${mins}:${Math.floor(secs).toString().padStart(2, "0")}`;
}
