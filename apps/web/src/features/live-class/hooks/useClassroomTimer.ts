import { useEffect, useRef, useState } from "react";
import {
  timerRemainingMs,
  type TimerPhase,
  type TimerState,
} from "@nexa-chess/types";
import { useToast } from "@/providers/ToastProvider";
import { playPhaseChime } from "../lib/reactions";
import { useClassroomTool, useSaveClassroomTool } from "./useClassroomTools";

export const DEFAULT_TIMER_PHASES: TimerPhase[] = [
  { id: "warmup", label: "Warm-up", seconds: 5 * 60 },
  { id: "lesson", label: "Lesson", seconds: 20 * 60 },
  { id: "practice", label: "Practice", seconds: 15 * 60 },
  { id: "review", label: "Review", seconds: 5 * 60 },
];

export function formatClockMs(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Re-renders every `ms` while `active`. */
function useTick(active: boolean, ms = 250) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

/** Every state change the timer supports, computed against server time. */
export function timerTransitions(state: TimerState, nowMs: number) {
  const iso = (ms: number) => new Date(ms).toISOString();
  const phaseMs = (i: number) => state.phases[i].seconds * 1000;
  const remaining = timerRemainingMs(state, nowMs);
  const goTo = (
    index: number,
    running: boolean,
    sinceMs = nowMs,
  ): TimerState =>
    index >= state.phases.length
      ? {
          ...state,
          index: state.phases.length - 1,
          remainingMs: 0,
          since: null,
          status: "DONE",
        }
      : {
          ...state,
          index,
          remainingMs: phaseMs(index),
          since: running ? iso(sinceMs) : null,
          status: running ? "RUNNING" : "IDLE",
        };
  return {
    next: () => goTo(state.index + 1, state.status === "RUNNING"),
    pause: (): TimerState => ({
      ...state,
      remainingMs: remaining,
      since: null,
      status: "PAUSED",
    }),
    reset: (): TimerState => goTo(0, false),
    restartPhase: () => goTo(state.index, state.status === "RUNNING"),
    resume: (): TimerState => ({
      ...state,
      remainingMs: remaining,
      since: iso(nowMs),
      status: "RUNNING",
    }),
    start: (): TimerState =>
      state.status === "DONE"
        ? goTo(0, true)
        : { ...state, since: iso(nowMs), status: "RUNNING" },
    /** Auto-advance: the next phase starts exactly when this one ended, so no drift builds up. */
    expire: () =>
      goTo(
        state.index + 1,
        true,
        Date.parse(state.since ?? iso(nowMs)) + state.remainingMs,
      ),
  };
}

export function newTimerState(phases: TimerPhase[]): TimerState {
  return {
    index: 0,
    phases,
    remainingMs: phases[0].seconds * 1000,
    since: null,
    status: "IDLE",
  };
}

/**
 * The classroom timer as everyone sees it. Mounted once per room (the
 * launcher), so it also drives the coach's auto-advance and every client's
 * phase-change toast + chime, whether or not the Timer panel is open.
 */
export function useClassroomTimer(classId: string, isManager: boolean) {
  const tool = useClassroomTool(classId, "TIMER");
  const save = useSaveClassroomTool(classId, "TIMER");
  const toast = useToast();
  const state = tool.state;
  const running = state?.status === "RUNNING";
  useTick(running);

  const nowMs = Date.now() + tool.skewMs;
  const remainingMs = state ? timerRemainingMs(state, nowMs) : 0;

  // Coach's client advances an expired phase — exactly once per phase run.
  const expired = useRef<string | null>(null);
  useEffect(() => {
    if (!isManager || !state || state.status !== "RUNNING" || remainingMs > 0)
      return;
    const key = `${state.index}:${state.since}`;
    if (expired.current === key) return;
    expired.current = key;
    save.mutate(timerTransitions(state, nowMs).expire(), {
      onError: () => {
        if (expired.current === key) {
          expired.current = null;
        }
      },
    });
  }, [isManager, state, remainingMs, nowMs, save]);

  // Everyone hears and sees the transition.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const key = `${state.status === "DONE" ? "done" : state.index}`;
    const wasRunning = seen.current !== null;
    if (seen.current === key) return;
    const prev = seen.current;
    seen.current = key;
    if (!wasRunning || prev === null || state.status === "IDLE") return;
    if (state.status === "DONE") {
      playPhaseChime(true);
      toast.success({
        title: "Timer finished",
        message: "All lesson phases are done.",
      });
    } else if (state.status === "RUNNING") {
      playPhaseChime();
      toast.info({
        title: `Now: ${state.phases[state.index].label}`,
        message: formatClockMs(remainingMs),
      });
    }
  }, [state, remainingMs, toast]);

  return {
    isError: tool.isError,
    isLoading: tool.isLoading,
    nowMs,
    phase: state ? state.phases[state.index] : null,
    refetch: tool.refetch,
    remainingMs,
    save,
    state,
  };
}
