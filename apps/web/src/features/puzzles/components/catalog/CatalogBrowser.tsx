"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CATALOG_DEFAULT_RATING_MAX,
  CATALOG_DEFAULT_RATING_MIN,
  CATALOG_DEFAULT_SORT,
  CATALOG_MAX_THEMES,
  CATALOG_RATING_STEPS,
  LICHESS_THEMES,
  catalogRatingWindowError,
  isSystemPuzzleFolder,
  lichessThemeLabel,
  sortCatalogByRating,
  type CatalogAdoptResponse,
  type CatalogPuzzleSummary,
  type CatalogSort,
  type CatalogThemeMode,
  type SolutionMove
} from "@nexa-chess/types";
import { Eye, FolderPlus, GraduationCap, Library, ListPlus, Loader2, Shuffle, X } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { AssignmentFormDialog } from "@/features/assignments/components/AssignmentFormDialog";
import { useCoachBatches } from "@/features/coach/hooks/useCoachApi";
import { PuzzleBoardTile } from "@/features/live-class/components/meeting/PuzzleBoardTile";
import { getCatalogPreview } from "../../api/puzzleApi";
import { useAdoptCatalogPuzzles, useCatalogPuzzles, usePuzzleTopics } from "../../hooks/usePuzzlesApi";
import { puzzleTopicOptions } from "../../lib/puzzleMeta";
import { CatalogPreviewDialog } from "./CatalogPreviewDialog";

const GROUP_ORDER = ["motif", "mate", "phase", "goal", "length", "origin", "special"] as const;
const THEME_OPTIONS = [...LICHESS_THEMES]
  .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
  .map((t) => ({ value: t.key, label: t.label }));

/** "1,000" — rating labels with a thousands separator. */
const ratingLabel = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const RATING_OPTIONS = CATALOG_RATING_STEPS.map((n) => ({ value: String(n), label: ratingLabel(n) }));
const SORT_OPTIONS: { value: CatalogSort; label: string }[] = [
  { value: "rating_asc", label: "Rating: low to high" },
  { value: "rating_desc", label: "Rating: high to low" },
  { value: "shuffle", label: "Shuffled" }
];
const DEFAULT_MIN = String(CATALOG_DEFAULT_RATING_MIN);
const DEFAULT_MAX = String(CATALOG_DEFAULT_RATING_MAX);

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

const newSeed = () => Math.floor(Math.random() * 0x7fffffff);

type Homework = { title: string; fen: string; solutionMoves: SolutionMove[] };

interface Props {
  role: "admin" | "coach";
  /** `compact` is the in-class share dialog: smaller grid, a Share button per puzzle. */
  variant?: "library" | "compact";
  onShare?: (puzzle: CatalogPuzzleSummary) => void;
  /** A share is in flight: every Share button is disabled. */
  sharing?: boolean;
  /** The puzzle whose share is in flight (its button spins). */
  sharingId?: string | null;
  /**
   * Compact only: enables multi-select with "Add selected to queue". Receives
   * the selection lowest rating first; resolve true to clear the selection.
   */
  onAddToQueue?: (puzzles: CatalogPuzzleSummary[]) => Promise<boolean>;
  addingToQueue?: boolean;
  /** Most puzzles one add may take (the queue's capacity). */
  queueLimit?: number;
  /** Rendered in the selection bar before the Add button — e.g. the target-queue picker. */
  queueControls?: ReactNode;
}

/**
 * The Lichess catalogue (spec §11): filter by rating / themes / opening, page
 * with "Load more" (there are no totals), preview with the solution, and —
 * by variant — adopt into a folder (admin), create homework, or share in class.
 */
