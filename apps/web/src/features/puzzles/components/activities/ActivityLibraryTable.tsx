"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Eye, FolderInput, ListChecks, Pencil, Puzzle as PuzzleIcon, Send, Swords, Trash2, Undo2 } from "lucide-react";
import {
  LIBRARY_ITEM_KIND_LABELS,
  type LibraryItemKind,
  type LibraryItemSummary,
  type LibraryListQuery,
  type PuzzleDifficulty,
  type PuzzleStatus
} from "@nexa-chess/types";
import { BulkResultDialog, type BulkResult } from "@/components/common/BulkResultDialog";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { BulkActionsBar } from "@/components/ui/BulkActionsBar";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { restoreTrashItem } from "@/features/trash/api/trashApi";
import { PuzzleBoardTile } from "@/features/live-class/components/meeting/PuzzleBoardTile";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { enumLabel } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { bulkActivities, deleteActivity, duplicateActivity, setActivityArchived, setActivityPublished } from "../../api/activityApi";
import { bulkPuzzleAction } from "../../api/puzzleApi";
import { useLibrary } from "../../hooks/useActivitiesApi";
import { usePuzzleTopics } from "../../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_STATUS_OPTIONS,
  difficultyBadgeVariant,
  puzzleTopicOptions,
  statusBadgeVariant
} from "../../lib/puzzleMeta";
import { ActivityPreviewDialog } from "./ActivityPreviewDialog";

const KIND_ICON: Record<LibraryItemKind, typeof PuzzleIcon> = { MCQ: ListChecks, PLAYOUT: Swords, PUZZLE: PuzzleIcon };
const PAGE_SIZE = 20;

const itemKey = (item: Pick<LibraryItemSummary, "id" | "kind">) => `${item.kind}:${item.id}`;

