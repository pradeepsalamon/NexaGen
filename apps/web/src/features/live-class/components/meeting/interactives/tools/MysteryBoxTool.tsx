"use client";

import { useState } from "react";
import { Gift, Minus, Plus, RotateCcw } from "lucide-react";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import {
  useClassroomTool,
  useSaveClassroomTool,
} from "../../../../hooks/useClassroomTools";
import {
  MYSTERY_REWARDS,
  rewardById,
} from "../../../../lib/interactives/rewards";
import {
  CoachRunsThis,
  randomIndex,
  SectionTitle,
  ToolLoadError,
  ToolLoading,
  type ToolContext,
} from "../shared";

const RANDOM = "random";

export function MysteryBoxTool({ classId, isManager }: ToolContext) {
  const tool = useClassroomTool(classId, "MYSTERY_BOX");
  const save = useSaveClassroomTool(classId, "MYSTERY_BOX");
  const [goal, setGoal] = useState("Solve 20 puzzles as a class");
  const [target, setTarget] = useState("20");
  const [rewardChoice, setRewardChoice] = useState(RANDOM);
  const [note, setNote] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [editing, setEditing] = useState(false);

  if (tool.isLoading) return <ToolLoading />;
  if (tool.isError)
    return <ToolLoadError onRetry={() => void tool.refetch()} />;

  const state = tool.state;

  if (!state || editing) {
    if (!isManager) {
      return (
        <div className="space-y-3">
          <CoachRunsThis>
            Your coach hasn&apos;t set a class goal yet.
          </CoachRunsThis>
        </div>
      );
    }
    const targetNum = Number.parseInt(target, 10);
    const valid =
      goal.trim().length > 0 &&
      Number.isFinite(targetNum) &&
      targetNum >= 1 &&
      targetNum <= 1000;
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          // A new goal starts a fresh box.
          save.mutate({
            goal: goal.trim(),
            log: [],
            progress: 0,
            rewardId: null,
            target: targetNum,
          });
          setEditing(false);
        }}
      >
        <p className="text-sm text-app-muted">
          {editing ? "A new goal starts the box from zero. " : ""}Set a goal the
          class works toward together. Award progress as they earn it — when the
          bar fills, the mystery box opens.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="mb-goal">Class goal</Label>
          <Input
            id="mb-goal"
            maxLength={160}
            onChange={(e) => setGoal(e.target.value)}
            value={goal}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mb-target">Steps to reach it</Label>
          <Input
            id="mb-target"
            inputMode="numeric"
            max={1000}
            min={1}
            onChange={(e) => setTarget(e.target.value)}
            type="number"
            value={target}
          />
        </div>
        <div className="flex justify-end gap-2">
          {editing ? (
            <Button onClick={() => setEditing(false)} variant="outline">
              Cancel
            </Button>
          ) : null}
          <Button disabled={!valid} isLoading={save.isPending} type="submit">
            {editing ? "Start new goal" : "Start the goal"}
          </Button>
        </div>
      </form>
    );
  }

  const reached = state.progress >= state.target;
  const reward = rewardById(state.rewardId);
  const pct = Math.min(100, Math.round((state.progress / state.target) * 100));

  const award = (amount: number) => {
    const progress = Math.max(
      0,
      Math.min(state.target, state.progress + amount),
    );
    if (progress === state.progress) return;
    let rewardId = state.rewardId;
    if (progress >= state.target && !rewardId) {
      rewardId =
        rewardChoice === RANDOM
          ? MYSTERY_REWARDS[randomIndex(MYSTERY_REWARDS.length)].id
          : rewardChoice;
    }
    if (progress < state.target) rewardId = null;
    save.mutate({
      ...state,
      log: [
        { amount, at: new Date().toISOString(), note: note.trim() },
        ...state.log,
      ].slice(0, 50),
      progress,
      rewardId,
    });
    setNote("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-app border border-app-border bg-app-soft p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-app-muted">
          Class goal
        </p>
        <p className="mt-0.5 font-bold text-app-text">{state.goal}</p>
        <div
          aria-label="Goal progress"
          aria-valuemax={state.target}
          aria-valuemin={0}
          aria-valuenow={state.progress}
          className="mt-3 h-3 overflow-hidden rounded-full bg-app-surface"
          role="progressbar"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              reached ? "bg-accent" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-right text-xs font-bold text-app-muted">
          {state.progress} / {state.target}
        </p>
      </div>

      {/* The box */}
      <div
        aria-live="polite"
        className="flex flex-col items-center gap-2 py-2 text-center"
      >
        {reached && reward ? (
          <div className="animate-in fade-in zoom-in-50 duration-500">
            <div className="mx-auto flex size-24 items-center justify-center rounded-app bg-accent/15 text-5xl">
              {reward.emoji}
            </div>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-accent-ink">
              Mystery box unlocked!
            </p>
            <p className="text-xl font-extrabold text-app-text">
              {reward.title}
            </p>
            <p className="text-sm text-app-muted">{reward.detail}</p>
          </div>
        ) : (
          <>
            <div
              className={cn(
                "flex size-24 items-center justify-center rounded-app bg-secondary/20 text-secondary-ink",
                pct >= 80 && "motion-safe:animate-bounce",
              )}
            >
              <Gift aria-hidden="true" className="size-12" strokeWidth={2.25} />
            </div>
            <p className="text-sm text-app-muted">
              {state.target - state.progress} more to open the box
            </p>
          </>
        )}
      </div>

      {isManager ? (
        <>
          {!reached ? (
            <div className="space-y-3">
              <Input
                aria-label="What was it for? (optional)"
                maxLength={120}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was it for? (optional)"
                value={note}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={state.progress === 0}
                  onClick={() => award(-1)}
                  variant="outline"
                >
                  <Minus
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={2.5}
                  />
                  1
                </Button>
                <Button onClick={() => award(1)}>
                  <Plus
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={2.5}
                  />
                  1
                </Button>
                <Button onClick={() => award(5)} variant="secondary">
                  <Plus
                    aria-hidden="true"
                    className="size-4"
                    strokeWidth={2.5}
                  />
                  5
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-reward">Reward in the box</Label>
                <Select
                  id="mb-reward"
                  onChange={(e) => setRewardChoice(e.target.value)}
                  options={[
                    { label: "Surprise me (random)", value: RANDOM },
                    ...MYSTERY_REWARDS.map((r) => ({
                      label: `${r.emoji} ${r.title}`,
                      value: r.id,
                    })),
                  ]}
                  value={rewardChoice}
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              onClick={() => {
                setGoal(state.goal);
                setTarget(String(state.target));
                setEditing(true);
              }}
              variant="outline"
            >
              Change goal
            </Button>
            <Button onClick={() => setConfirmReset(true)} variant="outline">
              <RotateCcw
                aria-hidden="true"
                className="size-4"
                strokeWidth={2.5}
              />
              Reset goal
            </Button>
          </div>
          <ConfirmationModal
            confirmLabel="Reset"
            isOpen={confirmReset}
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => {
              setConfirmReset(false);
              save.mutate({ ...state, log: [], progress: 0, rewardId: null });
            }}
            title="Reset the class goal?"
          >
            Progress goes back to 0 and the box closes again. The goal text
            stays.
          </ConfirmationModal>
        </>
      ) : (
        <CoachRunsThis>
          Your coach awards progress toward the goal.
        </CoachRunsThis>
      )}

      {state.log.length > 0 ? (
        <div className="space-y-1.5">
          <SectionTitle>Recent progress</SectionTitle>
          <ul className="space-y-1 text-sm">
            {state.log.slice(0, 6).map((entry) => (
              <li
                className="flex justify-between gap-3 text-app-muted"
                key={entry.at}
              >
                <span className="truncate">
                  {entry.note || (entry.amount > 0 ? "Progress" : "Correction")}
                </span>
                <span
                  className={cn(
                    "font-bold",
                    entry.amount > 0
                      ? "text-accent-ink"
                      : "text-app-danger-ink",
                  )}
                >
                  {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
