"use client";

import { useEffect, useState } from "react";
import { Check, CircleDot, X } from "lucide-react";
import type { ActivityRunSummary, StudentMcqState } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useSubmitMcq } from "../../../hooks/useActivityRun";
import { ActivityContent } from "./ActivityContent";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** The student's copy of an MCQ. The key arrives only when the API says it may: nothing here can show it sooner. */
export function McqStudentView({ classId, run, mcq }: { classId: string; run: ActivityRunSummary; mcq: StudentMcqState }) {
  const submit = useSubmitMcq(classId);
  const attemptNumber = mcq.attempts.length + 1;
  const last = mcq.attempts[mcq.attempts.length - 1] ?? null;
  const [selected, setSelected] = useState<string[]>([]);

  // A fresh try starts with a clean slate.
  useEffect(() => setSelected([]), [attemptNumber]);

  const shown = mcq.canSubmit ? selected : (last?.selectedOptionIds ?? []);
  const keyed = mcq.correctOptionIds;

  const toggle = (id: string) => {
    if (!mcq.canSubmit) return;
    setSelected((prev) =>
      mcq.allowMultiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <ActivityContent content={mcq.question} imageAlt="The question" textClassName="text-base font-semibold text-app-text" />

      <p className="text-xs font-semibold text-app-muted">
        {mcq.allowMultiple ? "Choose every correct answer." : "Choose one answer."} {mcq.marks} {mcq.marks === 1 ? "mark" : "marks"}
        {mcq.maxAttempts > 1 ? ` · Try ${Math.min(attemptNumber, mcq.maxAttempts)} of ${mcq.maxAttempts}` : ""}
      </p>

      <ul className="grid gap-2 sm:grid-cols-2" role={mcq.allowMultiple ? "group" : "radiogroup"} aria-label="Answers">
        {mcq.options.map((option, index) => {
          const isSelected = shown.includes(option.id);
          const isRight = keyed?.includes(option.id) ?? false;
          const isWrongPick = !!keyed && isSelected && !isRight;
          return (
            <li key={option.id}>
              <button
                type="button"
                role={mcq.allowMultiple ? "checkbox" : "radio"}
                aria-checked={isSelected}
                disabled={!mcq.canSubmit}
                onClick={() => toggle(option.id)}
                className={cn(
                  "flex h-full w-full items-start gap-2.5 rounded-app border bg-app-surface p-3 text-left text-sm text-app-text transition-colors",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
                  mcq.canSubmit && "hover:border-primary/60",
                  isSelected ? "border-primary bg-primary/5" : "border-app-border",
                  isRight && "border-success bg-success/10",
                  isWrongPick && "border-app-danger bg-app-danger/10"
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold">
                  {isRight ? (
                    <Check className="size-3.5 text-success-ink" strokeWidth={3} aria-label="Correct answer" />
                  ) : isWrongPick ? (
                    <X className="size-3.5 text-app-danger-ink" strokeWidth={3} aria-label="Your answer, not correct" />
                  ) : mcq.allowMultiple ? (
                    // The whole answer is the checkbox: a real one in here would be a button in a button.
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-4 place-items-center rounded-[4px] border",
                        isSelected ? "border-primary bg-primary text-white" : "border-app-border bg-app-surface"
                      )}
                    >
                      {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                  ) : isSelected ? (
                    <CircleDot className="size-3.5 text-primary-ink" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    LETTERS[index]
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <ActivityContent content={option} imageAlt={`Answer ${LETTERS[index]}`} boardClassName="max-w-[220px]" />
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {mcq.canSubmit ? (
        <Button
          disabled={selected.length === 0 || submit.isPending}
          isLoading={submit.isPending}
          onClick={() => void submit.mutateAsync({ body: { attemptNumber, selectedOptionIds: selected }, runId: run.id }).catch(() => undefined)}
        >
          Submit answer
        </Button>
      ) : null}

      <div aria-live="polite" className="space-y-2">
        {last ? (
          last.correct === null ? (
            <Alert variant="info">
              {run.status === "ENDED"
                ? "Your answer is in. Your coach will reveal the result."
                : mcq.revealMode === "ON_ACTIVITY_END"
                  ? "Your answer is in. You'll see the result when the activity ends."
                  : "Your answer is in. Your coach will reveal the result."}
            </Alert>
          ) : last.correct ? (
            <Alert variant="success">Correct! {mcq.finalScore !== null ? `You scored ${mcq.finalScore} of ${mcq.marks}.` : ""}</Alert>
          ) : mcq.canSubmit ? (
            <Alert variant="warning">Not quite. Try again.</Alert>
          ) : (
            <Alert variant="error">Not correct. {mcq.finalScore !== null ? `You scored ${mcq.finalScore} of ${mcq.marks}.` : ""}</Alert>
          )
        ) : !mcq.canSubmit ? (
          <Alert variant="info">This question has closed.</Alert>
        ) : null}
        {mcq.explanation ? (
          <div className="rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-text">
            <p className="mb-1 text-xs font-semibold text-app-muted">Explanation</p>
            <p className="whitespace-pre-wrap">{mcq.explanation}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
