"use client";

import { useState } from "react";
import type { FeedbackAnswerInput, PendingFeedbackItem } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";
import { useSkipFeedbackMutation, useSubmitFeedbackMutation } from "../hooks/useFeedbackApi";
import { StarRatingInput } from "./StarRating";

type AnswerState = Record<string, { ratingValue?: number | null; textValue?: string | null }>;

function ChoicePills({
  labelledBy,
  onChange,
  options,
  value
}: {
  labelledBy: string;
  options: string[];
  value: string | null | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div aria-labelledby={labelledBy} className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={value === option}
          className={cn(
            "min-h-10 rounded-full border px-4 text-sm font-semibold transition",
            value === option
              ? "border-primary bg-primary text-on-primary"
              : "border-app-border bg-app-surface text-app-text hover:border-primary"
          )}
          key={option}
          onClick={() => onChange(option)}
          role="radio"
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * Renders one pending feedback request's questions and submits/skips it.
 * Used by every placement (class-end screen, dashboard pop-up, dashboard card).
 */
export function FeedbackQuestionnaire({
  compact = false,
  item,
  onDone
}: {
  item: PendingFeedbackItem;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [answers, setAnswers] = useState<AnswerState>({});
  const [showErrors, setShowErrors] = useState(false);
  const submit = useSubmitFeedbackMutation();
  const skip = useSkipFeedbackMutation();
  const busy = submit.isPending || skip.isPending;

  const target = { coachId: item.coachId, contextKey: item.contextKey, formId: item.formId };

  const isAnswered = (questionId: string, type: string) => {
    const answer = answers[questionId];
    return type === "RATING" ? Boolean(answer?.ratingValue) : Boolean(answer?.textValue?.trim());
  };

  const missing = item.questions.filter((q) => q.required && !isAnswered(q.id, q.type));

  const set = (questionId: string, patch: AnswerState[string]) =>
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], ...patch } }));

  const handleSubmit = () => {
    if (missing.length > 0) {
      setShowErrors(true);
      return;
    }
    const payload: FeedbackAnswerInput[] = item.questions
      .filter((q) => isAnswered(q.id, q.type))
      .map((q) => ({ questionId: q.id, ...answers[q.id] }));
    submit.mutate({ ...target, answers: payload }, { onSuccess: () => onDone?.() });
  };

  return (
    <div className={cn("grid", compact ? "gap-4" : "gap-5")}>
      {item.questions.map((question, index) => {
        const invalid = showErrors && question.required && !isAnswered(question.id, question.type);
        const labelId = `fb-${item.formId}-${item.contextKey}-${question.id}`;
        return (
          <div className="grid gap-2" key={question.id}>
            <Label className="text-sm font-semibold text-app-text" htmlFor={labelId} id={`${labelId}-label`}>
              {index + 1}. {question.label}
              {question.required ? <span className="text-app-danger"> *</span> : null}
            </Label>

            {question.type === "RATING" ? (
              <StarRatingInput
                label={question.label}
                onChange={(ratingValue) => set(question.id, { ratingValue })}
                value={answers[question.id]?.ratingValue ?? null}
              />
            ) : question.type === "TEXT" ? (
              <Textarea
                hasError={invalid}
                id={labelId}
                maxLength={2000}
                onChange={(e) => set(question.id, { textValue: e.target.value })}
                placeholder="Share your thoughts…"
                rows={compact ? 2 : 3}
                value={answers[question.id]?.textValue ?? ""}
              />
            ) : (
              <ChoicePills
                labelledBy={`${labelId}-label`}
                onChange={(textValue) => set(question.id, { textValue })}
                options={question.type === "YES_NO" ? ["Yes", "No"] : (question.options ?? [])}
                value={answers[question.id]?.textValue}
              />
            )}

            {invalid ? (
              <p className="text-xs font-medium text-app-danger-ink" role="alert">
                This question needs an answer.
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {item.allowSkip ? (
          <Button
            disabled={busy}
            onClick={() => skip.mutate(target, { onSuccess: () => onDone?.() })}
            type="button"
            variant="outline"
          >
            Skip
          </Button>
        ) : null}
        <Button disabled={busy} onClick={handleSubmit} type="button">
          {submit.isPending ? "Sending…" : "Submit feedback"}
        </Button>
      </div>
    </div>
  );
}
