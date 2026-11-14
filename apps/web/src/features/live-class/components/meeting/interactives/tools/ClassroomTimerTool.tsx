"use client";

import { useState } from "react";
import {
  Pause,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Trash2,
  Undo2,
} from "lucide-react";
import type { TimerPhase } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TIMER_PHASES,
  formatClockMs,
  newTimerState,
  timerTransitions,
} from "../../../../hooks/useClassroomTimer";
import {
  CoachRunsThis,
  newId,
  SectionTitle,
  ToolLoadError,
  ToolLoading,
  type ToolContext,
} from "../shared";

type DraftPhase = { id: string; label: string; minutes: string };

const toDraft = (phases: TimerPhase[]): DraftPhase[] =>
  phases.map((p) => ({
    id: p.id,
    label: p.label,
    minutes: String(Math.round((p.seconds / 60) * 10) / 10),
  }));

export function ClassroomTimerTool({ isManager, timer }: ToolContext) {
  const { state, phase, remainingMs, nowMs, save } = timer;
  const [draft, setDraft] = useState<DraftPhase[] | null>(null);

  if (timer.isLoading) return <ToolLoading />;
  if (timer.isError)
    return <ToolLoadError onRetry={() => void timer.refetch()} />;

  const editing = isManager && (draft !== null || !state);
  const phases = draft ?? toDraft(state?.phases ?? DEFAULT_TIMER_PHASES);

  if (editing) {
    const parsed = phases.map((p) => ({
      id: p.id,
      label: p.label.trim(),
      seconds: Math.round(Number.parseFloat(p.minutes) * 60),
    }));
    const valid =
      parsed.length > 0 &&
      parsed.every(
        (p) =>
          p.label &&
          Number.isFinite(p.seconds) &&
          p.seconds >= 10 &&
          p.seconds <= 14_400,
      );
    const set = (next: DraftPhase[]) => setDraft(next);
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          save.mutate(newTimerState(parsed));
          setDraft(null);
        }}
      >
        <p className="text-sm text-app-muted">
          Plan the lesson in phases. Everyone in class sees the countdown, and
          the next phase starts on its own.
        </p>
        <ol className="space-y-2">
          {phases.map((p, i) => (
            <li
              className="grid grid-cols-[1fr_5.5rem_auto] items-center gap-2"
              key={p.id}
            >
              <Input
                aria-label={`Phase ${i + 1} name`}
                maxLength={40}
                onChange={(e) =>
                  set(
                    phases.map((x) =>
                      x.id === p.id ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
                value={p.label}
              />
              <Input
                aria-label={`Phase ${i + 1} minutes`}
                inputMode="decimal"
                min={0.5}
                onChange={(e) =>
                  set(
                    phases.map((x) =>
                      x.id === p.id ? { ...x, minutes: e.target.value } : x,
                    ),
                  )
                }
                step={0.5}
                type="number"
                value={p.minutes}
              />
              <SimpleTooltip label="Remove phase">
                <button
                  aria-label={`Remove phase ${i + 1}`}
                  className="flex size-8 items-center justify-center rounded-full bg-app-danger text-white transition-colors hover:bg-app-danger/85 disabled:opacity-40"
                  disabled={phases.length === 1}
                  onClick={() => set(phases.filter((x) => x.id !== p.id))}
                  type="button"
                >
                  <Trash2
                    aria-hidden="true"
                    className="size-3.5"
                    strokeWidth={2.5}
                  />
                </button>
              </SimpleTooltip>
            </li>
          ))}
        </ol>
        <p className="text-xs text-app-muted">
          Minutes per phase (½ minute to 4 hours).
        </p>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            disabled={phases.length >= 12}
            onClick={() =>
              set([
                ...phases,
                { id: newId(), label: "New phase", minutes: "5" },
              ])
            }
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Add phase
          </Button>
          <div className="flex gap-2">
            {state ? (
              <Button onClick={() => setDraft(null)} variant="outline">
                Cancel
              </Button>
            ) : null}
            <Button disabled={!valid} isLoading={save.isPending} type="submit">
              Save phases
            </Button>
          </div>
        </div>
      </form>
    );
  }

  if (!state || !phase) {
    return (
      <CoachRunsThis>
        Your coach hasn&apos;t set up a timer for this class.
      </CoachRunsThis>
    );
  }

  const t = timerTransitions(state, nowMs);
  const total = phase.seconds * 1000;
  const pct =
    state.status === "DONE"
      ? 100
      : Math.min(100, ((total - remainingMs) / total) * 100);
  const nextPhase = state.phases[state.index + 1] ?? null;
  const low = state.status === "RUNNING" && remainingMs <= 60_000;

  return (
    <div className="space-y-4">
      <div className="rounded-app border border-app-border bg-app-soft p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-app-muted">
          {state.status === "DONE"
            ? "All phases done"
            : `Phase ${state.index + 1} of ${state.phases.length}${state.status === "PAUSED" ? " · paused" : state.status === "IDLE" ? " · ready" : ""}`}
        </p>
        <p className="mt-1 text-xl font-extrabold text-app-text">
          {state.status === "DONE" ? "Time's up!" : phase.label}
        </p>
        <p
          aria-live="off"
          className={cn(
            "mt-2 font-display text-6xl font-extrabold tabular-nums",
            low ? "text-app-danger-ink" : "text-primary-ink",
          )}
          role="timer"
        >
          {formatClockMs(remainingMs)}
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-app-surface">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        {nextPhase && state.status !== "DONE" ? (
          <p className="mt-2 text-xs text-app-muted">Next: {nextPhase.label}</p>
        ) : null}
      </div>

      {isManager ? (
        <div className="flex flex-wrap justify-center gap-2">
          {state.status === "RUNNING" ? (
            <Button onClick={() => save.mutate(t.pause())} variant="secondary">
              <Pause aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Pause
            </Button>
          ) : state.status === "PAUSED" ? (
            <Button onClick={() => save.mutate(t.resume())}>
              <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Resume
            </Button>
          ) : (
            <Button onClick={() => save.mutate(t.start())}>
              <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {state.status === "DONE" ? "Start over" : "Start"}
            </Button>
          )}
          <Button
            disabled={state.status === "DONE"}
            onClick={() => save.mutate(t.next())}
            variant="outline"
          >
            <SkipForward
              aria-hidden="true"
              className="size-4"
              strokeWidth={2.5}
            />
            {nextPhase ? "Next phase" : "Finish"}
          </Button>
          <Button
            disabled={state.status === "DONE"}
            onClick={() => save.mutate(t.restartPhase())}
            variant="outline"
          >
            <Undo2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Restart phase
          </Button>
          <Button onClick={() => save.mutate(t.reset())} variant="outline">
            <RotateCcw
              aria-hidden="true"
              className="size-4"
              strokeWidth={2.5}
            />
            Reset
          </Button>
        </div>
      ) : (
        <CoachRunsThis>Your coach controls the timer.</CoachRunsThis>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionTitle>Lesson plan</SectionTitle>
          {isManager && state.status !== "RUNNING" ? (
            <Button
              onClick={() => setDraft(toDraft(state.phases))}
              size="sm"
              variant="outline"
            >
              Edit phases
            </Button>
          ) : null}
        </div>
        <ol className="space-y-1">
          {state.phases.map((p, i) => (
            <li
              className={cn(
                "flex justify-between rounded-control px-3 py-1.5 text-sm",
                i === state.index && state.status !== "DONE"
                  ? "bg-primary/10 font-bold text-primary-ink"
                  : i < state.index || state.status === "DONE"
                    ? "text-app-muted line-through"
                    : "text-app-text",
              )}
              key={p.id}
            >
              <span>{p.label}</span>
              <span className="tabular-nums">
                {formatClockMs(p.seconds * 1000)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
