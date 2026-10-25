"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  puzzleTopicPathLabel,
  type PuzzleSummary,
  type PuzzleTopicDto
} from "@nexa-chess/types";
import { ArrowLeft, Eye, Folder, PencilLine, Pencil, X } from "lucide-react";
import { BulkResultDialog, type BulkResult } from "@/components/common/BulkResultDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/Table";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { enumLabel } from "@/lib/utils";
import { useFolderPuzzles } from "../../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant,
  statusBadgeVariant
} from "../../lib/puzzleMeta";
import { PuzzleQuickPreviewDialog } from "../PuzzleQuickPreviewDialog";
import { BulkEditPuzzlesDialog } from "./BulkEditPuzzlesDialog";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

/**
 * One folder opened from the Topics tab: the puzzles filed directly in it (its
 * subfolders stay in the tree), with a step-through preview and a bulk edit of
 * the selection. Selection never leaves this folder, and rows that disappear
 * on a refetch (moved, deleted) drop out of it.
 */
export function FolderPuzzlesPanel({
  basePath,
  folder,
  onBack,
  subfolderCount,
  topics
}: {
  basePath: string;
  folder: PuzzleTopicDto;
  onBack: () => void;
  subfolderCount: number;
  topics: PuzzleTopicDto[];
}) {
  const { data, error, isLoading, refetch } = useFolderPuzzles(folder.id);
  const puzzles = useMemo(() => data?.puzzles ?? [], [data]);
  const total = data?.pagination?.total ?? puzzles.length;
  const manageable = useMemo(() => puzzles.filter((p) => p.canManage), [puzzles]);

  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  // Only ids still in this folder count — a stale pick is never sent.
  const selected = useMemo(() => manageable.filter((p) => picked.has(p.id)), [manageable, picked]);
  const allChecked: boolean | "indeterminate" =
    manageable.length > 0 && selected.length === manageable.length
      ? true
      : selected.length > 0
        ? "indeterminate"
        : false;

  // Preview: the selection when there is one, otherwise the whole folder.
  const [preview, setPreview] = useState<{ list: PuzzleSummary[]; index: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const selectAll = (on: boolean) => setPicked(on ? new Set(manageable.map((p) => p.id)) : new Set());

  const path = puzzleTopicPathLabel(topics, folder.id) || folder.name;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SimpleTooltip label="Back to all folders">
            <Button aria-label="Back to all folders" variant="outline" size="icon" className={iconBtn} onClick={onBack}>
              <ArrowLeft className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
          {folder.icon ? (
            <span className="shrink-0">{folder.icon}</span>
          ) : (
            <Folder className="size-4 shrink-0 fill-secondary/30 text-secondary-ink" strokeWidth={2} />
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-app-text">{path}</p>
            <p className="text-xs text-app-muted">
              {total} puzzle{total === 1 ? "" : "s"} in this folder
              {subfolderCount ? ` · ${subfolderCount} subfolder${subfolderCount === 1 ? "" : "s"} not included` : ""}
            </p>
          </div>
        </div>
        {puzzles.length > 0 ? (
          <Button
            variant="outline"
            onClick={() => setPreview({ index: 0, list: selected.length ? selected : puzzles })}
          >
            <Eye className="mr-2 size-4" strokeWidth={2.5} />
            {selected.length ? `Preview ${selected.length} selected` : "Preview puzzles"}
          </Button>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-primary/40 bg-primary/5 px-3 py-2 text-sm"
        >
          <span aria-live="polite" className="font-semibold text-app-text">
            {selected.length} of {manageable.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {selected.length < manageable.length ? (
              <Button size="sm" variant="ghost" onClick={() => selectAll(true)}>
                Select all {manageable.length}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => selectAll(false)}>
              <X className="mr-1.5 size-4" strokeWidth={2.5} />
              Clear selection
            </Button>
            <Button size="sm" onClick={() => setEditing(true)}>
              <PencilLine className="mr-1.5 size-4" strokeWidth={2.5} />
              Bulk edit
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : error ? (
        <WidgetError message="Could not load this folder's puzzles." onRetry={() => void refetch()} />
      ) : puzzles.length === 0 ? (
        <EmptyState
          icon={Folder}
          title="No puzzles in this folder"
          description={
            subfolderCount
              ? "Its puzzles are filed in subfolders — open one of those instead."
              : "Puzzles filed in this folder will appear here."
          }
          action={{ label: "Back to folders", onClick: onBack }}
        />
      ) : (
        <>
          {total > puzzles.length ? (
            <p className="text-sm text-app-muted">
              Showing the first {puzzles.length} of {total} puzzles (by title).
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all puzzles in this folder"
                      checked={allChecked}
                      disabled={manageable.length === 0}
                      onCheckedChange={(v) => selectAll(v === true)}
                    />
                  </TableHead>
                  <TableHead>Puzzle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right" pin="end">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {puzzles.map((p, index) => (
                  <TableRow key={p.id} data-state={picked.has(p.id) && p.canManage ? "selected" : undefined}>
                    <TableCell>
                      {p.canManage ? (
                        <Checkbox
                          aria-label={`Select ${p.title}`}
                          checked={picked.has(p.id)}
                          onCheckedChange={(v) => toggle(p.id, v === true)}
                        />
                      ) : (
                        <SimpleTooltip label="Only its author or an admin can edit this puzzle">
                          <span className="inline-flex">
                            <Checkbox aria-label={`${p.title}: not editable`} checked={false} disabled />
                          </span>
                        </SimpleTooltip>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-app-text">
                      <Link href={`${basePath}/${p.id}`} className="hover:text-primary-ink">
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell>{PUZZLE_TYPE_LABELS[p.puzzleType]}</TableCell>
                    <TableCell>
                      <Badge variant={difficultyBadgeVariant(p.difficulty)}>
                        {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[14rem] truncate text-app-muted">
                      {p.tags.length ? p.tags.map((t) => `#${t}`).join(" ") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(p.status)}>{enumLabel(p.status)}</Badge>
                    </TableCell>
                    <TableCell pin="end">
                      <div className="flex items-center justify-end gap-1.5">
                        <SimpleTooltip label="Preview">
                          <Button
                            aria-label={`Preview ${p.title}`}
                            variant="outline"
                            size="icon"
                            className={iconBtn}
                            onClick={() => setPreview({ index, list: puzzles })}
                          >
                            <Eye className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                        {p.canManage ? (
                          <SimpleTooltip label="Edit">
                            <Button asChild aria-label={`Edit ${p.title}`} variant="outline" size="icon" className={iconBtn}>
                              <Link href={`${basePath}/${p.id}/edit`}>
                                <Pencil className="size-4" strokeWidth={2.5} />
                              </Link>
                            </Button>
                          </SimpleTooltip>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <PuzzleQuickPreviewDialog
        puzzleId={preview ? (preview.list[preview.index]?.id ?? null) : null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        sequence={
          preview
            ? {
                index: preview.index,
                total: preview.list.length,
                onIndexChange: (index) => setPreview((prev) => (prev ? { ...prev, index } : prev))
              }
            : undefined
        }
      />

      {editing ? (
        <BulkEditPuzzlesDialog
          open
          folder={folder}
          puzzles={selected}
          topics={topics}
          onClose={() => setEditing(false)}
          onDone={(res) => {
            setEditing(false);
            setPicked(new Set());
            setResult(res);
          }}
        />
      ) : null}
      <BulkResultDialog result={result} onClose={() => setResult(null)} />
    </div>
  );
}
