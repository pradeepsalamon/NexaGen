"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Folder, Trophy } from "lucide-react";
import {
  buildPuzzleTopicTree,
  isLichessFolder,
  flattenPuzzleTopicTree,
  puzzleTopicPath,
  resolvePuzzleLeaderboard,
  resolvePuzzleScoring,
  type CatalogPuzzleSummary,
  type PuzzleDifficulty,
  type PuzzleLeaderboardOptions,
  type PuzzleLeaderboardOverride,
  type PuzzleScoring,
  type PuzzleScoringOverride
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { CatalogBrowser } from "@/features/puzzles/components/catalog/CatalogBrowser";
import {
  useMaterialiseCatalogPuzzle,
  usePuzzleScoringSettings,
  usePuzzleTopics,
  usePuzzles
} from "@/features/puzzles/hooks/usePuzzlesApi";
import {
  PuzzleLeaderboardFields,
  PuzzleScoringFields,
  PuzzleScoringPreview
} from "@/features/puzzles/components/scoring/PuzzleScoringFields";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useToast } from "@/providers/ToastProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useAssignLivePuzzle } from "../../hooks/useLivePuzzle";
import { loadPuzzleCursor, savePuzzleCursor } from "../../lib/puzzleCursor";
import { loadLastShareOptions, saveLastShareOptions } from "../../lib/puzzleShareOptions";

// Mirrors the API's bounds on `durationSeconds` (live-class-puzzle.ts).
const TIMER_MIN_SECONDS = 30;
const TIMER_MAX_SECONDS = 3600;
const TIMER_PRESETS = [
  { value: "60", label: "1 min" },
  { value: "120", label: "2 min" },
  { value: "300", label: "5 min" },
  { value: "600", label: "10 min" },
  { value: "900", label: "15 min" }
];

