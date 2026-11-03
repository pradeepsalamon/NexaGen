"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  MAX_ASSIGNMENT_PUZZLES,
  puzzleTopicPathLabel,
  type CoachBatch,
  type PuzzleListQuery,
  type PuzzleStatus,
  type PuzzleSummary,
  type PuzzleTopicDto,
  type PuzzleVisibility
} from "@nexa-chess/types";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Eye,
  FileUp,
  ListChecks,
  Pencil,
  Plus,
  Puzzle,
  ScanSearch,
  Search,
  Send,
  Swords,
  Trash2,
  Trophy,
  Undo2
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { BulkActionsBar } from "@/components/ui/BulkActionsBar";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { SortButton, type SortDirection } from "@/components/ui/DataTableSortButton";
import { Card } from "@/components/ui/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { RowActions, type RowAction } from "@/components/ui/RowActions";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/Table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useToast } from "@/providers/ToastProvider";
import { restoreTrashItem } from "@/features/trash/api/trashApi";
import { AssignmentFormDialog } from "@/features/assignments/components/AssignmentFormDialog";
import type { SelectedSetPuzzle } from "@/features/assignments/components/puzzle-set/PuzzleSetEditor";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import {
  deletePuzzle,
  duplicatePuzzle,
  setPuzzleArchived,
  setPuzzlePublished
} from "../api/puzzleApi";
import { useLibrary } from "../hooks/useActivitiesApi";
import {
  useFolderHomework,
  usePuzzleStats,
  usePuzzles,
  usePuzzleTopics
} from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_STATUS_OPTIONS,
  PUZZLE_TYPE_LABELS,
  PUZZLE_TYPE_OPTIONS,
  difficultyBadgeVariant,
  puzzleTopicOptions,
  statusBadgeVariant
} from "../lib/puzzleMeta";
import { ActivityLibraryTable } from "./activities/ActivityLibraryTable";
import { CatalogBrowser } from "./catalog/CatalogBrowser";
import { PuzzleImportDialog } from "./PuzzleImportDialog";
import { TopicManager } from "./TopicManager";
import { enumLabel } from "@/lib/utils";

type ScopeConfig = { scope?: PuzzleListQuery["scope"]; visibility?: PuzzleVisibility };

/**
 * Which puzzles can go into an assignment: published ones, and for an admin
 * (whose assignment is a shared library item) global ones only — the same
 * rule the API enforces on save.
 */
function assignBlocker(p: PuzzleSummary, role: Props["role"]): string | null {
  if (p.status !== "PUBLISHED") return "Publish this puzzle to assign it";
  if (role === "admin" && p.visibility !== "GLOBAL") return "Shared assignments use admin-library puzzles only";
  return null;
}

const toSetPuzzle = (p: PuzzleSummary): SelectedSetPuzzle => ({
  difficulty: p.difficulty,
  puzzleId: p.id,
  tags: p.tags,
  title: p.title,
  topicName: p.topicName
});

/** The selection, kept across tabs and pages, in the order puzzles were picked. */
type Selection = {
  selected: Map<string, PuzzleSummary>;
  toggle: (p: PuzzleSummary, on: boolean) => void;
  setMany: (list: PuzzleSummary[], on: boolean) => void;
  assign: (list: PuzzleSummary[]) => void;
};

interface Props {
  role: "admin" | "coach";
  basePath: string;
}

