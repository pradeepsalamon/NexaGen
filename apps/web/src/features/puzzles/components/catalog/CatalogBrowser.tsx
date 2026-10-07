"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CATALOG_MAX_THEMES,
  LICHESS_THEMES,
  isSystemPuzzleFolder,
  lichessThemeLabel,
  type CatalogAdoptResponse,
  type CatalogPuzzleSummary,
  type CatalogThemeMode,
  type SolutionMove
} from "@nexa-chess/types";
import { Eye, FolderPlus, GraduationCap, Library, Loader2, Shuffle, X } from "lucide-react";
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

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

const newSeed = () => Math.floor(Math.random() * 0x7fffffff);

type Homework = { title: string; fen: string; solutionMoves: SolutionMove[] };

interface Props {
  role: "admin" | "coach";
  /** `compact` is the in-class share dialog: smaller grid, a Share button per puzzle. */
  variant?: "library" | "compact";
  onShare?: (puzzle: CatalogPuzzleSummary) => void;
  sharing?: boolean;
}

/**
 * The Lichess catalogue (spec §11): filter by rating / themes / opening, page
 * with "Load more" (there are no totals), preview with the solution, and —
 * by variant — adopt into a folder (admin), create homework, or share in class.
 */
export function CatalogBrowser({ role, variant = "library", onShare, sharing = false }: Props) {
  const compact = variant === "compact";
  const isAdmin = role === "admin";
  const toast = useToast();
  const queryClient = useQueryClient();

  const [ratingMinInput, setRatingMinInput] = useState("1000");
  const [ratingMaxInput, setRatingMaxInput] = useState("1500");
  const [themes, setThemes] = useState<string[]>([]);
  const [themeMode, setThemeMode] = useState<CatalogThemeMode>("any");
  const [openingInput, setOpeningInput] = useState("");
  const [includeBelowGate, setIncludeBelowGate] = useState(false);
  const [seed, setSeed] = useState(newSeed);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetFolder, setTargetFolder] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [homework, setHomework] = useState<Homework | null>(null);
  const [homeworkLoading, setHomeworkLoading] = useState<string | null>(null);

  const ratingMin = useDebouncedValue(ratingMinInput, 400);
  const ratingMax = useDebouncedValue(ratingMaxInput, 400);
  const opening = useDebouncedValue(openingInput.trim().replace(/\s+/g, "_"), 400);
  const parsedMin = ratingMin ? Number(ratingMin) : undefined;
  const parsedMax = ratingMax ? Number(ratingMax) : undefined;
  const windowInvalid = parsedMin !== undefined && parsedMax !== undefined && parsedMin > parsedMax;

  const query = useMemo(
    () => ({
      ratingMin: parsedMin,
      ratingMax: parsedMax,
      themes: themes.length ? themes : undefined,
      themeMode: themes.length > 1 ? themeMode : undefined,
      opening: opening || undefined,
      includeBelowGate: isAdmin && includeBelowGate ? true : undefined,
      seed,
      pageSize: compact ? 12 : 24
    }),
    [parsedMin, parsedMax, themes, themeMode, opening, isAdmin, includeBelowGate, seed, compact]
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

  const hasFilters = themes.length > 0 || !!openingInput || includeBelowGate;
  const canSelect = isAdmin && !compact;

  const addTheme = (key: string) => {
    if (!key || themes.includes(key) || themes.length >= CATALOG_MAX_THEMES) return;
    setThemes([...themes, key]);
  };
  const toggleSelected = (sourceId: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(sourceId);
      else next.delete(sourceId);
      return next;
    });

  const runAdopt = () => {
    if (!targetFolder || selected.size === 0) return;
    adopt.mutate(
      { sourceIds: [...selected], topicId: targetFolder },
      {
        onSuccess: (res) => {
          setSelected(new Set());
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

  const clearFilters = () => {
    setThemes([]);
    setOpeningInput("");
    setIncludeBelowGate(false);
  };

  return (
    <Card className={compact ? "grid gap-3 border-0 p-0 shadow-none" : "grid gap-4 p-4"}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1.5">
          <Input
            aria-label="Minimum rating"
            className="w-24"
            inputMode="numeric"
            max={4000}
            min={0}
            onChange={(e) => setRatingMinInput(e.target.value)}
            placeholder="Min"
            type="number"
            value={ratingMinInput}
          />
          <span className="text-app-muted">–</span>
          <Input
            aria-label="Maximum rating"
            className="w-24"
            inputMode="numeric"
            max={4000}
            min={0}
            onChange={(e) => setRatingMaxInput(e.target.value)}
            placeholder="Max"
            type="number"
            value={ratingMaxInput}
          />
        </div>
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
          <Button aria-label="Shuffle" variant="outline" size="icon" className={iconBtn} onClick={() => setSeed(newSeed())}>
            <Shuffle className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
        {hasFilters ? (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear
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

      {canSelect && selected.size > 0 ? (
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
          <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {windowInvalid ? (
        <Alert variant="warning">The minimum rating is above the maximum.</Alert>
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
          action={hasFilters ? { label: "Clear filters", onClick: clearFilters } : undefined}
        />
      ) : (
        <div className={gridClass(compact)}>
          {puzzles.map((puzzle) => (
            <div
              key={puzzle.sourceId}
              className={`flex flex-col gap-2 rounded-control border bg-app-surface p-2 ${
                selected.has(puzzle.sourceId) ? "border-primary" : "border-app-border"
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
                    onCheckedChange={(v) => toggleSelected(puzzle.sourceId, v === true)}
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
                  <Button size="sm" disabled={sharing} onClick={() => onShare?.(puzzle)}>
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
