"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import {
  FEEDBACK_QUESTION_TYPE_LABELS,
  type FeedbackQuestion,
  type FeedbackQuestionType
} from "@nexa-chess/types";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { RowAction } from "./RowAction";

const TYPE_OPTIONS = (Object.keys(FEEDBACK_QUESTION_TYPE_LABELS) as FeedbackQuestionType[]).map((value) => ({
  label: FEEDBACK_QUESTION_TYPE_LABELS[value],
  value
}));

export function QuestionEditor({
  error,
  index,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
  question
}: {
  question: FeedbackQuestion;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  error?: string;
  onChange: (next: FeedbackQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const id = `question-${question.id}`;

  return (
    <div className="grid gap-3 rounded-app border border-app-border bg-app-soft/40 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <span className="mt-2.5 w-6 shrink-0 text-sm font-bold text-app-muted">{index + 1}.</span>
        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_180px]">
          <Input
            aria-label={`Question ${index + 1} text`}
            hasError={Boolean(error)}
            id={id}
            maxLength={300}
            onChange={(e) => onChange({ ...question, label: e.target.value })}
            placeholder="e.g. How well did your coach explain the lesson?"
            value={question.label}
          />
          <Select
            aria-label={`Question ${index + 1} type`}
            onChange={(e) => {
              const type = e.target.value as FeedbackQuestionType;
              onChange({
                ...question,
                options: type === "SINGLE_CHOICE" ? (question.options ?? ["", ""]) : undefined,
                type
              });
            }}
            options={TYPE_OPTIONS}
            value={question.type}
          />
        </div>
      </div>

      {question.type === "SINGLE_CHOICE" ? (
        <div className="grid gap-1 pl-8">
          <Textarea
            aria-label={`Question ${index + 1} choices, one per line`}
            onChange={(e) => onChange({ ...question, options: e.target.value.split("\n") })}
            placeholder={"One choice per line\nToo slow\nJust right\nToo fast"}
            rows={3}
            value={(question.options ?? []).join("\n")}
          />
          <p className="text-xs text-app-muted">One choice per line (2-10).</p>
        </div>
      ) : null}

      {error ? <p className="pl-8 text-xs font-medium text-app-danger-ink">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 pl-8">
        <Checkbox
          checked={question.required}
          id={`${id}-required`}
          label="Required"
          onCheckedChange={(checked) => onChange({ ...question, required: checked === true })}
        />
        <div className="flex items-center gap-1.5">
          <RowAction disabled={isFirst} icon={ArrowUp} label="Move up" onClick={() => onMove(-1)} />
          <RowAction disabled={isLast} icon={ArrowDown} label="Move down" onClick={() => onMove(1)} />
          <RowAction icon={Trash2} label="Remove question" onClick={onRemove} tone="danger" />
        </div>
      </div>
    </div>
  );
}
