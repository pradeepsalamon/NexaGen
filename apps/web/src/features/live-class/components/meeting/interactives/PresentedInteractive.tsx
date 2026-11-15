"use client";

import { Pause, Shapes, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClockMs } from "../../../hooks/useClassroomTimer";
import { MeetingControlButton } from "../MeetingControlButton";
import { useInteractives, useInteractivesTimer, useOptionalInteractives } from "./InteractivesProvider";
import { findInteractiveTool, type InteractiveTool } from "./registry";

/** The tool the coach is showing a student right now, or null (always null for the coach). */
export function usePresentedTool(): InteractiveTool | null {
  const ctx = useOptionalInteractives();
  if (!ctx || ctx.isManager) return null;
  return findInteractiveTool(ctx.presenting?.toolId);
}

/**
 * A student's toolbar slot where the coach's launcher would be: the running
 * classroom timer, and — while the coach presents a tool — a button that shows
 * or hides it in the board's place. Nothing at all otherwise.
 */
export function StudentInteractivesControl() {
  const { setStageOpen, stageOpen } = useInteractives();
  const timer = useInteractivesTimer();
  const tool = usePresentedTool();

  const timerVisible =
    !!timer.phase &&
    (timer.state?.status === "RUNNING" || timer.state?.status === "PAUSED");
  if (!tool && !timerVisible) return null;

  const clock = timerVisible ? (
    <span
      aria-label={`Classroom timer: ${timer.phase?.label}, ${formatClockMs(timer.remainingMs)} left`}
      className={cn(
        "flex items-center gap-0.5 whitespace-nowrap rounded-full border border-app-border bg-app-surface px-1.5 text-xs font-bold leading-5 tabular-nums shadow-card",
        tool && "absolute -top-2.5 left-1/2 z-10 -translate-x-1/2",
        timer.state?.status === "RUNNING" && timer.remainingMs <= 60_000
          ? "text-app-danger-ink"
          : "text-app-text",
      )}
      role="timer"
    >
      <Timer aria-hidden="true" className="size-3" strokeWidth={2.5} />
      {formatClockMs(timer.remainingMs)}
      {timer.state?.status === "PAUSED" ? (
        <Pause aria-hidden="true" className="size-3" strokeWidth={2.5} />
      ) : null}
    </span>
  ) : null;

  if (!tool) return <div className="flex h-11 items-center">{clock}</div>;

  return (
    <div className="relative">
      {clock}
      <MeetingControlButton
        aria-pressed={stageOpen}
        icon={<Shapes className="size-5" />}
        label={stageOpen ? `Hide ${tool.label}` : `Show ${tool.label}`}
        onClick={() => setStageOpen(!stageOpen)}
        variant={stageOpen ? "active" : "default"}
      />
    </div>
  );
}
