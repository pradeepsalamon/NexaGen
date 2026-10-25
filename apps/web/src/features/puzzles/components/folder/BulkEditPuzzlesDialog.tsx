"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  MAX_PUZZLE_TAGS,
  puzzleTopicPathLabel,
  type BulkUpdatePuzzlesRequest,
  type PuzzleDifficulty,
  type PuzzleSummary,
  type PuzzleTopicDto,
  type PuzzleType
} from "@nexa-chess/types";
import { ArrowLeft, PencilLine } from "lucide-react";
import type { BulkResult } from "@/components/common/BulkResultDialog";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getErrorMessage } from "@/lib/errors";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { bulkUpdatePuzzles } from "../../api/puzzleApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_LABELS,
  PUZZLE_TYPE_OPTIONS,
  puzzleTopicOptions
} from "../../lib/puzzleMeta";

type BulkStatus = NonNullable<BulkUpdatePuzzlesRequest["status"]>;
const STATUS_OPTIONS: { label: string; value: BulkStatus }[] = [
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Archived", value: "ARCHIVED" }
];

type Field = "topic" | "difficulty" | "puzzleType" | "status" | "addTags" | "removeTags" | "title";

const splitTags = (raw: string) => [
  ...new Set(
    raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
  )
];

/**
 * Bulk edit for a folder's selected puzzles: tick the fields to change, review,
 * confirm. Only ticked fields are sent, so nothing else on any puzzle moves.
 * Policy: confirmed up front and summarised after, no undo toast (see
 * lib/undo/README.md "Bulk archive / delete").
 */
