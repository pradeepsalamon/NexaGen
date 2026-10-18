"use client";

import { useMemo, useState } from "react";
import {
  buildPuzzleTopicTree,
  flattenPuzzleTopicTree,
  isSystemPuzzleFolder,
  MAX_ASSIGNMENT_PUZZLES,
  type PuzzleDifficulty,
  type PuzzleSummary,
  type PuzzleType
} from "@nexa-chess/types";
import { ArrowDown, ArrowUp, Eye, ListPlus, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { PuzzleQuickPreviewDialog } from "@/features/puzzles/components/PuzzleQuickPreviewDialog";
import { usePuzzles, usePuzzleTopics } from "@/features/puzzles/hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_LABELS,
  PUZZLE_TYPE_OPTIONS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

/** What the form keeps per chosen puzzle — enough to render the row without refetching. */
export type SelectedSetPuzzle = {
  puzzleId: string;
  title: string;
  difficulty: PuzzleDifficulty;
  topicName: string | null;
  /** Shown on the row when known (the library list carries them; an edit doesn't). */
  tags?: string[];
};

const PAGE = 25;

const iconBtn =
  "size-8 shrink-0 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white disabled:opacity-40";
const dangerBtn =
  "size-8 shrink-0 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white";

/**
 * The ordered puzzle list of a PUZZLE_SET assignment, plus a library picker.
 * Only published puzzles are offered; an admin's set is a shared library item,
 * so it lists global puzzles only (the API enforces both).
 */
export function PuzzleSetEditor({
  value,
  onChange,
  globalOnly,
  error
}: {
  value: SelectedSetPuzzle[];
  onChange: (next: SelectedSetPuzzle[]) => void;
  globalOnly: boolean;
  error?: string;
}) {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty | "">("");
  const [topicId, setTopicId] = useState("");
  const [puzzleType, setPuzzleType] = useState<PuzzleType | "">("");
  const [pageSize, setPageSize] = useState(PAGE);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  // A new filter starts from the first page again.
  const filterKey = `${debouncedSearch}|${difficulty}|${topicId}|${puzzleType}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (lastFilterKey !== filterKey) {
    setLastFilterKey(filterKey);
    setPageSize(PAGE);
  }

  const topics = usePuzzleTopics();
  const topicOptions = useMemo(() => {
    const visible = (topics.data?.topics ?? []).filter((t) => !isSystemPuzzleFolder(t));
    return flattenPuzzleTopicTree(buildPuzzleTopicTree(visible)).map((node) => ({
      label: `${"— ".repeat(node.depth)}${node.topic.name}`,
      value: node.topic.id
    }));
  }, [topics.data]);

  const puzzles = usePuzzles({
    difficulty: difficulty || undefined,
    order: "asc",
    pageSize,
    puzzleType: puzzleType || undefined,
    scope: "all",
    search: debouncedSearch || undefined,
    sort: "title",
    status: "PUBLISHED",
    topicId: topicId || undefined,
    topicScope: "subtree"
  });

  const chosen = useMemo(() => new Set(value.map((p) => p.puzzleId)), [value]);
  const full = value.length >= MAX_ASSIGNMENT_PUZZLES;
  const rows = (puzzles.data?.puzzles ?? []).filter(
    (p) => !globalOnly || p.visibility === "GLOBAL"
  );
  const addable = rows.filter((p) => !chosen.has(p.id));
  const total = puzzles.data?.pagination?.total ?? null;
  const canLoadMore = total !== null && total > pageSize && pageSize < 100;
  const previewing = previewId ? rows.find((p) => p.id === previewId) ?? null : null;

  const toSelected = (p: PuzzleSummary): SelectedSetPuzzle => ({
    difficulty: p.difficulty,
    puzzleId: p.id,
    tags: p.tags,
    title: p.title,
    topicName: p.topicName
  });
  const add = (list: PuzzleSummary[]) =>
    onChange([...value, ...list.map(toSelected)].slice(0, MAX_ASSIGNMENT_PUZZLES));
  const move = (index: number, delta: -1 | 1) => {
    const next = [...value];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Chosen puzzles, in the order students solve them */}
      <section aria-labelledby="puzzle-set-order" className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="puzzle-set-order" className="text-sm font-semibold text-app-text">
            Puzzles in this set
          </h3>
          <span className="text-xs text-app-muted">
            {value.length} / {MAX_ASSIGNMENT_PUZZLES}
          </span>
        </div>
        {error ? <p className="text-xs font-semibold text-app-danger-ink">{error}</p> : null}
        {value.length === 0 ? (
          <p className="rounded-control border border-dashed border-app-border p-4 text-center text-sm text-app-muted">
            No puzzles yet. Add them from the library — students solve them in this order.
          </p>
        ) : (
          <ol className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {value.map((p, i) => (
              <li
                key={p.puzzleId}
                className="flex items-center gap-2 rounded-control border border-app-border bg-app-surface p-2"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold text-app-text">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-app-text">{p.title}</p>
                  <p className="truncate text-xs text-app-muted">
                    {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
                    {p.topicName ? ` · ${p.topicName}` : ""}
                    {p.tags?.length ? ` · ${p.tags.map((t) => `#${t}`).join(" ")}` : ""}
                  </p>
                </div>
                <SimpleTooltip label="Move up">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${p.title} up`}
                    className={iconBtn}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
                <SimpleTooltip label="Move down">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${p.title} down`}
                    className={iconBtn}
                    disabled={i === value.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
                <SimpleTooltip label="Remove from set">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${p.title}`}
                    className={dangerBtn}
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Library picker */}
      <section aria-labelledby="puzzle-set-library" className="min-w-0 space-y-2">
        <h3 id="puzzle-set-library" className="text-sm font-semibold text-app-text">
          Add from the puzzle library
        </h3>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" strokeWidth={2.5} />
          <Input
            aria-label="Search puzzles"
            className="pl-9"
            placeholder="Search puzzles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select
            aria-label="Folder"
            placeholder="All folders"
            options={topicOptions}
            value={topicId}
            onChange={(e) => setTopicId(e.target.value)}
          />
          <Select
            aria-label="Difficulty"
            placeholder="Any difficulty"
            options={PUZZLE_DIFFICULTY_OPTIONS}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as PuzzleDifficulty | "")}
          />
          <Select
            aria-label="Puzzle type"
            placeholder="Any type"
            options={PUZZLE_TYPE_OPTIONS}
            value={puzzleType}
            onChange={(e) => setPuzzleType(e.target.value as PuzzleType | "")}
          />
        </div>
        {total !== null && !puzzles.isLoading ? (
          <p aria-live="polite" className="text-xs text-app-muted">
            Showing {rows.length} of {total} published puzzle{total === 1 ? "" : "s"}
            {value.length ? ` · ${value.length} selected` : ""}
          </p>
        ) : null}

        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {puzzles.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
          ) : puzzles.isError ? (
            <WidgetError message="Could not load the puzzle library." onRetry={() => void puzzles.refetch()} />
          ) : rows.length === 0 ? (
            <p className="p-4 text-center text-sm text-app-muted">
              No published puzzles match{globalOnly ? " (shared sets use global puzzles only)" : ""}.
            </p>
          ) : (
            rows.map((p) => {
              const added = chosen.has(p.id);
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-2 rounded-control border border-app-border p-2",
                    added ? "bg-app-soft" : "bg-app-surface"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-app-text">{p.title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge variant={difficultyBadgeVariant(p.difficulty)}>
                        {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
                      </Badge>
                      <span className="truncate text-xs text-app-muted">
                        {PUZZLE_TYPE_LABELS[p.puzzleType]} · {p.topicName}
                        {p.tags.length ? ` · ${p.tags.map((t) => `#${t}`).join(" ")}` : ""}
                      </span>
                    </div>
                  </div>
                  <SimpleTooltip label="Preview">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Preview ${p.title}`}
                      className={iconBtn}
                      onClick={() => setPreviewId(p.id)}
                    >
                      <Eye className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                  <Button
                    type="button"
                    size="sm"
                    variant={added ? "outline" : "primary"}
                    disabled={added || full}
                    onClick={() => add([p])}
                    aria-label={added ? `${p.title} already added` : `Add ${p.title}`}
                  >
                    {added ? "Added" : (
                      <>
                        <Plus className="mr-1 size-3.5" strokeWidth={2.5} />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canLoadMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={puzzles.isFetching}
              onClick={() => setPageSize((n) => Math.min(100, n + PAGE))}
            >
              {puzzles.isFetching ? "Loading…" : "Show more"}
            </Button>
          ) : null}
          {addable.length > 1 && !full ? (
            <Button type="button" variant="outline" size="sm" onClick={() => add(addable)}>
              <ListPlus className="mr-1.5 size-4" strokeWidth={2.5} />
              Add all {Math.min(addable.length, MAX_ASSIGNMENT_PUZZLES - value.length)} shown
            </Button>
          ) : null}
        </div>
        {full ? (
          <p className="text-xs font-semibold text-warning-ink">
            A set holds at most {MAX_ASSIGNMENT_PUZZLES} puzzles — remove one to add another.
          </p>
        ) : null}
      </section>

      <PuzzleQuickPreviewDialog
        puzzleId={previewId}
        onOpenChange={(o) => {
          if (!o) setPreviewId(null);
        }}
        action={
          previewing
            ? {
                disabled: chosen.has(previewing.id) || full,
                label: chosen.has(previewing.id) ? "Already in the set" : "Add to set",
                onClick: () => {
                  add([previewing]);
                  setPreviewId(null);
                }
              }
            : undefined
        }
      />
    </div>
  );
}
