"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  ACTIVITY_MAX_ATTEMPTS,
  MCQ_MAX_OPTIONS,
  MCQ_MIN_OPTIONS,
  MCQ_REVEAL_MODES,
  MCQ_REVEAL_MODE_LABELS,
  type McqConfig,
  type McqOption
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PositionEditor } from "@/features/chessboard/components/board/PositionEditor";
import { START_FEN } from "@/features/chessboard/lib/fen";
import { cn } from "@/lib/utils";
import { ImageUploadField } from "./ImageUploadField";

export function newOptionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function emptyMcqConfig(): McqConfig {
  return {
    allowMultiple: false,
    explanation: null,
    marks: 1,
    maxAttempts: 1,
    options: [
      { id: newOptionId(), isCorrect: false, text: "" },
      { id: newOptionId(), isCorrect: false, text: "" },
      { id: newOptionId(), isCorrect: false, text: "" },
      { id: newOptionId(), isCorrect: false, text: "" }
    ],
    question: { text: "" },
    randomizeOptions: false,
    revealMode: "ON_SUBMIT",
    timeLimitSeconds: null,
    wrongPenalty: 0
  };
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const numberOf = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** A question and its answers. Each answer picks its own mix of text, image and position. */
export function McqEditor({ config, onChange }: { config: McqConfig; onChange: (next: McqConfig) => void }) {
  const [boardFor, setBoardFor] = useState<string | null>(null);
  const set = (patch: Partial<McqConfig>) => onChange({ ...config, ...patch });
  const setQuestion = (patch: Partial<McqConfig["question"]>) => set({ question: { ...config.question, ...patch } });
  const setOption = (id: string, patch: Partial<McqOption>) =>
    set({ options: config.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const markCorrect = (id: string, on: boolean) =>
    set({
      options: config.options.map((o) =>
        o.id === id ? { ...o, isCorrect: on } : config.allowMultiple ? o : { ...o, isCorrect: false }
      )
    });

  return (
    <div className="space-y-5">
      <FormField id="mcq-text" label="Question text">
        <Textarea
          id="mcq-text"
          rows={3}
          maxLength={2000}
          value={config.question.text ?? ""}
          placeholder="Which square is occupied by the white king?"
          onChange={(e) => setQuestion({ text: e.target.value })}
        />
      </FormField>

      <div className="grid gap-3">
        <ImageUploadField label="Question image" value={config.question.imageUrl} onChange={(imageUrl) => setQuestion({ imageUrl })} />
        <label className="flex items-center gap-2 text-sm font-medium text-app-text">
          <Switch
            checked={!!config.question.fen}
            onCheckedChange={(on) => setQuestion({ fen: on ? START_FEN : null })}
            aria-label="Show a chess position with the question"
          />
          Show a chess position with the question
        </label>
        {config.question.fen ? (
          <div className="rounded-app border border-app-border p-3">
            <PositionEditor value={config.question.fen} onChange={(fen) => setQuestion({ fen })} />
            <div className="mt-3 max-w-xs">
              <FormField id="mcq-orientation" label="Board shown from">
                <Select
                  id="mcq-orientation"
                  value={config.question.orientation ?? ""}
                  placeholder="The side to move"
                  options={[
                    { label: "White's side", value: "white" },
                    { label: "Black's side", value: "black" }
                  ]}
                  onChange={(e) => setQuestion({ orientation: (e.target.value || null) as "white" | "black" | null })}
                />
              </FormField>
            </div>
          </div>
        ) : null}
      </div>

      <section aria-label="Answers" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-app-text">Answers</h3>
          <label className="flex items-center gap-2 text-sm text-app-text">
            <Switch
              checked={config.allowMultiple}
              aria-label="More than one answer is correct"
              onCheckedChange={(allowMultiple) =>
                set({
                  allowMultiple,
                  // Back to one answer: keep only the first one marked.
                  options: allowMultiple
                    ? config.options
                    : config.options.map((o, _i, all) => ({ ...o, isCorrect: o.isCorrect && all.find((x) => x.isCorrect)?.id === o.id }))
                })
              }
            />
            More than one answer is correct
          </label>
        </div>

        <ol className="space-y-2">
          {config.options.map((option, index) => (
            <li
              key={option.id}
              className={cn(
                "space-y-2 rounded-app border bg-app-surface p-3",
                option.isCorrect ? "border-success/60" : "border-app-border"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold text-app-text">
                  {LETTERS[index]}
                </span>
                <Input
                  aria-label={`Answer ${LETTERS[index]} text`}
                  placeholder="Answer text (optional if it has an image or position)"
                  maxLength={500}
                  value={option.text ?? ""}
                  onChange={(e) => setOption(option.id, { text: e.target.value })}
                />
                <SimpleTooltip label="Remove this answer">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove answer ${LETTERS[index]}`}
                    disabled={config.options.length <= MCQ_MIN_OPTIONS}
                    className="size-8 shrink-0 rounded-full text-app-danger-ink hover:bg-app-danger/10"
                    onClick={() => set({ options: config.options.filter((o) => o.id !== option.id) })}
                  >
                    <Trash2 className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              </div>
              <div className="flex flex-wrap items-center gap-3 pl-8">
                <label className="flex items-center gap-2 text-sm font-medium text-app-text">
                  <Checkbox
                    checked={option.isCorrect}
                    aria-label={`Answer ${LETTERS[index]} is correct`}
                    onCheckedChange={(value) => markCorrect(option.id, value === true)}
                  />
                  Correct
                </label>
                <ImageUploadField
                  label={`Answer ${LETTERS[index]} image`}
                  value={option.imageUrl}
                  onChange={(imageUrl) => setOption(option.id, { imageUrl })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (option.fen && boardFor === option.id) {
                      setOption(option.id, { fen: null });
                      setBoardFor(null);
                    } else {
                      if (!option.fen) setOption(option.id, { fen: config.question.fen ?? START_FEN });
                      setBoardFor(option.id);
                    }
                  }}
                >
                  {option.fen && boardFor === option.id ? "Remove position" : option.fen ? "Edit position" : "Add position"}
                </Button>
              </div>
              {option.fen && boardFor === option.id ? (
                <div className="rounded-control border border-app-border p-3">
                  <PositionEditor value={option.fen} onChange={(fen) => setOption(option.id, { fen })} />
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={config.options.length >= MCQ_MAX_OPTIONS}
          onClick={() => set({ options: [...config.options, { id: newOptionId(), isCorrect: false, text: "" }] })}
        >
          <Plus className="mr-1.5 size-4" strokeWidth={2.5} /> Add answer
        </Button>
      </section>

      <FormField id="mcq-explanation" label="Explanation">
        <Textarea
          id="mcq-explanation"
          rows={2}
          maxLength={2000}
          value={config.explanation ?? ""}
          placeholder="Shown with the correct answer."
          onChange={(e) => set({ explanation: e.target.value })}
        />
      </FormField>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FormField id="mcq-marks" label="Marks">
          <Input id="mcq-marks" type="number" min={1} max={100} value={config.marks} onChange={(e) => set({ marks: numberOf(e.target.value, 1) })} />
        </FormField>
        <FormField id="mcq-penalty" label="Marks lost for a wrong final answer">
          <Input id="mcq-penalty" type="number" min={0} max={100} value={config.wrongPenalty} onChange={(e) => set({ wrongPenalty: numberOf(e.target.value, 0) })} />
        </FormField>
        <FormField id="mcq-tries" label="Tries">
          <Input id="mcq-tries" type="number" min={1} max={ACTIVITY_MAX_ATTEMPTS} value={config.maxAttempts} onChange={(e) => set({ maxAttempts: numberOf(e.target.value, 1) })} />
        </FormField>
        <FormField id="mcq-timer" label="Timer in seconds (optional)">
          <Input
            id="mcq-timer"
            type="number"
            min={10}
            max={3600}
            value={config.timeLimitSeconds ?? ""}
            placeholder="No timer"
            onChange={(e) => set({ timeLimitSeconds: e.target.value ? numberOf(e.target.value, 60) : null })}
          />
        </FormField>
        <FormField id="mcq-reveal" label="Show the answer">
          <Select
            id="mcq-reveal"
            value={config.revealMode}
            options={MCQ_REVEAL_MODES.map((value) => ({ label: MCQ_REVEAL_MODE_LABELS[value], value }))}
            onChange={(e) => set({ revealMode: e.target.value as McqConfig["revealMode"] })}
          />
        </FormField>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-app-text">
          <Switch checked={config.randomizeOptions} aria-label="Shuffle the answers for each student" onCheckedChange={(randomizeOptions) => set({ randomizeOptions })} />
          Shuffle the answers for each student
        </label>
      </div>
    </div>
  );
}