export function CatalogBrowser({
  role,
  variant = "library",
  onShare,
  sharing = false,
  sharingId = null,
  onAddToQueue,
  addingToQueue = false,
  queueLimit,
  queueControls
}: Props) {
  const compact = variant === "compact";
  const isAdmin = role === "admin";
  const toast = useToast();
  const queryClient = useQueryClient();

  // Rating bounds are dropdown values ("" = no bound), so no debounce: one pick, one request.
  const [ratingMin, setRatingMin] = useState(DEFAULT_MIN);
  const [ratingMax, setRatingMax] = useState(DEFAULT_MAX);
  // Not persisted: every opening starts low → high.
  const [sort, setSort] = useState<CatalogSort>(CATALOG_DEFAULT_SORT);
  const [themes, setThemes] = useState<string[]>([]);
  const [themeMode, setThemeMode] = useState<CatalogThemeMode>("any");
  const [openingInput, setOpeningInput] = useState("");
  const [includeBelowGate, setIncludeBelowGate] = useState(false);
  const [seed, setSeed] = useState(newSeed);
  // Kept by id across sorting, paging and filter changes until cleared or added.
  const [selected, setSelected] = useState<Map<string, CatalogPuzzleSummary>>(() => new Map());
  const [targetFolder, setTargetFolder] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [homework, setHomework] = useState<Homework | null>(null);
  const [homeworkLoading, setHomeworkLoading] = useState<string | null>(null);

  const opening = useDebouncedValue(openingInput.trim().replace(/\s+/g, "_"), 400);
  const parsedMin = ratingMin ? Number(ratingMin) : undefined;
  const parsedMax = ratingMax ? Number(ratingMax) : undefined;
  const windowError = catalogRatingWindowError(parsedMin, parsedMax);
  const windowInvalid = windowError !== null;

  const query = useMemo(
    () => ({
      ratingMin: parsedMin,
      ratingMax: parsedMax,
      themes: themes.length ? themes : undefined,
      themeMode: themes.length > 1 ? themeMode : undefined,
      opening: opening || undefined,
      includeBelowGate: isAdmin && includeBelowGate ? true : undefined,
      sort,
      // Only the shuffled order uses a seed; leaving it out keeps a sorted query's cache key stable.
      seed: sort === "shuffle" ? seed : undefined,
      pageSize: compact ? 12 : 24
    }),
    [parsedMin, parsedMax, themes, themeMode, opening, isAdmin, includeBelowGate, sort, seed, compact]
  );
  const catalog = useCatalogPuzzles(query, !windowInvalid);
  const puzzles = useMemo(() => catalog.data?.pages.flatMap((p) => p.puzzles) ?? [], [catalog.data]);
  const timedOut = catalog.data?.pages.some((p) => p.timedOut) ?? false;

  const topics = usePuzzleTopics(isAdmin && !compact);
  const folderOptions = useMemo(
    () => puzzleTopicOptions((topics.data?.topics ?? []).filter((t) => !isSystemPuzzleFolder(t))),
    [topics.data]
  );
  const adopt = useAdoptCatalogPuzzles();
  const coachBatches = useCoachBatches({ enabled: role === "coach" && !compact });

  const hasFilters =
    themes.length > 0 ||
    !!openingInput ||
    includeBelowGate ||
    ratingMin !== DEFAULT_MIN ||
    ratingMax !== DEFAULT_MAX ||
    sort !== CATALOG_DEFAULT_SORT;
  const queueMode = compact && !!onAddToQueue;
  const canSelect = (isAdmin && !compact) || queueMode;
  const visibleIds = useMemo(() => new Set(puzzles.map((p) => p.sourceId)), [puzzles]);
  const hiddenSelected = [...selected.keys()].filter((id) => !visibleIds.has(id)).length;
  const allVisibleSelected = puzzles.length > 0 && puzzles.every((p) => selected.has(p.sourceId));
  const overLimit = queueLimit !== undefined && selected.size > queueLimit;

  const addTheme = (key: string) => {
    if (!key || themes.includes(key) || themes.length >= CATALOG_MAX_THEMES) return;
    setThemes([...themes, key]);
  };
  const toggleSelected = (puzzle: CatalogPuzzleSummary, on: boolean) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (on) next.set(puzzle.sourceId, puzzle);
      else next.delete(puzzle.sourceId);
      return next;
    });
  /** Exactly the cards on screen (every page loaded so far) — never the rest of the catalogue. */
  const selectAllVisible = () =>
    setSelected((prev) => {
      const next = new Map(prev);
      for (const p of puzzles) next.set(p.sourceId, p);
      return next;
    });

  const runAddToQueue = async () => {
    if (!onAddToQueue || selected.size === 0 || overLimit || addingToQueue) return;
    // The API orders by rating too; this is the order the coach is told about.
    if (await onAddToQueue(sortCatalogByRating([...selected.values()]))) setSelected(new Map());
  };

  const runAdopt = () => {
    if (!targetFolder || selected.size === 0) return;
    adopt.mutate(
      { sourceIds: [...selected.keys()], topicId: targetFolder },
      {
        onSuccess: (res) => {
          setSelected(new Map());
          reportAdopt(res, toast);
        },
        onError: (error) => toast.error({ title: "Could not add puzzles", message: (error as Error).message })
      }
    );
  };

  // The browse rows carry no solution; homework fetches it on click (§11).
  const openHomework = async (puzzle: CatalogPuzzleSummary) => {
    setHomeworkLoading(puzzle.sourceId);
    try {
      const { puzzle: full } = await queryClient.fetchQuery({
        queryKey: queryKeys.puzzles.catalogPreview(puzzle.sourceId),
        queryFn: () => getCatalogPreview(puzzle.sourceId)
      });
      setHomework({
        title: `${primaryLabel(full.themes)} · ${full.rating}`,
        fen: full.postSetupFen,
        solutionMoves: full.solutionMoves
      });
    } catch (error) {
      toast.error({ title: "Could not load the puzzle", message: (error as Error).message });
    } finally {
      setHomeworkLoading(null);
    }
  };

  /** Back to the defaults: 1,000–1,500, any theme, low to high. The selection is kept. */
  const clearFilters = () => {
    setRatingMin(DEFAULT_MIN);
    setRatingMax(DEFAULT_MAX);
    setSort(CATALOG_DEFAULT_SORT);
    setThemes([]);
    setOpeningInput("");
    setIncludeBelowGate(false);
  };

  return (
    <Card className={compact ? "grid gap-3 border-0 p-0 shadow-none" : "grid gap-4 p-4"}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1.5">
          <Select
            aria-label="Minimum rating"
            className="w-28"
            hasError={windowInvalid}
            onChange={(e) => setRatingMin(e.target.value)}
            options={RATING_OPTIONS}
            placeholder="Min: any"
            value={ratingMin}
          />
          <span className="text-app-muted">–</span>
          <Select
            aria-label="Maximum rating"
            className="w-28"
            hasError={windowInvalid}
            onChange={(e) => setRatingMax(e.target.value)}
            options={RATING_OPTIONS}
            placeholder="Max: any"
            value={ratingMax}
          />
        </div>
        <Select
          aria-label="Sort"
          className="w-auto"
          onChange={(e) => setSort(e.target.value as CatalogSort)}
          options={SORT_OPTIONS}
          value={sort}
        />
        <Select
          aria-label="Add a theme"
          className="w-auto max-w-52"
          onChange={(e) => addTheme(e.target.value)}
          options={THEME_OPTIONS.filter((o) => !themes.includes(o.value))}
          placeholder={themes.length ? "Add a theme" : "Any theme"}
          value=""
        />
        {!compact ? (
          <Input
            aria-label="Opening"
            className="w-full sm:w-48"
            onChange={(e) => setOpeningInput(e.target.value)}
            placeholder="Opening, e.g. Sicilian Defense"
            value={openingInput}
          />
        ) : null}
        {canSelect ? (
          <label className="flex items-center gap-2 text-sm text-app-text">
            <Checkbox
              checked={includeBelowGate}
              onCheckedChange={(v) => setIncludeBelowGate(v === true)}
            />
            Low-confidence too
          </label>
        ) : null}
        <SimpleTooltip label="Shuffle">
          <Button
            aria-label="Shuffle"
            variant="outline"
            size="icon"
            className={iconBtn}
            onClick={() => {
              setSort("shuffle");
              setSeed(newSeed());
            }}
          >
            <Shuffle className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
        {hasFilters ? (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Reset filters
          </Button>
        ) : null}
      </div>

      {themes.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {themes.length > 1 ? (
            <Select
              aria-label="Theme match"
              className="w-auto"
              onChange={(e) => setThemeMode(e.target.value as CatalogThemeMode)}
              options={[
                { value: "any", label: "Any of" },
                { value: "all", label: "All of" }
              ]}
              value={themeMode}
            />
          ) : null}
          {themes.map((key) => (
            <Badge key={key} variant="default" className="gap-1 pr-1">
              {lichessThemeLabel(key)}
              <button
                type="button"
                aria-label={`Remove ${lichessThemeLabel(key)}`}
                className="rounded-full p-0.5 transition-colors hover:bg-primary/20"
                onClick={() => setThemes(themes.filter((t) => t !== key))}
              >
                <X className="size-3" strokeWidth={2.5} />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {queueMode && (selected.size > 0 || puzzles.length > 0) ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-control border border-primary/30 bg-primary/5 p-2">
          <span className="mr-auto text-sm font-semibold text-app-text" aria-live="polite">
            {selected.size} selected
            {hiddenSelected > 0 ? (
              <span className="font-normal text-app-muted"> · {hiddenSelected} not shown by these filters</span>
            ) : null}
          </span>
          <Button variant="outline" size="sm" onClick={selectAllVisible} disabled={allVisibleSelected}>
            Select all visible
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Map())} disabled={selected.size === 0}>
            Clear selection
          </Button>
          {queueControls}
          <Button size="sm" onClick={() => void runAddToQueue()} disabled={selected.size === 0 || overLimit || addingToQueue}>
            {addingToQueue ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <ListPlus className="mr-1.5 size-4" strokeWidth={2.5} />
            )}
            Add selected to queue
          </Button>
          {overLimit ? (
            <p className="w-full text-right text-xs font-semibold text-app-danger-ink">
              A queue holds at most {queueLimit} activities — clear some of the selection.
            </p>
          ) : null}
        </div>
      ) : null}

      {canSelect && !queueMode && selected.size > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-control border border-primary/30 bg-primary/5 p-2">
          <span className="mr-auto text-sm font-semibold text-app-text">{selected.size} selected</span>
          <Select
            aria-label="Folder to add to"
            className="w-auto max-w-56"
            onChange={(e) => setTargetFolder(e.target.value)}
            options={folderOptions}
            placeholder="Choose a folder"
            value={targetFolder}
          />
          <Button size="sm" onClick={runAdopt} disabled={!targetFolder || adopt.isPending}>
            {adopt.isPending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <FolderPlus className="mr-1.5 size-4" strokeWidth={2.5} />
            )}
            Add to folder
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelected(new Map())}>
            Clear
          </Button>
        </div>
      ) : null}

      {windowInvalid ? (
        <Alert variant="warning">{windowError} Pick a lower minimum or a higher maximum.</Alert>
      ) : timedOut ? (
        <Alert variant="warning">That search took too long — narrow the rating range or the themes.</Alert>
      ) : null}

      {catalog.isLoading ? (
        <div className={gridClass(compact)}>
          {Array.from({ length: compact ? 6 : 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
      ) : catalog.error ? (
        <Alert variant="error">{(catalog.error as Error).message}</Alert>
      ) : puzzles.length === 0 && !windowInvalid && !timedOut ? (
        <EmptyState
          icon={Library}
          title="No catalogue puzzles match"
          description="Widen the rating range or remove a theme. If nothing ever appears, the catalogue hasn't been loaded on this server yet."
          action={hasFilters ? { label: "Reset filters", onClick: clearFilters } : undefined}
        />
      ) : (
        <div className={gridClass(compact)}>
          {puzzles.map((puzzle) => (
            <div
              key={puzzle.sourceId}
              className={`flex flex-col gap-2 rounded-control border bg-app-surface p-2 ${
                selected.has(puzzle.sourceId) ? "border-primary ring-1 ring-primary" : "border-app-border"
              }`}
            >
              <button
                type="button"
                aria-label={`Preview Lichess puzzle ${puzzle.sourceId}`}
                className="block w-full"
                onClick={() => setPreviewId(puzzle.sourceId)}
              >
                <PuzzleBoardTile
                  fen={puzzle.postSetupFen}
                  orientation={puzzle.sideToMove}
                  lastMove={puzzle.setupMove.uci}
                />
              </button>
              <div className="flex items-center gap-1.5">
                {canSelect ? (
                  <Checkbox
                    aria-label={`Select ${puzzle.sourceId}`}
                    checked={selected.has(puzzle.sourceId)}
                    onCheckedChange={(v) => toggleSelected(puzzle, v === true)}
                  />
                ) : null}
                <span className="text-sm font-bold text-app-text">{puzzle.rating}</span>
                <span className="truncate text-xs text-app-muted">
                  {puzzle.sideToMove === "white" ? "White" : "Black"} to move
                </span>
              </div>
              <div className="flex min-h-6 flex-wrap gap-1">
                {motifThemes(puzzle.themes).map((key) => (
                  <Badge key={key} variant="secondary" className="text-[0.7rem]">
                    {lichessThemeLabel(key)}
                  </Badge>
                ))}
                {puzzle.inLibrary?.adopted ? (
                  <Badge variant="success" className="text-[0.7rem]">
                    In {puzzle.inLibrary.topicName}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-auto flex items-center justify-end gap-1.5">
                <SimpleTooltip label="Preview with solution">
                  <Button
                    aria-label="Preview with solution"
                    variant="outline"
                    size="icon"
                    className={iconBtn}
                    onClick={() => setPreviewId(puzzle.sourceId)}
                  >
                    <Eye className="size-4" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
                {compact ? (
                  <Button
                    size="sm"
                    disabled={sharing}
                    isLoading={sharingId === puzzle.sourceId}
                    onClick={() => onShare?.(puzzle)}
                  >
                    Share
                  </Button>
                ) : (
                  <SimpleTooltip label="Create homework">
                    <Button
                      aria-label="Create homework"
                      variant="outline"
                      size="icon"
                      className={iconBtn}
                      disabled={homeworkLoading === puzzle.sourceId}
                      onClick={() => void openHomework(puzzle)}
                    >
                      {homeworkLoading === puzzle.sourceId ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <GraduationCap className="size-4" strokeWidth={2.5} />
                      )}
                    </Button>
                  </SimpleTooltip>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {catalog.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => void catalog.fetchNextPage()}
            disabled={catalog.isFetchingNextPage}
          >
            {catalog.isFetchingNextPage ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Load more
          </Button>
        </div>
      ) : null}

      <CatalogPreviewDialog sourceId={previewId} onOpenChange={(open) => !open && setPreviewId(null)} />
      {!compact ? (
        <AssignmentFormDialog
          open={!!homework}
          onOpenChange={(open) => !open && setHomework(null)}
          mode="create"
          initialActivityType="SOLVE_LINE"
          initialFen={homework?.fen}
          initialSolutionMoves={homework?.solutionMoves}
          initialTitle={homework?.title}
          coachBatches={role === "coach" ? coachBatches.data?.batches ?? [] : undefined}
        />
      ) : null}
    </Card>
  );
}

function gridClass(compact: boolean): string {
  return compact
    ? "grid grid-cols-2 gap-2 sm:grid-cols-3"
    : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6";
}

/** Up to two tactical/mate themes — the length/goal tags say little on a card. */
function motifThemes(themes: string[]): string[] {
  return LICHESS_THEMES.filter((t) => (t.group === "motif" || t.group === "mate") && themes.includes(t.key))
    .slice(0, 2)
    .map((t) => t.key);
}

function primaryLabel(themes: string[]): string {
  const [first] = motifThemes(themes);
  return first ? lichessThemeLabel(first) : "Puzzle";
}

const OUTCOME_LABELS: Record<string, string> = {
  ALREADY_IN_FOLDER: "already in a folder",
  IN_TRASH: "in the Trash",
  NOT_PUBLISHED: "archived or a draft",
  NOT_FOUND: "no longer in the catalogue",
  INVALID: "not a valid puzzle"
};

function reportAdopt(res: CatalogAdoptResponse, toast: ReturnType<typeof useToast>) {
  const added = res.adopted + res.moved;
  const skipped = res.results.filter((r) => r.outcome !== "CREATED" && r.outcome !== "MOVED");
  const duplicates = res.results.filter((r) => r.duplicateOf);
  const notes = [
    ...Object.entries(
      skipped.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {})
    ).map(([outcome, n]) => `${n} ${OUTCOME_LABELS[outcome] ?? outcome}`),
    ...(duplicates.length
      ? [`${duplicates.length} already in the library as another puzzle (e.g. "${duplicates[0].duplicateOf?.title}")`]
      : [])
  ];
  const title = `Added ${added} puzzle${added === 1 ? "" : "s"}${skipped.length ? `, skipped ${skipped.length}` : ""}`;
  if (notes.length) toast.warning({ title, message: notes.join(" · ") });
  else toast.success({ title });
}
