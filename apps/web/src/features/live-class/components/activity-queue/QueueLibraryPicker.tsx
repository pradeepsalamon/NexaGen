"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPuzzleTopicTree,
  flattenPuzzleTopicTree,
  isSystemPuzzleFolder,
  LIBRARY_ITEM_KIND_LABELS,
  type ActivityQueueItemInput,
  type LibraryItemKind,
  type LibraryItemSummary
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useLibrary } from "@/features/puzzles/hooks/useActivitiesApi";
import { usePuzzleTopics } from "@/features/puzzles/hooks/usePuzzlesApi";
import { PUZZLE_DIFFICULTY_LABELS, difficultyBadgeVariant } from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const TIMER_OPTIONS = [
  { label: "No puzzle timer", value: "" },
  { label: "1 min each", value: "60" },
  { label: "2 min each", value: "120" },
  { label: "3 min each", value: "180" },
  { label: "5 min each", value: "300" },
  { label: "10 min each", value: "600" }
];

const KIND_TABS: { label: string; value: "ALL" | LibraryItemKind }[] = [
  { label: "All", value: "ALL" },
  { label: "Chess puzzles", value: "PUZZLE" },
  { label: "MCQs", value: "MCQ" },
  { label: "Playouts", value: "PLAYOUT" }
];

function toInput(item: LibraryItemSummary, durationSeconds: number | null): ActivityQueueItemInput {
  return item.kind === "PUZZLE"
    ? { durationSeconds, kind: "PUZZLE", puzzleId: item.id }
    : { activityId: item.id, kind: item.kind };
}

/**
 * The Puzzle Library, opened from a queue: browse the one folder tree and pick
 * puzzles, MCQs and Playouts in the order the class should do them. Only what
 * this coach could use is listed (the API checks again). A puzzle's timer is set
 * here; an MCQ's or Playout's was set by the admin who prepared it.
 */
export function QueueLibraryPicker({
  open,
  onOpenChange,
  onAdd,
  room,
  busy
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (items: ActivityQueueItemInput[]) => void;
  /** How many more activities the queue can take. */
  room: number;
  busy?: boolean;
}) {
  const [kind, setKind] = useState<"ALL" | LibraryItemKind>("ALL");
  const [folderId, setFolderId] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<LibraryItemSummary[]>([]);
  const [timer, setTimer] = useState("");
  const debounced = useDebouncedValue(search, 300);

  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);

  const topics = usePuzzleTopics(open);
  const folderOptions = useMemo(() => {
    const visible = (topics.data?.topics ?? []).filter((t) => !isSystemPuzzleFolder(t));
    return flattenPuzzleTopicTree(buildPuzzleTopicTree(visible)).map((node) => ({
      label: `${"  ".repeat(node.depth)}${node.topic.name}`,
      value: node.topic.id
    }));
  }, [topics.data]);

  const list = useLibrary(
    {
      kind: kind === "ALL" ? undefined : kind,
      order: "asc",
      page: 1,
      pageSize: 50,
      search: debounced || undefined,
      sort: "title",
      status: "PUBLISHED",
      topicId: folderId || undefined
    },
    open
  );
  const items = list.data?.items ?? [];

  const toggle = (item: LibraryItemSummary, on: boolean) =>
    setPicked((prev) =>
      on ? (prev.some((p) => p.id === item.id) ? prev : [...prev, item]) : prev.filter((p) => p.id !== item.id)
    );
  const full = picked.length >= room;
  const hasPuzzle = picked.some((p) => p.kind === "PUZZLE");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from the Puzzle Library</DialogTitle>
          <DialogDescription>
            Tick activities in the order the class should do them. Each runs as it was prepared: the same content can be
            used in any class.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(value) => setKind(value as typeof kind)}>
          <TabsList className="flex-wrap">
            {KIND_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            aria-label="Folder"
            options={folderOptions}
            placeholder="All folders"
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
          />
          <Input
            aria-label="Search the library"
            placeholder="Search by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="custom-scrollbar max-h-[42vh] min-h-40 overflow-y-auto rounded-app border border-app-border" role="list">
          {list.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : list.isError ? (
            <p className="p-4 text-center text-sm text-app-muted">Couldn&apos;t load the library.</p>
          ) : items.length === 0 ? (
            <p className="p-4 text-center text-sm text-app-muted">Nothing published here.</p>
          ) : (
            items.map((item) => {
              const order = picked.findIndex((p) => p.id === item.id);
              const checked = order >= 0;
              return (
                <label
                  key={`${item.kind}:${item.id}`}
                  role="listitem"
                  className="flex cursor-pointer items-center gap-3 border-b border-app-border/60 px-3 py-2 text-sm last:border-b-0 hover:bg-app-soft"
                >
                  <Checkbox
                    checked={checked}
                    disabled={!checked && full}
                    onCheckedChange={(value) => toggle(item, value === true)}
                    aria-label={`Add ${item.title}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-app-text">{item.title}</span>
                    <span className="block truncate text-xs text-app-muted">
                      {LIBRARY_ITEM_KIND_LABELS[item.kind]} · {item.topicName}
                    </span>
                  </span>
                  <Badge variant={difficultyBadgeVariant(item.difficulty)}>{PUZZLE_DIFFICULTY_LABELS[item.difficulty]}</Badge>
                  {checked ? (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">
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
            disabled={!hasPuzzle}
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
              onClick={() => onAdd(picked.map((item) => toInput(item, timer ? Number(timer) : null)))}
            >
              Add {picked.length || ""} {picked.length === 1 ? "activity" : "activities"}
            </Button>
          </div>
        </DialogFooter>
        {full && room > 0 ? <p className="text-xs text-app-muted">The queue can take {room} more.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
