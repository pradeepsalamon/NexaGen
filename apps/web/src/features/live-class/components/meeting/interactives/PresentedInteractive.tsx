"use client";

import { useMemo, type ReactNode } from "react";
import { Pause, Shapes, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClockMs } from "../../../hooks/useClassroomTimer";
import { InlineStage } from "../classroom/InlineStage";
import { MeetingControlButton } from "../MeetingControlButton";
import { InteractivePanel } from "./InteractivePanel";
import {
  useInteractives,
  useInteractivesTimer,
  useOptionalInteractives,
} from "./InteractivesProvider";
import { findInteractiveTool, type InteractiveTool } from "./registry";
import { PresentedViewProvider } from "./shared";

/** The tool the coach is showing a student right now, or null (always null for the coach). */
export function usePresentedTool(): InteractiveTool | null {
  const ctx = useOptionalInteractives();
  if (!ctx || ctx.isManager) return null;
  return findInteractiveTool(ctx.presenting?.toolId);
}

/** The presented tool itself, read-only: shared tools show the class's state, personal ones the coach's view. */
function PresentedToolBody({ tool }: { tool: InteractiveTool }) {
  const { classId, presenting } = useInteractives();
  const timer = useInteractivesTimer();
  const view = presenting?.view ?? null;
  const watch = useMemo(
    () => ({ mode: "watch" as const, publish: () => {}, toolId: tool.id, view }),
    [tool.id, view],
  );
  return (
    <PresentedViewProvider value={watch}>
      <tool.Component classId={classId} isManager={false} timer={timer} />
    </PresentedViewProvider>
  );
}

function PresentedTitle({ tool }: { tool: InteractiveTool }) {
  const Icon = tool.icon;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", tool.tone)}>
        <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
      </span>
      <span className="truncate">Your coach is showing: {tool.label}</span>
    </span>
  );
}

/**
 * md+: the presented tool as a main-stage tab, centred in the board's place
 * (ClassroomLayout opens it whenever the coach presents something new).
 */
export function PresentedInteractiveStage({ stageSwitch }: { stageSwitch: ReactNode }) {
  const tool = usePresentedTool();
  if (!tool) return null;
  return (
    <InlineStage fullWidth={tool.wide} title={<PresentedTitle tool={tool} />} stageSwitch={stageSwitch}>
      <div
        className={cn(
          "rounded-app border border-app-border bg-app-surface p-4 shadow-card sm:p-6",
          tool.wide && "mx-auto max-w-4xl",
        )}
      >
        <PresentedToolBody tool={tool} />
      </div>
    </InlineStage>
  );
}

/** Phones: the presented tool centred over the class. Hiding it keeps the toolbar button to bring it back. */
export function PresentedInteractiveOverlay() {
  const tool = usePresentedTool();
  const ctx = useOptionalInteractives();
  if (!tool || !ctx?.studentOpen) return null;
  return (
    <InteractivePanel
      autoFocus={false}
      closeLabel={`Hide ${tool.label}`}
      onClose={() => ctx.setStudentOpen(false)}
      placement="center"
      subtitle="Your coach is showing this to the class"
      tool={tool}
    >
      <PresentedToolBody tool={tool} />
    </InteractivePanel>
  );
}

/**
 * A student's toolbar slot where the coach's launcher would be: the running
 * classroom timer, and — while the coach presents a tool — a button that brings
 * it back after the student hid it. Nothing at all otherwise.
 */
export function StudentInteractivesControl() {
  const { setStudentOpen, studentOpen } = useInteractives();
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
        "flex items-center gap-0.5 whitespace-nowrap rounded-full border border-app-border bg-app-surface px-1.5 text-[0.6875rem] font-bold leading-5 tabular-nums shadow-card",
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
        aria-pressed={studentOpen}
        icon={<Shapes className="size-5" />}
        label={studentOpen ? `Hide ${tool.label}` : `Show ${tool.label}`}
        onClick={() => setStudentOpen(!studentOpen)}
        variant={studentOpen ? "active" : "default"}
      />
    </div>
  );
}