export function PuzzleAssignModal({
  classId,
  open,
  onOpenChange
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty | "">("");
  const [durationSeconds, setDurationSeconds] = useState("");
  const [customTimer, setCustomTimer] = useState(false);
  const [scoringOverride, setScoringOverride] = useState<PuzzleScoringOverride>({});
  const [leaderboardOverride, setLeaderboardOverride] = useState<PuzzleLeaderboardOverride>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [source, setSource] = useState<"library" | "catalog">("library");
  const role = useAuthStore((state) => state.user?.role);
  const toast = useToast();
  const [folderId, setFolderIdState] = useState<string | null>(null);
  const setFolderId = (id: string | null) => {
    setFolderIdState(id);
    savePuzzleCursor({ folderId: id });
  };
  const defaults = usePuzzleScoringSettings(open);

  useEffect(() => {
    if (!open) return;
    const last = loadLastShareOptions();
    setDurationSeconds(last.durationSeconds);
    setCustomTimer(
      !!last.durationSeconds && !TIMER_PRESETS.some((p) => p.value === last.durationSeconds)
    );
    setScoringOverride(last.scoring);
    setLeaderboardOverride(last.leaderboard);
  }, [open]);

  // What the fields show: admin default + the coach's changes. A puzzle's own
  // override is applied server-side for any field the coach left alone.
  const shownScoring = useMemo(
    () => resolvePuzzleScoring(defaults.data?.settings.scoring, scoringOverride),
    [defaults.data, scoringOverride]
  );
  const shownLeaderboard = useMemo(
    () => resolvePuzzleLeaderboard(defaults.data?.settings.leaderboard, leaderboardOverride),
    [defaults.data, leaderboardOverride]
  );
  const customized =
    Object.keys(scoringOverride).length + Object.keys(leaderboardOverride).length > 0;
  const debouncedSearch = useDebouncedValue(search, 300);
  // Topics are the folders; a search looks across the open folder and all its subfolders.
  const searching = Boolean(debouncedSearch);
  const topics = usePuzzleTopics(open);
  // The hidden "Lichess" folder is the catalogue's cache; the Catalogue tab is the way in.
  const allTopics = useMemo(
    () => (topics.data?.topics ?? []).filter((t) => !isLichessFolder(t)),
    [topics.data]
  );
  const tree = useMemo(() => buildPuzzleTopicTree(allTopics), [allTopics]);
  const subfolders = useMemo(
    () =>
      folderId
        ? (flattenPuzzleTopicTree(tree).find((n) => n.topic.id === folderId)?.children ?? [])
        : tree,
    [tree, folderId]
  );
  const folderPath = useMemo(
    () => (folderId ? puzzleTopicPath(allTopics, folderId) : []),
    [allTopics, folderId]
  );
  const browsingRoot = !folderId && !searching;

  // Reopen where the coach left off, unless that folder has since gone away.
  useEffect(() => {
    if (!open || !topics.data) return;
    const last = loadPuzzleCursor().folderId;
    setFolderIdState(last && allTopics.some((t) => t.id === last) ? last : null);
  }, [open, topics.data, allTopics]);

  const puzzles = usePuzzles({
    status: "PUBLISHED",
    scope: "all",
    search: debouncedSearch || undefined,
    difficulty: difficulty || undefined,
    topicId: folderId ?? undefined,
    topicScope: searching ? "subtree" : "direct",
    pageSize: folderId ? 100 : 25,
    // Always ascending in class, so it matches the order Ask / Load next step through.
    sort: "title",
    order: "asc"
  });

  const assign = useAssignLivePuzzle(classId);
  const materialise = useMaterialiseCatalogPuzzle();

  const customMinutes = durationSeconds ? Math.floor(Number(durationSeconds) / 60) : 0;
  const customSeconds = durationSeconds ? Number(durationSeconds) % 60 : 0;
  const setCustomParts = (minutes: number, seconds: number) => {
    const total = Math.max(0, minutes) * 60 + Math.max(0, Math.min(59, seconds));
    setDurationSeconds(total > 0 ? String(total) : "");
  };
  const timerInvalid =
    !!durationSeconds &&
    (Number(durationSeconds) < TIMER_MIN_SECONDS || Number(durationSeconds) > TIMER_MAX_SECONDS);

  /** `topicId` moves the Ask / Load next cursor; a catalogue share leaves it where it was. */
  const handleAssign = (puzzleId: string, topicId: string | null) => {
    if (timerInvalid) return;
    assign.mutate(
      {
        puzzleId,
        durationSeconds: durationSeconds ? Number(durationSeconds) : null,
        leaderboard: leaderboardOverride,
        scoring: scoringOverride
      },
      {
        onSuccess: () => {
          saveLastShareOptions({ durationSeconds, leaderboard: leaderboardOverride, scoring: scoringOverride });
          if (topicId) savePuzzleCursor({ folderId: topicId, puzzleId });
          onOpenChange(false);
        }
      }
    );
  };

  // A catalogue puzzle becomes a library copy (hidden folder) first, then it's an ordinary share.
  const shareFromCatalog = async (puzzle: CatalogPuzzleSummary) => {
    if (timerInvalid) return;
    try {
      const { puzzleId } = await materialise.mutateAsync(puzzle.sourceId);
      handleAssign(puzzleId, null);
    } catch (error) {
      toast.error({ title: "Could not share this puzzle", message: (error as Error).message });
    }
  };

  const rows = puzzles.data?.puzzles ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share a puzzle</DialogTitle>
        </DialogHeader>

        <Tabs value={source} onValueChange={(v) => setSource(v as "library" | "catalog")}>
          <TabsList className="justify-self-end">
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="catalog">Lichess catalogue</TabsTrigger>
          </TabsList>
        </Tabs>

        {source === "library" ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Search puzzles…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as PuzzleDifficulty | "")}
              placeholder="Any difficulty"
              options={PUZZLE_DIFFICULTY_OPTIONS}
              className="sm:w-44"
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-app-text">
            <span className="text-app-muted">Timer</span>
            <Select
              value={customTimer ? "custom" : durationSeconds}
              onChange={(e) => {
                if (e.target.value === "custom") {
                  setCustomTimer(true);
                  if (!durationSeconds) setDurationSeconds("180");
                } else {
                  setCustomTimer(false);
                  setDurationSeconds(e.target.value);
                }
              }}
              placeholder="No timer"
              options={[...TIMER_PRESETS, { value: "custom", label: "Custom…" }]}
              className="w-32"
            />
          </label>
          {customTimer ? (
            <div className="flex items-center gap-1.5 text-sm text-app-text">
              <Input
                aria-label="Timer minutes"
                className="w-16"
                inputMode="numeric"
                max={60}
                min={0}
                onChange={(e) => setCustomParts(Number(e.target.value) || 0, customSeconds)}
                type="number"
                value={customMinutes}
              />
              <span className="text-app-muted">min</span>
              <Input
                aria-label="Timer seconds"
                className="w-16"
                inputMode="numeric"
                max={59}
                min={0}
                onChange={(e) => setCustomParts(customMinutes, Number(e.target.value) || 0)}
                type="number"
                value={customSeconds}
              />
              <span className="text-app-muted">sec</span>
              {timerInvalid ? (
                <span className="text-xs font-semibold text-app-danger">
                  30 s – 60 min
                </span>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            aria-expanded={optionsOpen}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-ink"
          >
            <Trophy className="size-4" strokeWidth={2.5} />
            Points &amp; leaderboard
            {customized ? <Badge variant="secondary">Custom</Badge> : null}
            <ChevronDown
              className={`size-4 transition-transform ${optionsOpen ? "rotate-180" : ""}`}
              strokeWidth={2.5}
            />
          </button>
        </div>

        {optionsOpen ? (
          <div className="max-h-[40vh] space-y-4 overflow-y-auto rounded-app border border-app-border p-3">
            <PuzzleScoringFields
              idPrefix="share-scoring"
              value={shownScoring}
              onChange={(next: PuzzleScoring, key) =>
                setScoringOverride((prev) => ({ ...prev, [key]: next[key] }))
              }
            />
            <PuzzleScoringPreview scoring={shownScoring} />
            <PuzzleLeaderboardFields
              idPrefix="share-lb"
              value={shownLeaderboard}
              onChange={(next: PuzzleLeaderboardOptions, key) =>
                setLeaderboardOverride((prev) => ({ ...prev, [key]: next[key] }))
              }
            />
            <p className="text-xs text-app-muted">
              Fields you don&apos;t change use the puzzle&apos;s own points, else the platform
              default. You can still edit these while the puzzle is running.
            </p>
            {customized ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setScoringOverride({});
                  setLeaderboardOverride({});
                }}
              >
                Reset to defaults
              </Button>
            ) : null}
          </div>
        ) : null}

        {source === "catalog" ? (
          <div className={`${optionsOpen ? "max-h-[24vh]" : "max-h-[52vh]"} overflow-y-auto`}>
            <CatalogBrowser
              role={isStaffRole(role) ? "admin" : "coach"}
              variant="compact"
              onShare={(puzzle) => void shareFromCatalog(puzzle)}
              sharing={materialise.isPending || assign.isPending}
            />
          </div>
        ) : (
          <div className={`${optionsOpen ? "max-h-[24vh]" : "max-h-[46vh]"} space-y-2 overflow-y-auto`}>
            {folderId ? (
              <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => setFolderId(folderPath.at(-2)?.id ?? null)}
                  className="flex items-center gap-1 font-semibold text-primary-ink"
                >
                  <ChevronLeft className="size-4" strokeWidth={2.5} />
                  Back
                </button>
                <span className="text-app-muted">·</span>
                <button
                  type="button"
                  onClick={() => setFolderId(null)}
                  className="text-app-muted hover:text-app-text"
                >
                  All folders
                </button>
                {folderPath.map((crumb, i) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <span className="text-app-muted">/</span>
                    {i === folderPath.length - 1 ? (
                      <span className="font-semibold text-app-text">{crumb.name}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setFolderId(crumb.id)}
                        className="text-app-muted hover:text-app-text"
                      >
                        {crumb.name}
                      </button>
                    )}
                  </span>
                ))}
              </nav>
            ) : null}
            {!searching
              ? subfolders.map((node) => (
                  <button
                    key={node.topic.id}
                    type="button"
                    onClick={() => setFolderId(node.topic.id)}
                    className="flex w-full items-center gap-3 rounded-app border border-app-border bg-app-surface p-3 text-left transition-colors hover:border-primary/50 hover:bg-app-soft"
                  >
                    <Folder className="size-5 shrink-0 fill-amber-400/30 text-amber-500" strokeWidth={2} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-app-text">
                      {node.topic.name}
                    </span>
                    <span className="text-xs text-app-muted">
                      {node.children.length ? `${node.children.length} folders · ` : ""}
                      {node.totalPuzzleCount} puzzles
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-app-muted" strokeWidth={2.5} />
                  </button>
                ))
              : null}
            {browsingRoot ? (
              topics.isLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : tree.length === 0 ? (
                <p className="py-8 text-center text-sm text-app-muted">No puzzle folders yet.</p>
              ) : null
            ) : puzzles.isLoading ? (
              <>
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </>
            ) : rows.length === 0 ? (
              subfolders.length > 0 && !searching ? null : (
                <p className="py-8 text-center text-sm text-app-muted">No published puzzles match.</p>
              )
            ) : (
              rows.map((puzzle) => (
                <div
                  key={puzzle.id}
                  className="flex items-center justify-between gap-3 rounded-app border border-app-border bg-app-surface p-3"
                >
                  <FileText className="size-5 shrink-0 text-primary-ink" strokeWidth={2} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-app-text">{puzzle.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {searching ? <Badge variant="secondary">{puzzle.topicName}</Badge> : null}
                      <Badge variant="outline">{PUZZLE_TYPE_LABELS[puzzle.puzzleType]}</Badge>
                      <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
                        {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
                      </Badge>
                      {puzzle.scoring?.basePoints !== undefined ? (
                        <Badge variant="outline">{puzzle.scoring.basePoints} pts</Badge>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleAssign(puzzle.id, puzzle.topicId)}
                    disabled={assign.isPending}
                  >
                    Share
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