// undo: intentionally excluded — bulk edit is confirmed up front and reported per puzzle.
export function BulkEditPuzzlesDialog({
  folder,
  onClose,
  onDone,
  open,
  puzzles,
  topics
}: {
  folder: PuzzleTopicDto;
  onClose: () => void;
  onDone: (result: BulkResult) => void;
  open: boolean;
  puzzles: PuzzleSummary[];
  topics: PuzzleTopicDto[];
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"edit" | "confirm">("edit");
  const [busy, setBusy] = useState(false);
  const [on, setOn] = useState<Set<Field>>(() => new Set());
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [puzzleType, setPuzzleType] = useState("");
  const [status, setStatus] = useState("");
  const [addTags, setAddTags] = useState("");
  const [removeTags, setRemoveTags] = useState<Set<string>>(() => new Set());
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");

  const destinations = useMemo(
    () => puzzleTopicOptions(topics, new Set([folder.id])),
    [topics, folder.id]
  );
  // Tags already on the selection, for "Remove tags".
  const existingTags = useMemo(
    () => [...new Set(puzzles.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b)),
    [puzzles]
  );

  const toggleField = (field: Field, value: boolean) =>
    setOn((prev) => {
      const next = new Set(prev);
      if (value) next.add(field);
      else next.delete(field);
      return next;
    });

  const added = splitTags(addTags);
  const tooLongTag = added.find((t) => t.length > 30);
  // Each ticked field must have a value before the change can be reviewed.
  const problems = [
    on.has("topic") && !topicId ? "Pick a folder to move the puzzles to." : null,
    on.has("difficulty") && !difficulty ? "Pick a difficulty." : null,
    on.has("puzzleType") && !puzzleType ? "Pick a puzzle type." : null,
    on.has("status") && !status ? "Pick a status." : null,
    on.has("addTags") && added.length === 0 ? "Type at least one tag to add." : null,
    on.has("addTags") && added.length > MAX_PUZZLE_TAGS ? `At most ${MAX_PUZZLE_TAGS} tags.` : null,
    on.has("addTags") && tooLongTag ? `"${tooLongTag}" is longer than 30 characters.` : null,
    on.has("removeTags") && removeTags.size === 0 ? "Pick at least one tag to remove." : null,
    on.has("title") && !find ? "Type the text to find in the titles." : null
  ].filter((p): p is string => !!p);

  const request: BulkUpdatePuzzlesRequest = {
    fromTopicId: folder.id,
    ids: puzzles.map((p) => p.id),
    ...(on.has("topic") ? { topicId } : {}),
    ...(on.has("difficulty") ? { difficulty: difficulty as PuzzleDifficulty } : {}),
    ...(on.has("puzzleType") ? { puzzleType: puzzleType as PuzzleType } : {}),
    ...(on.has("status") ? { status: status as BulkStatus } : {}),
    ...(on.has("addTags") ? { addTags: added } : {}),
    ...(on.has("removeTags") ? { removeTags: [...removeTags] } : {}),
    ...(on.has("title") ? { titleReplace: { find, replace } } : {})
  };

  const summary = [
    on.has("topic") ? `Move to folder "${puzzleTopicPathLabel(topics, topicId)}"` : null,
    on.has("difficulty") && difficulty
      ? `Set difficulty to ${PUZZLE_DIFFICULTY_LABELS[difficulty as PuzzleDifficulty]}`
      : null,
    on.has("puzzleType") && puzzleType ? `Set type to ${PUZZLE_TYPE_LABELS[puzzleType as PuzzleType]}` : null,
    on.has("status") && status
      ? `Set status to ${STATUS_OPTIONS.find((o) => o.value === status)?.label}${status === "PUBLISHED" ? " (puzzles without a solution are skipped)" : ""}`
      : null,
    on.has("addTags") ? `Add tags: ${added.join(", ")}` : null,
    on.has("removeTags") ? `Remove tags: ${[...removeTags].join(", ")}` : null,
    on.has("title") ? `In titles, replace "${find}" with ${replace ? `"${replace}"` : "nothing"}` : null
  ].filter((s): s is string => !!s);

  const count = puzzles.length;
  const noun = `puzzle${count === 1 ? "" : "s"}`;

  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await bulkUpdatePuzzles(request);
      // A failed refetch must not turn a finished edit into an error.
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: queryKeys.puzzles.all })
      ]);
      onDone({
        action: "Bulk edit",
        failed: res.skipped.map((s) => ({ label: s.title, reason: s.reason })),
        succeeded: res.updated
      });
    } catch (error) {
      toast.error({ title: "Bulk edit failed — nothing was changed", message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PencilLine className="size-5 text-primary-ink" strokeWidth={2.5} />
            {step === "edit" ? `Bulk edit ${count} ${noun}` : "Confirm bulk edit"}
          </DialogTitle>
          <DialogDescription>
            {step === "edit"
              ? `Tick the fields to change in "${folder.name}". Fields you leave unticked are not touched.`
              : `These changes will be applied to ${count} selected ${noun} in "${folder.name}". No other puzzle is affected.`}
          </DialogDescription>
        </DialogHeader>

        {step === "edit" ? (
          <div className="grid gap-3">
            <FieldRow field="topic" label="Move to another folder" on={on} onToggle={toggleField}>
              <Select
                aria-label="Move to folder"
                value={topicId}
                placeholder="Select a folder"
                options={destinations}
                onChange={(e) => setTopicId(e.target.value)}
              />
            </FieldRow>
            <FieldRow field="difficulty" label="Change difficulty" on={on} onToggle={toggleField}>
              <Select
                aria-label="New difficulty"
                value={difficulty}
                placeholder="Select a difficulty"
                options={PUZZLE_DIFFICULTY_OPTIONS}
                onChange={(e) => setDifficulty(e.target.value)}
              />
            </FieldRow>
            <FieldRow field="puzzleType" label="Change puzzle type" on={on} onToggle={toggleField}>
              <Select
                aria-label="New puzzle type"
                value={puzzleType}
                placeholder="Select a type"
                options={PUZZLE_TYPE_OPTIONS}
                onChange={(e) => setPuzzleType(e.target.value)}
              />
            </FieldRow>
            <FieldRow field="status" label="Change status" on={on} onToggle={toggleField}>
              <Select
                aria-label="New status"
                value={status}
                placeholder="Select a status"
                options={STATUS_OPTIONS}
                onChange={(e) => setStatus(e.target.value)}
              />
            </FieldRow>
            <FieldRow field="addTags" label="Add tags" on={on} onToggle={toggleField}>
              <Input
                aria-label="Tags to add"
                value={addTags}
                placeholder="fork, pin, middlegame"
                onChange={(e) => setAddTags(e.target.value)}
              />
            </FieldRow>
            <FieldRow field="removeTags" label="Remove tags" on={on} onToggle={toggleField}>
              {existingTags.length === 0 ? (
                <p className="text-sm text-app-muted">The selected puzzles have no tags.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {existingTags.map((tag) => {
                    const picked = removeTags.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={picked}
                        onClick={() =>
                          setRemoveTags((prev) => {
                            const next = new Set(prev);
                            if (picked) next.delete(tag);
                            else next.add(tag);
                            return next;
                          })
                        }
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
                          picked
                            ? "border-app-danger bg-app-danger text-white"
                            : "border-app-border text-app-text hover:bg-app-soft"
                        )}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </FieldRow>
            <FieldRow field="title" label="Find & replace in titles" on={on} onToggle={toggleField}>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input aria-label="Find in titles" value={find} maxLength={200} placeholder="Find" onChange={(e) => setFind(e.target.value)} />
                <Input aria-label="Replace with" value={replace} maxLength={200} placeholder="Replace with" onChange={(e) => setReplace(e.target.value)} />
              </div>
            </FieldRow>
            {on.size > 0 && problems.length > 0 ? (
              <p className="text-sm text-app-danger-ink">{problems[0]}</p>
            ) : null}
          </div>
        ) : (
          <ul className="list-disc space-y-1.5 rounded-control bg-app-soft py-3 pl-8 pr-3 text-sm text-app-text">
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          {step === "edit" ? (
            <>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={on.size === 0 || problems.length > 0} onClick={() => setStep("confirm")}>
                Review changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => setStep("edit")}>
                <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
                Back
              </Button>
              <Button disabled={busy} onClick={() => void apply()}>
                {busy ? "Applying…" : `Apply to ${count} ${noun}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One editable field: a tick to opt in, and its control (shown only once ticked). */
function FieldRow({
  children,
  field,
  label,
  on,
  onToggle
}: {
  children: ReactNode;
  field: Field;
  label: string;
  on: Set<Field>;
  onToggle: (field: Field, value: boolean) => void;
}) {
  const checked = on.has(field);
  return (
    <div className={cn("rounded-control border p-3", checked ? "border-primary/50 bg-primary/5" : "border-app-border")}>
      <Checkbox
        checked={checked}
        label={label}
        onCheckedChange={(v) => onToggle(field, v === true)}
      />
      {checked ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}
