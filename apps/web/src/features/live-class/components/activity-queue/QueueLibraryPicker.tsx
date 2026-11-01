"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPuzzleTopicTree,
  flattenPuzzleTopicTree,
  isSystemPuzzleFolder,
  type PuzzleListQuery
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePuzzles, usePuzzleTopics } from "@/features/puzzles/hooks/usePuzzlesApi";
import { PUZZLE_DIFFICULTY_LABELS, difficultyBadgeVariant } from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const TIMER_OPTIONS = [
  { label: "No timer", value: "" },
  { label: "1 min each", value: "60" },
  { label: "2 min each", value: "120" },
  { label: "3 min each", value: "180" },
  { label: "5 min each", value: "300" },
  { label: "10 min each", value: "600" }
];

/**
 * Picks published library puzzles for a queue, in the order they are ticked.
 * Only puzzles the coach could share live are listed (the API checks again).
 */
export function QueuePuzzlePicker({
  open,
  onOpenChange,
  onAdd,
  room,
  busy
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (puzzleIds: string[], durationSeconds: number | null) => void;
  /** How many more activities the queue can take. */
  room: number;
  busy?: boolean;
}) {
  const [folderId, setFolderId] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [timer, setTimer] = useState("");
  const debounced = useDebouncedValue(search, 300);

  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);

  const topics = usePuzzleTopics(open);
  const folderOptions = useMemo(() => {
    const visible = (topics.data?.topics ?? []).filter((t) => !isSystemPuzzleFolder(t));
    return flattenPuzzleTopicTree(buildPuzzleTopicTree(visible)).map((node) => ({
      label: `${"\u00A0\u00A0".repeat(node.depth)}${node.topic.name}`,
      value: node.topic.id
    }));
  }, [topics.data]);

  const query: PuzzleListQuery = {
    order: "asc",
    page: 1,
    pageSize: 50,
    scope: "all",
    search: debounced || undefined,
    sort: "title",
    status: "PUBLISHED",
    topicId: folderId || undefined
  };
  const list = usePuzzles(query);
  const puzzles = list.data?.puzzles ?? [];

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((p) => p !== id)));
  const full = picked.length >= room;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add puzzles</DialogTitle>
          <DialogDescription>
            Tick puzzles in the order the class should solve them. Each one is shared like any live puzzle, with
            your academy&apos;s default points.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            aria-label="Folder"
            options={folderOptions}
            placeholder="All folders"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          />
          <Input
            aria-label="Search puzzles"
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="custom-scrollbar max-h-[45vh] min-h-40 overflow-y-auto rounded-app border border-app-border" role="list">
          {list.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <p className="p-4 text-center text-sm text-app-muted">Couldn&apos;t load puzzles.</p>
          ) : puzzles.length === 0 ? (
            <p className="p-4 text-center text-sm text-app-muted">No published puzzles here.</p>
          ) : (
            puzzles.map((puzzle) => {
              const order = picked.indexOf(puzzle.id);
              const checked = order >= 0;
              return (
                <label
                  key={puzzle.id}
                  role="listitem"
                  className="flex cursor-pointer items-center gap-3 border-b border-app-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-app-soft"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && full}
                    onCheckedChange={(value) => toggle(puzzle.id, value === true)}
                    aria-label={`Add ${puzzle.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-app-text">{puzzle.title}</span>
                    <span className="block truncate text-xs text-app-muted">{puzzle.topicName}</span>
                  </span>
                  <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
                    {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
                  </Badge>
                  {checked ? (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
                      {order + 1}
                    </span>
                  ) : null}
                </label>
              );
            })
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Select
            aria-label="Timer for each puzzle"
            className="sm:w-44"
            options={TIMER_OPTIONS}
            value={timer}
            onChange={(e) => setTimer(e.target.value)}
          />
          <div className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={picked.length === 0 || busy}
              isLoading={busy}
              onClick={() => onAdd(picked, timer ? Number(timer) : null)}
            >
              Add {picked.length || ""} {picked.length === 1 ? "puzzle" : "puzzles"}
            </Button>
          </div>
        </DialogFooter>
        {full && room > 0 ? (
          <p className="text-xs text-app-muted">The queue can take {room} more.</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
