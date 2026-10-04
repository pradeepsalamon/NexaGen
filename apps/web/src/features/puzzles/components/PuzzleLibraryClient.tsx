"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  puzzleTopicPathLabel,
  type PuzzleListQuery,
  type PuzzleStatus,
  type PuzzleSummary,
  type PuzzleVisibility
} from "@nexa-chess/types";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  FileUp,
  Pencil,
  Plus,
  Send,
  Trash2,
  Trophy,
  Undo2
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SortButton, type SortDirection } from "@/components/ui/DataTableSortButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
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
import { restoreTrashItem } from "@/features/trash/api/trashApi";
import {
  deletePuzzle,
  duplicatePuzzle,
  setPuzzleArchived,
  setPuzzlePublished
} from "../api/puzzleApi";
import { usePuzzleStats, usePuzzles, usePuzzleTopics } from "../hooks/usePuzzlesApi";
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
import { CatalogBrowser } from "./catalog/CatalogBrowser";
import { PuzzleImportDialog } from "./PuzzleImportDialog";
import { TopicManager } from "./TopicManager";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

type ScopeConfig = { scope?: PuzzleListQuery["scope"]; visibility?: PuzzleVisibility };

interface Props {
  role: "admin" | "coach";
  basePath: string;
}

export function PuzzleLibraryClient({ role, basePath }: Props) {
  const tabs =
    role === "admin"
      ? [
          { key: "all", label: "All puzzles", cfg: { scope: "all" } as ScopeConfig },
          { key: "admin", label: "Admin puzzles", cfg: { visibility: "GLOBAL" } as ScopeConfig },
          { key: "coach", label: "Coach puzzles", cfg: { visibility: "PRIVATE" } as ScopeConfig }
        ]
      : [
          { key: "all", label: "All available", cfg: { scope: "all" } as ScopeConfig },
          { key: "mine", label: "My puzzles", cfg: { scope: "mine" } as ScopeConfig },
          { key: "admin", label: "Admin library", cfg: { scope: "admin" } as ScopeConfig }
        ];

  const stats = usePuzzleStats(role === "admin");
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Puzzle Library</h1>
          <p className="mt-1 text-sm text-app-muted">
            {role === "admin"
              ? "Manage the shared puzzle library and every coach's puzzles."
              : "Browse the admin library and manage your own puzzles."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {role === "admin" ? (
            <Button asChild variant="outline">
              <Link href={`${basePath}/scoring`}>
                <Trophy className="mr-2 size-4" strokeWidth={2.5} />
                Points &amp; leaderboard
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 size-4" strokeWidth={2.5} />
            Import PGN
          </Button>
          <Button asChild>
            <Link href={`${basePath}/new`}>
              <Plus className="mr-2 size-4" />
              New puzzle
            </Link>
          </Button>
        </div>
      </div>

      {role === "admin" && stats.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            ["Total", stats.data.total],
            ["Published", stats.data.published],
            ["Drafts", stats.data.draft],
            ["Archived", stats.data.archived],
            ["Global", stats.data.global],
            ["Coach", stats.data.private],
            ["Topics", stats.data.topics],
            ["Lichess copies", stats.data.trainingCache]
          ].map(([label, value]) => (
            <Card key={label as string} className="p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
                {label}
              </p>
              <p className="mt-1 text-xl font-extrabold text-app-text">{value}</p>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue={tabs[0].key}>
        <TabsList className="flex-wrap justify-self-end">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
          <TabsTrigger value="catalog">Lichess catalogue</TabsTrigger>
          <TabsTrigger value="topics">Topics</TabsTrigger>
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <PuzzleTable basePath={basePath} cfg={t.cfg} />
          </TabsContent>
        ))}
        <TabsContent value="catalog">
          <CatalogBrowser role={role} />
        </TabsContent>
        <TabsContent value="topics">
          <TopicManager canManage={role === "admin"} />
        </TabsContent>
      </Tabs>
      <PuzzleImportDialog open={importOpen} onOpenChange={setImportOpen} role={role} />
    </div>
  );
}

type PuzzleSortKey = "title" | "puzzleType" | "difficulty" | "status";

function PuzzleTable({ basePath, cfg }: { basePath: string; cfg: ScopeConfig }) {
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

  const puzzles = data?.puzzles ?? [];
  const pagination = data?.pagination;
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
        <Input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          placeholder="Search puzzles…"
          className="w-full sm:w-56"
        />
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
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : puzzles.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={hasFilters ? "No puzzles match your filters" : "No puzzles yet"}
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
                <TableHead><SortButton label="Puzzle" {...sortProps("title")} /></TableHead>
                <TableHead>Topic</TableHead>
                <TableHead><SortButton label="Type" {...sortProps("puzzleType")} /></TableHead>
                <TableHead><SortButton label="Difficulty" {...sortProps("difficulty")} /></TableHead>
                <TableHead>Creator</TableHead>
                <TableHead><SortButton label="Status" {...sortProps("status")} /></TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {puzzles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-app-text">
                    <Link href={`${basePath}/${p.id}`} className="hover:text-primary-ink">
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
                        <Badge variant="default">Admin Library</Badge>
                      ) : (
                        <span className="text-app-muted">{p.createdByName}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(p.status)}>{p.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1.5">
                      <SimpleTooltip label="Preview">
                        <Button
                          asChild
                          aria-label="Preview puzzle"
                          variant="outline"
                          size="icon"
                          className={iconBtn}
                        >
                          <Link href={`${basePath}/${p.id}`}>
                            <Eye className="size-4" strokeWidth={2.5} />
                          </Link>
                        </Button>
                      </SimpleTooltip>
                      <SimpleTooltip label="Duplicate">
                        <Button
                          aria-label="Duplicate puzzle"
                          variant="outline"
                          size="icon"
                          className={iconBtn}
                          onClick={() => runDuplicate(p)}
                        >
                          <Copy className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                      {p.canManage && (
                        <>
                          <SimpleTooltip label="Edit">
                            <Button
                              asChild
                              aria-label="Edit puzzle"
                              variant="outline"
                              size="icon"
                              className={iconBtn}
                            >
                              <Link href={`${basePath}/${p.id}/edit`}>
                                <Pencil className="size-4" strokeWidth={2.5} />
                              </Link>
                            </Button>
                          </SimpleTooltip>
                          <SimpleTooltip
                            label={p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
                          >
                            <Button
                              aria-label={
                                p.status === "PUBLISHED" ? "Unpublish puzzle" : "Publish puzzle"
                              }
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-full border border-secondary bg-secondary p-0 text-black shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:text-black"
                              onClick={() =>
                                runPublish({ id: p.id, next: p.status !== "PUBLISHED" })
                              }
                            >
                              {p.status === "PUBLISHED" ? (
                                <Undo2 className="size-4" strokeWidth={2.5} />
                              ) : (
                                <Send className="size-4" strokeWidth={2.5} />
                              )}
                            </Button>
                          </SimpleTooltip>
                          <SimpleTooltip
                            label={p.status === "ARCHIVED" ? "Restore" : "Archive"}
                          >
                            <Button
                              aria-label={
                                p.status === "ARCHIVED" ? "Restore puzzle" : "Archive puzzle"
                              }
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-full border border-secondary bg-secondary p-0 text-black shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-secondary)_75%,white)] hover:text-black"
                              onClick={() =>
                                runArchive({ id: p.id, next: p.status !== "ARCHIVED" })
                              }
                            >
                              {p.status === "ARCHIVED" ? (
                                <ArchiveRestore className="size-4" strokeWidth={2.5} />
                              ) : (
                                <Archive className="size-4" strokeWidth={2.5} />
                              )}
                            </Button>
                          </SimpleTooltip>
                          <SimpleTooltip label="Delete">
                            <Button
                              aria-label="Delete puzzle"
                              variant="ghost"
                              size="icon"
                              className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                              onClick={() => runDelete(p)}
                            >
                              <Trash2 className="size-4" strokeWidth={2.5} />
                            </Button>
                          </SimpleTooltip>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-app-muted">
          <span>
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} puzzles
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
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
