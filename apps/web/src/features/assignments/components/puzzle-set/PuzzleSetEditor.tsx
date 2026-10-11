"use client";

import { useMemo, useState } from "react";
import {
  buildPuzzleTopicTree,
  flattenPuzzleTopicTree,
  isSystemPuzzleFolder,
  MAX_ASSIGNMENT_PUZZLES,
  type PuzzleDifficulty,
  type PuzzleSummary
} from "@nexa-chess/types";
import { ArrowDown, ArrowUp, ListPlus, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePuzzles, usePuzzleTopics } from "@/features/puzzles/hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
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
};

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
  const debouncedSearch = useDebouncedValue(search, 300);

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
    pageSize: 25,
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

  const toSelected = (p: PuzzleSummary): SelectedSetPuzzle => ({
    difficulty: p.difficulty,
    puzzleId: p.id,
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
    <div className="grid gap-4 lg:grid-cols-2">
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
        <div className="grid gap-2 sm:grid-cols-2">
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
        </div>

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
                      <span className="truncate text-xs text-app-muted">{p.topicName}</span>
                    </div>
                  </div>
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
        {addable.length > 1 && !full ? (
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => add(addable)}>
              <ListPlus className="mr-1.5 size-4" strokeWidth={2.5} />
              Add all {addable.length} shown
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