function Thumbnail({ item }: { item: LibraryItemSummary }) {
  const Icon = KIND_ICON[item.kind];
  if (item.thumbnailUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded CDN image of unknown size
    return <img src={item.thumbnailUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-control border border-app-border object-cover" />;
  }
  if (item.previewFen) {
    return (
      <div className="size-12 shrink-0" aria-hidden="true">
        <PuzzleBoardTile fen={item.previewFen} orientation={item.previewFen.split(" ")[1] === "b" ? "black" : "white"} />
      </div>
    );
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-control bg-app-soft text-app-muted" aria-hidden="true">
      <Icon className="size-5" strokeWidth={2.25} />
    </span>
  );
}

/**
 * The library's All activities / MCQs / Playouts tabs, and a folder's activities.
 * One table over the unified list. Chess puzzles keep their own pages and routes:
 * here a puzzle row only links to them.
 */
export function ActivityLibraryTable({
  basePath,
  kind,
  role,
  folderId
}: {
  basePath: string;
  /** Limit to one kind. Absent = everything. */
  kind?: LibraryItemKind;
  role: "admin" | "coach";
  /** Show only what is filed directly in this folder, without the folder filter. */
  folderId?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const timeZone = useUserTimeZone();
  const isAdmin = role === "admin";
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [topicId, setTopicId] = useState("");
  const [subject, setSubject] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LibraryItemSummary | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState("");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [selected, setSelected] = useState<Map<string, LibraryItemSummary>>(() => new Map());

  const query: LibraryListQuery = useMemo(
    () => ({
      difficulty: (difficulty || undefined) as PuzzleDifficulty | undefined,
      kind,
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status: (status || undefined) as PuzzleStatus | undefined,
      topic: subject || undefined,
      topicId: folderId ?? (topicId || undefined),
      topicScope: folderId ? "direct" : undefined
    }),
    [difficulty, kind, page, search, status, subject, topicId, folderId]
  );
  const { data, error, isLoading, isPlaceholderData, refetch } = useLibrary(query);
  const { data: topicsData } = usePuzzleTopics();
  const topicOptions = useMemo(() => puzzleTopicOptions(topicsData?.topics ?? []), [topicsData]);
  const items = data?.items ?? [];
  const pagination = data?.pagination;
  const subjectOptions = (data?.topics ?? []).map((t) => ({ label: enumLabel(t), value: t }));

  const invalidates = [queryKeys.puzzles.all];
  const { run: runPublish } = useUndoableMutation({
    invalidates,
    mutationFn: ({ id, next }: { id: string; next: boolean }) => setActivityPublished(id, next),
    strategy: "immediate",
    toast: ({ next }) => ({ title: next ? "Published" : "Unpublished" }),
    undo: ({ id, next }) => setActivityPublished(id, !next)
  });
  const { run: runArchive } = useUndoableMutation({
    invalidates,
    mutationFn: ({ id, next }: { id: string; next: boolean }) => setActivityArchived(id, next),
    strategy: "immediate",
    toast: ({ next }) => ({ title: next ? "Archived" : "Restored" }),
    undo: ({ id, next }) => setActivityArchived(id, !next)
  });
  const { run: runDelete } = useUndoableMutation({
    invalidates,
    mutationFn: (item: LibraryItemSummary) => deleteActivity(item.id),
    strategy: "immediate",
    toast: (item) => ({ title: `"${item.title}" deleted` }),
    undo: (item) => restoreTrashItem("LibraryActivity", item.id)
  });
  const { run: runDuplicate } = useUndoableMutation({
    invalidates,
    mutationFn: (item: LibraryItemSummary) => duplicateActivity(item.id),
    strategy: "immediate",
    toast: (item) => ({ title: `Copied "${item.title}"` }),
    undo: (_item, copy) => deleteActivity(copy.activity.id)
  });

  const toggle = (item: LibraryItemSummary, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(itemKey(item), item);
      else next.delete(itemKey(item));
      return next;
    });
  const pageSelected = items.filter((i) => selected.has(itemKey(i))).length;
  const headerChecked: boolean | "indeterminate" =
    items.length > 0 && pageSelected === items.length ? true : pageSelected > 0 ? "indeterminate" : false;
  const hasFilters = !!(searchInput || topicId || subject || difficulty || status);
  const clearFilters = () => {
    setSearchInput("");
    setTopicId("");
    setSubject("");
    setDifficulty("");
    setStatus("");
    setPage(1);
  };

  const rowActions = (item: LibraryItemSummary): RowAction[] => {
    if (item.kind === "PUZZLE") {
      return [{ icon: Eye, label: "Open puzzle", ariaLabel: `Open ${item.title}`, onSelect: () => router.push(`${basePath}/${item.id}`) }];
    }
    const actions: RowAction[] = [
      { ariaLabel: `Preview ${item.title}`, icon: Eye, label: "Preview", onSelect: () => setPreviewId(item.id) }
    ];
    if (!isAdmin) return actions;
    actions.push(
      { ariaLabel: `Edit ${item.title}`, icon: Pencil, label: "Edit", onSelect: () => router.push(`${basePath}/activities/${item.id}/edit`) },
      {
        ariaLabel: item.status === "PUBLISHED" ? `Unpublish ${item.title}` : `Publish ${item.title}`,
        icon: item.status === "PUBLISHED" ? Undo2 : Send,
        label: item.status === "PUBLISHED" ? "Unpublish" : "Publish",
        onSelect: () => void runPublish({ id: item.id, next: item.status !== "PUBLISHED" })
      },
      {
        ariaLabel: item.status === "ARCHIVED" ? `Restore ${item.title}` : `Archive ${item.title}`,
        icon: item.status === "ARCHIVED" ? ArchiveRestore : Archive,
        label: item.status === "ARCHIVED" ? "Restore" : "Archive",
        onSelect: () => void runArchive({ id: item.id, next: item.status !== "ARCHIVED" }),
        tone: "warning"
      },
      { ariaLabel: `Duplicate ${item.title}`, icon: Copy, label: "Duplicate", onSelect: () => void runDuplicate(item) },
      { ariaLabel: `Delete ${item.title}`, icon: Trash2, label: "Delete", onSelect: () => setDeleting(item), tone: "danger" }
    );
    return actions;
  };

  /** Puzzles and activities live behind different routes; one action goes to both. */
  const runBulk = async (action: "PUBLISH" | "ARCHIVE" | "DELETE" | "MOVE", topicIdForMove?: string) => {
    const list = [...selected.values()];
    const activities = list.filter((i) => i.kind !== "PUZZLE");
    const puzzles = list.filter((i) => i.kind === "PUZZLE");
    const failed: BulkResult["failed"] = [];
    let succeeded = 0;
    const titleOf = (id: string) => list.find((i) => i.id === id)?.title ?? id;
    try {
      if (activities.length) {
        const res = await bulkActivities({ action, ids: activities.map((i) => i.id), topicId: topicIdForMove });
        succeeded += res.done.length;
        failed.push(...res.skipped.map((s) => ({ label: titleOf(s.id), reason: s.reason })));
      }
      if (puzzles.length && action !== "MOVE") {
        const res = await bulkPuzzleAction({
          action: action === "PUBLISH" ? "publish" : action === "ARCHIVE" ? "archive" : "delete",
          ids: puzzles.map((i) => i.id)
        });
        succeeded += res.updated;
      }
    } catch (error) {
      failed.push({ label: "The rest", reason: (error as Error).message });
    }
    setSelected(new Map());
    setResult({ action: enumLabel(action), failed, succeeded });
    void qc.invalidateQueries({ queryKey: queryKeys.puzzles.all });
  };

  const hasPuzzleSelected = [...selected.values()].some((i) => i.kind === "PUZZLE");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          aria-label="Search the library"
          placeholder="Search…"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          className="w-full sm:w-56"
        />
        {!folderId ? (
          <Select
            aria-label="Filter by folder"
            value={topicId}
            placeholder="All folders"
            options={topicOptions}
            onChange={(e) => {
              setTopicId(e.target.value);
              setPage(1);
            }}
            className="w-auto max-w-56"
          />
        ) : null}
        <Select
          aria-label="Filter by topic"
          value={subject}
          placeholder="All topics"
          options={subjectOptions}
          onChange={(e) => {
            setSubject(e.target.value);
            setPage(1);
          }}
          className="w-auto max-w-48"
        />
        <Select
          aria-label="Filter by difficulty"
          value={difficulty}
          placeholder="All difficulties"
          options={PUZZLE_DIFFICULTY_OPTIONS}
          onChange={(e) => {
            setDifficulty(e.target.value);
            setPage(1);
          }}
          className="w-auto"
        />
        {isAdmin ? (
          <Select
            aria-label="Filter by status"
            value={status}
            placeholder="All statuses"
            options={PUZZLE_STATUS_OPTIONS}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
        ) : null}
        {hasFilters ? (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        ) : null}
      </div>

      {error ? (
        <WidgetError message="Couldn't load the library." onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={hasFilters ? "Nothing matches your filters" : "Nothing here yet"}
          description={
            hasFilters
              ? "Try a different search or clear the filters."
              : isAdmin
                ? "Create an MCQ or a Playout and file it in a folder."
                : "Published activities appear here for you to use in class."
          }
          action={hasFilters ? { label: "Clear filters", onClick: clearFilters } : undefined}
          variant={folderId ? "inline" : "page"}
        />
      ) : (
        <div className="overflow-x-auto rounded-app border border-app-border">
          <Table className={isPlaceholderData ? "opacity-60" : undefined}>
            <TableHeader>
              <TableRow>
                {isAdmin ? (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select everything on this page"
                      checked={headerChecked}
                      onCheckedChange={(on) => {
                        for (const item of items) toggle(item, on === true);
                      }}
                    />
                  </TableHead>
                ) : null}
                <TableHead className="text-left">Activity</TableHead>
                <TableHead className="text-left">Type</TableHead>
                <TableHead className="text-left">Folder</TableHead>
                <TableHead className="text-left">Difficulty</TableHead>
                <TableHead className="text-left">Status</TableHead>
                <TableHead className="text-left">Created by</TableHead>
                <TableHead className="text-left">Updated</TableHead>
                <TableHead pin="end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <TableRow key={itemKey(item)}>
                    {isAdmin ? (
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${item.title}`}
                          checked={selected.has(itemKey(item))}
                          onCheckedChange={(on) => toggle(item, on === true)}
                        />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex min-w-48 items-center gap-3">
                        <Thumbnail item={item} />
                        <div className="min-w-0">
                          {item.kind === "PUZZLE" ? (
                            <Link href={`${basePath}/${item.id}`} className="block truncate font-semibold text-app-text hover:underline">
                              {item.title}
                            </Link>
                          ) : (
                            <button type="button" onClick={() => setPreviewId(item.id)} className="block max-w-full truncate text-left font-semibold text-app-text hover:underline">
                              {item.title}
                            </button>
                          )}
                          {item.tags.length || item.topic ? (
                            <p className="truncate text-xs text-app-muted">
                              {[item.topic ? enumLabel(item.topic) : null, ...item.tags.slice(0, 3)].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-app-text">
                        <Icon className="size-4 text-app-muted" strokeWidth={2.25} aria-hidden="true" />
                        {LIBRARY_ITEM_KIND_LABELS[item.kind]}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-sm text-app-muted">{item.topicName}</TableCell>
                    <TableCell>
                      <Badge variant={difficultyBadgeVariant(item.difficulty)}>{PUZZLE_DIFFICULTY_LABELS[item.difficulty]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(item.status)}>{enumLabel(item.status)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-32 truncate text-sm text-app-muted">{item.createdByName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-app-muted">{formatFullDate(item.updatedAt, timeZone)}</TableCell>
                    <TableCell pin="end">
                      <RowActions actions={rowActions(item)} inline={2} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm text-app-muted">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      ) : null}

      <ActivityPreviewDialog id={previewId} onClose={() => setPreviewId(null)} />

      <ConfirmationModal
        isOpen={!!deleting}
        title={`Delete "${deleting?.title ?? ""}"?`}
        confirmLabel="Delete"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void runDelete(deleting);
          setDeleting(null);
        }}
      >
        It goes to the Trash. Results from classes that already used it are kept.
      </ConfirmationModal>

      {isAdmin ? (
        <>
          <BulkActionsBar
            count={selected.size}
            noun="activity"
            onClear={() => setSelected(new Map())}
            actions={[
              { icon: Send, label: "Publish", onSelect: () => void runBulk("PUBLISH") },
              { icon: Archive, label: "Archive", onSelect: () => void runBulk("ARCHIVE") },
              ...(hasPuzzleSelected ? [] : [{ icon: FolderInput, label: "Move", onSelect: () => setMoving(true) }]),
              { icon: Trash2, label: "Delete", onSelect: () => setBulkConfirm(true) }
            ]}
          />
          <ConfirmationModal
            isOpen={bulkConfirm}
            title={`Delete ${selected.size} ${selected.size === 1 ? "item" : "items"}?`}
            confirmLabel="Delete"
            onCancel={() => setBulkConfirm(false)}
            onConfirm={() => {
              setBulkConfirm(false);
              void runBulk("DELETE");
            }}
          >
            They go to the Trash, where a Super Admin can restore them.
          </ConfirmationModal>
          <Dialog open={moving} onOpenChange={setMoving}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Move to a folder</DialogTitle>
                <DialogDescription>
                  {selected.size} {selected.size === 1 ? "activity" : "activities"} will move.
                </DialogDescription>
              </DialogHeader>
              <Select aria-label="Folder" value={moveTo} placeholder="Choose a folder" options={topicOptions} onChange={(e) => setMoveTo(e.target.value)} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setMoving(false)}>
                  Cancel
                </Button>
                <Button
                  disabled={!moveTo}
                  onClick={() => {
                    setMoving(false);
                    void runBulk("MOVE", moveTo);
                  }}
                >
                  Move
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <BulkResultDialog result={result} onClose={() => setResult(null)} />
        </>
      ) : null}
    </div>
  );
}
