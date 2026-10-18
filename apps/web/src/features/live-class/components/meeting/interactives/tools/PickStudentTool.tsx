"use client";

import { useMemo, useRef, useState } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import type { PickStudentState, ToolStudentRef } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import { useReducedMotion } from "../../../../lib/meetingUi";
import {
  CoachRunsThis,
  randomIndex,
  RosterSourcePicker,
  SectionTitle,
  ToolLoadError,
  ToolLoading,
  useToolRoster,
  type ToolContext,
} from "../shared";

const SPIN_MS = 3800;
const SEGMENT_FILLS = [
  "var(--color-primary)",
  "var(--color-accent)",
  "var(--color-secondary)",
  "var(--color-warm)",
];
const EMPTY: PickStudentState = { history: [], noRepeat: true };

export function PickStudentTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "PICK_STUDENT");
  const save = useSaveClassroomTool(classId, "PICK_STUDENT");
  const roster = useToolRoster(classId, isManager);
  const reducedMotion = useReducedMotion();
  const state = tool.state ?? EMPTY;

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<ToolStudentRef | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // With "no repeats", skip whoever was already picked until everyone has had a turn.
  const pickedIds = useMemo(
    () => new Set(state.history.map((h) => h.id)),
    [state.history],
  );
  const remaining = roster.students.filter((s) => !pickedIds.has(s.id));
  const pool =
    state.noRepeat && remaining.length > 0 ? remaining : roster.students;
  const wheel = pool.length > 0 ? pool : roster.students;
  const everyonePicked =
    state.noRepeat && roster.students.length > 0 && remaining.length === 0;

  const spin = () => {
    if (spinning || wheel.length === 0) return;
    const index = randomIndex(wheel.length);
    const picked = wheel[index];
    const seg = 360 / wheel.length;
    // Land the chosen segment's centre under the pointer at the top, after 5 full turns.
    const target = 360 - (index * seg + seg / 2);
    const base = rotation - (rotation % 360);
    setRotation(base + 360 * 5 + target);
    setSpinning(true);
    setResult(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setSpinning(false);
        setResult(picked);
        save.mutate({
          ...state,
          history: [
            { ...picked, pickedAt: new Date().toISOString() },
            ...state.history,
          ].slice(0, 30),
        });
      },
      reducedMotion ? 50 : SPIN_MS,
    );
  };

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  const last = state.history[0] ?? null;

  if (!isManager) {
    return (
      <div className="space-y-4">
        <CoachRunsThis />
        {last ? (
          <div className="rounded-app border border-app-border bg-app-soft p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wide text-app-muted">
              Picked
            </p>
            <p className="mt-1 text-2xl font-extrabold text-primary-ink">
              {last.name}
            </p>
          </div>
        ) : (
          <p className="text-sm text-app-muted">Nobody has been picked yet.</p>
        )}
      </div>
    );
  }

  const seg = wheel.length > 0 ? 360 / wheel.length : 360;

  return (
    <div className="space-y-4">
      <RosterSourcePicker roster={roster} />

      {wheel.length > 0 ? (
        <>
          <div className="relative mx-auto aspect-square w-full max-w-[17rem]">
            {/* Pointer */}
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1 border-x-[10px] border-t-[16px] border-x-transparent border-t-app-text"
            />
            <svg
              aria-hidden="true"
              className="size-full drop-shadow"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition:
                  spinning && !reducedMotion
                    ? `transform ${SPIN_MS}ms cubic-bezier(0.17, 0.67, 0.21, 1)`
                    : "none",
              }}
              viewBox="-100 -100 200 200"
            >
              {wheel.length === 1 ? (
                <circle fill={SEGMENT_FILLS[0]} r="98" />
              ) : (
                wheel.map((s, i) => {
                  const a0 = ((i * seg - 90) * Math.PI) / 180;
                  const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
                  const large = seg > 180 ? 1 : 0;
                  const d = `M0 0 L${98 * Math.cos(a0)} ${98 * Math.sin(a0)} A98 98 0 ${large} 1 ${98 * Math.cos(a1)} ${98 * Math.sin(a1)} Z`;
                  // Odd counts would put two equal colours side by side at the seam.
                  const fill =
                    SEGMENT_FILLS[
                      (wheel.length % 4 === 1 && i === wheel.length - 1
                        ? 1
                        : i) % SEGMENT_FILLS.length
                    ];
                  return (
                    <path
                      d={d}
                      fill={fill}
                      key={s.id}
                      stroke="var(--color-surface)"
                      strokeWidth="1"
                    />
                  );
                })
              )}
              {wheel.map((s, i) => {
                const mid = i * seg + seg / 2 - 90;
                const label =
                  s.name.length > 14 ? `${s.name.slice(0, 13)}…` : s.name;
                return (
                  <text
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={wheel.length > 16 ? 6 : wheel.length > 8 ? 8 : 10}
                    fontWeight="700"
                    key={s.id}
                    textAnchor="end"
                    transform={`rotate(${mid}) translate(90 0)`}
                  >
                    {label}
                  </text>
                );
              })}
              <circle
                fill="var(--color-surface)"
                r="14"
                stroke="var(--color-border)"
              />
            </svg>
          </div>

          <div aria-live="polite" className="min-h-[4.5rem] text-center">
            {result ? (
              <div className="animate-in fade-in zoom-in-95">
                <p className="text-xs font-bold uppercase tracking-wide text-app-muted">
                  It&apos;s your turn
                </p>
                <p className="text-2xl font-extrabold text-primary-ink">
                  {result.name}
                </p>
              </div>
            ) : spinning ? (
              <p className="pt-4 text-sm text-app-muted">Spinning…</p>
            ) : everyonePicked ? (
              <p className="pt-4 text-sm text-app-muted">
                Everyone has had a turn — the wheel starts over.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Switch
              checked={state.noRepeat}
              label="No repeats"
              onCheckedChange={(noRepeat) =>
                save.mutate({ ...state, noRepeat })
              }
            />
            <Button disabled={spinning} onClick={spin}>
              <Sparkles
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.5}
              />
              {result || last ? "Spin again" : "Spin"}
            </Button>
          </div>
        </>
      ) : null}

      {state.history.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <SectionTitle>Picked so far</SectionTitle>
            <Button
              onClick={() => {
                setResult(null);
                save.mutate({ ...state, history: [] });
              }}
              size="sm"
              variant="outline"
            >
              <RotateCcw
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={2.5}
              />
              Clear
            </Button>
          </div>
          <ol className="flex flex-wrap gap-1.5">
            {state.history.map((h, i) => (
              <li
                className={cn(
                  "rounded-full border border-app-border px-2.5 py-1 text-xs",
                  i === 0
                    ? "bg-primary/10 font-bold text-primary-ink"
                    : "text-app-muted",
                )}
                key={`${h.id}-${h.pickedAt}`}
              >
                {h.name}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