export function PuzzleLibraryClient({ role, basePath }: Props) {
  const tabs =
    role === "admin"
      ? [
          { key: "all", label: "Chess puzzles", cfg: { scope: "all" } as ScopeConfig },
          { key: "admin", label: "Admin puzzles", cfg: { visibility: "GLOBAL" } as ScopeConfig },
          { key: "coach", label: "Coach puzzles", cfg: { visibility: "PRIVATE" } as ScopeConfig }
        ]
      : [
          { key: "all", label: "Chess puzzles", cfg: { scope: "all" } as ScopeConfig },
          { key: "mine", label: "My puzzles", cfg: { scope: "mine" } as ScopeConfig },
          { key: "admin", label: "Admin library", cfg: { scope: "admin" } as ScopeConfig }
        ];

  const stats = usePuzzleStats(role === "admin");
  // Only the totals are read; the stats card counts each kind, so the numbers match the tabs.
  const mcqCount = useLibrary({ kind: "MCQ", pageSize: 1 }, role === "admin");
  const playoutCount = useLibrary({ kind: "PLAYOUT", pageSize: 1 }, role === "admin");
  const [importOpen, setImportOpen] = useState(false);

  // Assign straight from the library: one puzzle (row button) or the selection.
  const [selected, setSelected] = useState<Map<string, PuzzleSummary>>(() => new Map());
  const [assigning, setAssigning] = useState<SelectedSetPuzzle[] | null>(null);
  const coachBatches = useCoachBatches({ enabled: role === "coach" });
  const toggle = useCallback((p: PuzzleSummary, on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(p.id, p);
      else next.delete(p.id);
      return next;
    });
  }, []);
  const setMany = useCallback((list: PuzzleSummary[], on: boolean) => {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of list) {
        if (on) next.set(p.id, p);
        else next.delete(p.id);
      }
      return next;
    });
  }, []);
  const selection: Selection = {
    assign: (list) => setAssigning(list.map(toSetPuzzle)),
    selected,
    setMany,
    toggle
  };
  const tooMany = selected.size > MAX_ASSIGNMENT_PUZZLES;
  // Coach: a homework-approved folder being assigned (Topics tab).
  const [assigningFolder, setAssigningFolder] = useState<PuzzleTopicDto | null>(null);

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      <PageHeader
        actions={
          <>
            {role === "admin" ? (
              <Button asChild variant="neutral">
                <Link href={`${basePath}/scoring`}>
                  <Trophy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  Points &amp; leaderboard
                </Link>
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <FileUp aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  {role === "admin" ? "Import or create" : "Import"}
                  <ChevronDown aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuItem className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold" onSelect={() => setImportOpen(true)}>
                  <FileUp aria-hidden="true" className="size-4" strokeWidth={2.25} />
                  Import PGN
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold">
                  <Link href={`${basePath}/import-pdf`}>
                    <ScanSearch aria-hidden="true" className="size-4" strokeWidth={2.25} />
                    Import from PDF
                  </Link>
                </DropdownMenuItem>
                {role === "admin" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold">
                      <Link href={`${basePath}/activities/new?kind=MCQ`}>
                        <ListChecks aria-hidden="true" className="size-4" strokeWidth={2.25} />
                        New MCQ
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="flex cursor-pointer items-center gap-2.5 py-2 font-semibold">
                      <Link href={`${basePath}/activities/new?kind=PLAYOUT`}>
                        <Swords aria-hidden="true" className="size-4" strokeWidth={2.25} />
                        New Playout
                      </Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button asChild>
              <Link href={`${basePath}/new`}>
                <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
                New puzzle
              </Link>
            </Button>
          </>
        }
        description={
          role === "admin"
            ? "Chess puzzles, MCQs and Playouts in one library, ready to share in any class."
            : "Browse puzzles, MCQs and Playouts to use in class, and manage your own puzzles."
        }
        title="Puzzle library"
      />

      {role === "admin" && stats.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
          {[
            ["Puzzles", stats.data.total],
            ["Published", stats.data.published],
            ["Drafts", stats.data.draft],
            ["Archived", stats.data.archived],
            ["Global", stats.data.global],
            ["Coach", stats.data.private],
            ["MCQs", mcqCount.data?.pagination.total ?? 0],
            ["Playouts", playoutCount.data?.pagination.total ?? 0],
            ["Topics", stats.data.topics],
            ["Lichess copies", stats.data.trainingCache]
          ].map(([label, value]) => (
            <Card key={label as string} className="p-3">
              <p className="text-xs font-semibold text-app-muted">
                {label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-app-text">{value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Admins land on the folder tree; coaches on their puzzle list. */}
      <Tabs defaultValue={role === "admin" ? "topics" : tabs[0].key}>
        <TabsList className="flex-wrap justify-self-end">
          <TabsTrigger value="activities">All activities</TabsTrigger>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="mcq">MCQs</TabsTrigger>
          <TabsTrigger value="playout">Playouts</TabsTrigger>
          <TabsTrigger value="catalog">Lichess catalogue</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
        </TabsList>

        <TabsContent value="activities">
          <ActivityLibraryTable basePath={basePath} role={role} />
        </TabsContent>
        <TabsContent value="mcq">
          <ActivityLibraryTable basePath={basePath} kind="MCQ" role={role} />
        </TabsContent>
        <TabsContent value="playout">
          <ActivityLibraryTable basePath={basePath} kind="PLAYOUT" role={role} />
        </TabsContent>

        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <PuzzleTable basePath={basePath} cfg={t.cfg} role={role} selection={selection} />
          </TabsContent>
        ))}
        <TabsContent value="catalog">
          <CatalogBrowser role={role} />
        </TabsContent>
        <TabsContent value="topics">
          <TopicManager
            basePath={basePath}
            canManage={role === "admin"}
            onAssignFolder={role === "coach" ? setAssigningFolder : undefined}
          />
        </TabsContent>
      </Tabs>
      <PuzzleImportDialog open={importOpen} onOpenChange={setImportOpen} role={role} />

      <BulkActionsBar
        actions={[
          {
            disabled: tooMany,
            icon: ClipboardCheck,
            label: tooMany
              ? `At most ${MAX_ASSIGNMENT_PUZZLES} per assignment`
              : role === "coach"
                ? "Assign"
                : "Create assignment",
            onSelect: () => selection.assign([...selected.values()])
          }
        ]}
        count={selected.size}
        noun="puzzle"
        onClear={() => setSelected(new Map())}
      />

      <AssignmentFormDialog
        open={assigning !== null}
        onOpenChange={(o) => {
          if (!o) setAssigning(null);
        }}
        mode="create"
        initialPuzzles={assigning ?? undefined}
        coachBatches={role === "coach" ? coachBatches.data?.batches ?? [] : undefined}
        onCreated={() => setSelected(new Map())}
      />

      {role === "coach" ? (
        <AssignFolderDialog
          folder={assigningFolder}
          coachBatches={coachBatches.data?.batches ?? []}
          onClose={() => setAssigningFolder(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Assign a homework-approved folder through the ordinary homework dialog. The
 * folder's set is fetched fresh on open: if the Super Admin revoked it (or it
 * changed shape) since the list loaded, the coach is told instead.
 */
function AssignFolderDialog({
  folder,
  coachBatches,
  onClose
}: {
  folder: PuzzleTopicDto | null;
  coachBatches: CoachBatch[];
  onClose: () => void;
}) {
  const toast = useToast();
  const { data, error, isFetching } = useFolderHomework(folder?.id ?? null);
  const ready = !!folder && !isFetching && !!data && data.topicId === folder.id;
  const blocker = ready ? data.blocker : null;

  useEffect(() => {
    if (!folder || isFetching) return;
    if (error || blocker) {
      toast.error({
        title: `"${folder.name}" can't be assigned`,
        message: blocker ?? (error as Error).message
      });
      onClose();
    }
  }, [folder, isFetching, error, blocker, toast, onClose]);

  const puzzles = useMemo(
    () =>
      ready
        ? data.puzzles.map((p) => ({
            difficulty: p.difficulty,
            puzzleId: p.puzzleId,
            tags: p.tags,
            title: p.title,
            topicName: p.topicName
          }))
        : undefined,
    [ready, data]
  );

  return (
    <AssignmentFormDialog
      open={ready && !blocker}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      mode="create"
      initialPuzzles={puzzles}
      sourceFolder={folder ? { id: folder.id, name: folder.name } : undefined}
      coachBatches={coachBatches}
    />
  );
}

type PuzzleSortKey = "title" | "puzzleType" | "difficulty" | "status";

function PuzzleTable({
  basePath,
  cfg,
  role,
  selection
}: {
  basePath: string;
  cfg: ScopeConfig;
  role: Props["role"];
  selection: Selection;
}) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [topicId, setTopicId] = useState("");
  const [puzzleType, setPuzzleType] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  // Unsorted (the API's own order) until a header is clicked: asc → desc → off.
  const [sort, setSort] = useState<{ key: PuzzleSortKey; order: SortDirection } | null>(null);
  const sortProps = (key: PuzzleSortKey) => ({
    direction: sort?.key === key ? sort.order : (false as const),
    onClick: () => {
      setPage(1);
      setSort((prev) => {
        if (prev?.key !== key) return { key, order: "asc" };
        return prev.order === "asc" ? { key, order: "desc" } : null;
      });
    }
  });

  const query: PuzzleListQuery = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: search || undefined,
      sort: sort?.key,
      order: sort?.order,
      scope: cfg.scope,
      visibility: cfg.visibility,
      topicId: topicId || undefined,
      puzzleType: (puzzleType || undefined) as PuzzleListQuery["puzzleType"],
      difficulty: (difficulty || undefined) as PuzzleListQuery["difficulty"],
      status: (status || undefined) as PuzzleStatus | undefined
    }),
    [page, search, sort, cfg, topicId, puzzleType, difficulty, status]
  );

  const { data, isLoading, isPlaceholderData } = usePuzzles(query);
  const { data: topicsData } = usePuzzleTopics();
  const topicOptions = useMemo(
    () => puzzleTopicOptions(topicsData?.topics ?? []),
    [topicsData]
  );

  const invalidates = [queryKeys.puzzles.all];
  const { run: runPublish } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setPuzzlePublished(id, { published: next }),
    undo: ({ id, next }) => setPuzzlePublished(id, { published: !next }),
    toast: ({ next }) => ({ title: next ? "Puzzle published" : "Puzzle unpublished" }),
    invalidates
  });
  const { run: runArchive } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setPuzzleArchived(id, { archived: next }),
    undo: ({ id, next }) => setPuzzleArchived(id, { archived: !next }),
    toast: ({ next }) => ({ title: next ? "Puzzle archived" : "Puzzle restored" }),
    invalidates
  });
  const { run: runDelete } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (p: PuzzleSummary) => deletePuzzle(p.id),
    undo: (p) => restoreTrashItem("Puzzle", p.id),
    toast: (p) => ({ title: `"${p.title}" deleted` }),
    invalidates
  });
  const { run: runDuplicate } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: (p: PuzzleSummary) => duplicatePuzzle(p.id),
    undo: (_p, result) => deletePuzzle(result.puzzle.id),
    toast: (p) => ({ title: `Copied "${p.title}"` }),
    invalidates
  });

  const puzzleActions = (p: PuzzleSummary): RowAction[] => {
    const actions: RowAction[] = [];
    if (!assignBlocker(p, role)) {
      actions.push({
        ariaLabel: `Assign ${p.title}`,
        icon: ClipboardCheck,
        label: role === "coach" ? "Assign" : "Create assignment",
        onSelect: () => selection.assign([p])
      });
    }
    actions.push({ ariaLabel: "Preview puzzle", href: `${basePath}/${p.id}`, icon: Eye, label: "Preview" });
    if (p.canManage) {
      actions.push({ ariaLabel: "Edit puzzle", href: `${basePath}/${p.id}/edit`, icon: Pencil, label: "Edit" });
    }
    actions.push({ ariaLabel: "Duplicate puzzle", icon: Copy, label: "Duplicate", onSelect: () => runDuplicate(p) });
    if (p.canManage) {
      const published = p.status === "PUBLISHED";
      const archived = p.status === "ARCHIVED";
      actions.push(
        {
          ariaLabel: published ? "Unpublish puzzle" : "Publish puzzle",
          icon: published ? Undo2 : Send,
          label: published ? "Unpublish" : "Publish",
          onSelect: () => runPublish({ id: p.id, next: !published })
        },
        {
          ariaLabel: archived ? "Restore puzzle" : "Archive puzzle",
          icon: archived ? ArchiveRestore : Archive,
          label: archived ? "Restore" : "Archive",
          onSelect: () => runArchive({ id: p.id, next: !archived })
        },
        { ariaLabel: "Delete puzzle", icon: Trash2, label: "Delete", onSelect: () => runDelete(p), tone: "danger" }
      );
    }
    return actions;
  };

  const puzzles = data?.puzzles ?? [];
  const pagination = data?.pagination;
  const pageAssignable = puzzles.filter((p) => !assignBlocker(p, role));
  const pageSelected = pageAssignable.filter((p) => selection.selected.has(p.id)).length;
  const headerChecked: boolean | "indeterminate" =
    pageAssignable.length > 0 && pageSelected === pageAssignable.length
      ? true
      : pageSelected > 0
        ? "indeterminate"
        : false;
  const hasFilters = Boolean(
    searchInput || topicId || puzzleType || difficulty || status
  );

  const clearFilters = () => {
    setSearchInput("");
    setTopicId("");
    setPuzzleType("");
    setDifficulty("");
    setStatus("");
    setPage(1);
  };

  return (
    <Card className="grid gap-4 p-4">
      <div className="flex flex-wrap justify-end gap-2">
        <div className="w-full sm:w-56">
          <Input
            aria-label="Search puzzles"
            leadingIcon={<Search aria-hidden="true" className="size-4" strokeWidth={2.25} />}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Search puzzles"
            value={searchInput}
          />
        </div>
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
        <Select
          aria-label="Filter by type"
          value={puzzleType}
          placeholder="All types"
          options={PUZZLE_TYPE_OPTIONS}
          onChange={(e) => {
            setPuzzleType(e.target.value);
            setPage(1);
          }}
          className="w-auto"
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
        {hasFilters && (
          <Button variant="neutral" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-app" />
          ))}
        </div>
      ) : puzzles.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          title={hasFilters ? "No puzzles match your filters" : "No puzzles yet"}
          variant="inline"
          description={
            hasFilters
              ? "Try a different search or clear the filters."
              : "Create your first puzzle and build your training library."
          }
          action={
            hasFilters
              ? { label: "Clear filters", onClick: clearFilters }
              : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className={isPlaceholderData ? "opacity-60" : undefined}>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    aria-label="Select every assignable puzzle on this page"
                    checked={headerChecked}
                    disabled={pageAssignable.length === 0}
                    onCheckedChange={(v) => selection.setMany(pageAssignable, v === true)}
                  />
                </TableHead>
                <TableHead><SortButton label="Puzzle" {...sortProps("title")} /></TableHead>
                <TableHead>Topic</TableHead>
                <TableHead><SortButton label="Type" {...sortProps("puzzleType")} /></TableHead>
                <TableHead><SortButton label="Difficulty" {...sortProps("difficulty")} /></TableHead>
                <TableHead>Creator</TableHead>
                <TableHead><SortButton label="Status" {...sortProps("status")} /></TableHead>
                <TableHead className="text-right" pin="end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {puzzles.map((p) => (
                <TableRow key={p.id} data-state={selection.selected.has(p.id) ? "selected" : undefined}>
                  <TableCell>
                    {(() => {
                      const blocker = assignBlocker(p, role);
                      const box = (
                        <Checkbox
                          aria-label={blocker ? `${p.title}: ${blocker}` : `Select ${p.title}`}
                          checked={selection.selected.has(p.id)}
                          disabled={!!blocker}
                          onCheckedChange={(v) => selection.toggle(p, v === true)}
                        />
                      );
                      return blocker ? (
                        <SimpleTooltip label={blocker}>
                          <span className="inline-flex">{box}</span>
                        </SimpleTooltip>
                      ) : (
                        box
                      );
                    })()}
                  </TableCell>
                  <TableCell className="min-w-44 font-medium text-app-text">
                    <Link href={`${basePath}/${p.id}`} className="rounded-control hover:text-primary-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus">
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {puzzleTopicPathLabel(topicsData?.topics ?? [], p.topicId) || p.topicName}
                  </TableCell>
                  <TableCell>{PUZZLE_TYPE_LABELS[p.puzzleType]}</TableCell>
                  <TableCell>
                    <Badge variant={difficultyBadgeVariant(p.difficulty)}>
                      {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      {p.visibility === "GLOBAL" ? (
                        <Badge variant="default">Admin library</Badge>
                      ) : (
                        <span className="text-app-muted">{p.createdByName}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(p.status)}>{enumLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell pin="end">
                    <RowActions actions={puzzleActions(p)} inline={3} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4 text-sm text-app-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} puzzles
          </span>
          <div className="flex gap-2">
            <Button
              variant="neutral"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="neutral"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
