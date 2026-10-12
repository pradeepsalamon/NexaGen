"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, CheckCircle2, Crown, Eye, Flame, Lightbulb, Puzzle, XCircle } from "lucide-react";
import {
  TRAINING_SLOT_LABELS,
  trainingThemeLabels,
  type PuzzleTrainingPick,
  type PuzzleTrainingRecentResult,
  type PuzzleTrainingStatusResponse
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { PRACTICE_BOARD_GRID, PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { hintSquaresFor, hintText } from "@/features/assignments/lib/solveLineHint";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { getPuzzleTrainingStatus, nextTrainingPuzzle, startPuzzleAttempt } from "../../api/puzzleApi";
import { usePuzzleAttempt } from "../../hooks/usePuzzleAttempt";

/** How long to keep asking for a finished puzzle's rating change (it is recorded just after the submit). */
const RATING_WAIT_MS = 10_000;

/**
 * Lichess-style rated training: one puzzle at a time near the student's own
 * puzzle rating, chosen server-side as a mix of weak spots, new themes, mixed
 * picks and second chances. Solving runs on the ordinary attempt routes.
 */
export function StudentTrainingClient() {
  const qc = useQueryClient();
  const [pick, setPick] = useState<PuzzleTrainingPick | null>(null);
  const [awaitingSince, setAwaitingSince] = useState<number | null>(null);

  const status = useQuery({
    queryKey: queryKeys.puzzles.training,
    queryFn: getPuzzleTrainingStatus,
    // After a finish, poll briefly until the rating change lands.
    refetchInterval: awaitingSince !== null ? 1_500 : false
  });

  const next = useMutation({
    mutationFn: () => nextTrainingPuzzle(),
    onSuccess: (res) => {
      setPick(res.pick);
      void qc.invalidateQueries({ queryKey: queryKeys.puzzles.training });
    }
  });
  const requestNext = next.mutate;

  // Resume an unfinished puzzle, else serve the first one.
  const data = status.data;
  useEffect(() => {
    if (pick || !data?.enabled || next.isPending || next.isError) return;
    if (data.current) setPick(data.current);
    else requestNext();
  }, [pick, data, next.isPending, next.isError, requestNext]);

  const finishedChange = pick ? data?.recent.find((r) => r.attemptId === pick.attemptId) : undefined;
  useEffect(() => {
    if (awaitingSince === null) return;
    if (finishedChange?.ratingChange != null || Date.now() - awaitingSince > RATING_WAIT_MS) setAwaitingSince(null);
  }, [awaitingSince, finishedChange, data]);

  const onFinished = useCallback(() => {
    setAwaitingSince(Date.now());
    void qc.invalidateQueries({ queryKey: queryKeys.puzzles.training });
    void qc.invalidateQueries({ queryKey: queryKeys.progress.mine });
  }, [qc]);

  if (status.isLoading) return <Skeleton className="h-[32rem] w-full" />;
  if (status.isError || !data) {
    return <WidgetError message="Could not load puzzle training." onRetry={() => void status.refetch()} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Puzzle Training</h1>
        <p className="mt-1 max-w-2xl text-sm text-app-muted">
          Puzzles picked for your rating: your weak spots, new ideas and a second look at ones you missed. Each
          first try changes your puzzle rating.
        </p>
      </div>

      <TrainingStats status={data} />

      {!data.enabled ? (
        <EmptyState
          icon={Puzzle}
          title="Puzzle training isn't on for your batch yet"
          description="Ask your coach to switch it on. Your assignments and course puzzles still count towards your rating."
        />
      ) : next.isError ? (
        <EmptyState
          icon={Puzzle}
          title="No puzzle right now"
          description={(next.error as Error).message}
          action={{ label: "Try again", onClick: () => next.reset() }}
        />
      ) : pick ? (
        <TrainingBoard
          key={pick.attemptId}
          pick={pick}
          ratingChange={finishedChange?.ratingChange ?? null}
          ratingPending={awaitingSince !== null}
          loadingNext={next.isPending}
          onFinished={onFinished}
          onNext={() => requestNext()}
        />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}

      {data.recent.length > 0 ? <RecentResults recent={data.recent} /> : null}
    </div>
  );
}

function TrainingStats({ status }: { status: PuzzleTrainingStatusResponse }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile icon={Crown} label="Puzzle rating" tone="primary" value={String(status.rating)} />
      <StatTile icon={Puzzle} label="Peak rating" tone="secondary" value={String(status.peakRating)} />
      <StatTile icon={CalendarCheck} label="Puzzles today" tone="accent" value={String(status.trainedToday)} />
      <StatTile
        icon={Flame}
        label="Day streak"
        tone="warm"
        value={`${status.currentStreak} ${status.currentStreak === 1 ? "day" : "days"}`}
      />
    </div>
  );
}

function formatChange(change: number) {
  return change > 0 ? `+${change}` : String(change);
}

function TrainingBoard({
  pick,
  ratingChange,
  ratingPending,
  loadingNext,
  onFinished,
  onNext
}: {
  pick: PuzzleTrainingPick;
  ratingChange: number | null;
  ratingPending: boolean;
  loadingNext: boolean;
  onFinished: () => void;
  onNext: () => void;
}) {
  const start = useCallback(() => startPuzzleAttempt(pick.puzzleId), [pick.puzzleId]);
  const {
    session,
    startError,
    moves,
    phase,
    wrong,
    resetNonce,
    result,
    currentFen,
    begin,
    handleMove,
    giveUp,
    pendingSubmit,
    retrySubmit,
    serverHint,
    requestHint
  } = usePuzzleAttempt({ start });

  // `begin` resumes this pick's attempt; once it is over, refresh the rating.
  const done = phase === "done";
  useEffect(() => {
    if (done) onFinished();
  }, [done, onFinished]);

  if (startError) return <WidgetError message={startError} onRetry={() => void begin()} />;
  if (!session || !currentFen) return <Skeleton className="h-96 w-full" />;

  const side = session.studentColor === "white" ? "White" : "Black";
  const themes = trainingThemeLabels(pick.themes);
  const last = moves[moves.length - 1];

  return (
    <Card className="p-4 sm:p-6">
      <div className={PRACTICE_BOARD_GRID}>
        <div>
          <PracticeBoard
            resetKey={`${moves.length}-${resetNonce}`}
            fen={currentFen}
            orientation={session.orientation}
            playerColor={session.studentColor}
            interactive={phase === "solving"}
            lastMove={last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null}
            hintSquares={phase === "solving" ? hintSquaresFor(serverHint) : null}
            onMove={handleMove}
          />
        </div>

        <div className="space-y-4" aria-live="polite">
          {phase === "solving" ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="text-4xl leading-none text-app-text">
                  {session.studentColor === "white" ? "♔" : "♚"}
                </span>
                <div>
                  <p className="text-lg font-extrabold leading-tight text-app-text">Your turn</p>
                  <p className="text-sm text-app-muted">Find the best move for {side}.</p>
                </div>
              </div>
              {pick.slot ? <Badge variant="secondary">{TRAINING_SLOT_LABELS[pick.slot]}</Badge> : null}
            </div>
          ) : null}

          {wrong ? (
            <Card className="flex items-center gap-2 border-app-danger/40 p-3 text-sm text-app-danger-ink">
              <XCircle className="size-4 shrink-0" strokeWidth={2.5} />
              Not the move — try again.
            </Card>
          ) : null}

          {result ? (
            <Card
              className={cn(
                "space-y-2 p-4",
                result.solved ? "border-accent/40 bg-accent/10" : "border-app-danger/30 bg-app-danger/5"
              )}
            >
              <p
                className={cn(
                  "flex items-center gap-2 text-lg font-extrabold",
                  result.solved ? "text-accent-ink" : "text-app-danger-ink"
                )}
              >
                {result.solved ? (
                  <CheckCircle2 className="size-5" strokeWidth={2.5} />
                ) : (
                  <XCircle className="size-5" strokeWidth={2.5} />
                )}
                {result.solved ? "Solved!" : "Puzzle missed"}
              </p>
              <p className="text-sm text-app-text">
                Puzzle rated <span className="font-bold">{pick.puzzleRating}</span>
                {ratingChange !== null ? (
                  <>
                    {" · "}your rating{" "}
                    <span
                      className={cn("font-bold", ratingChange >= 0 ? "text-accent-ink" : "text-app-danger-ink")}
                    >
                      {formatChange(ratingChange)}
                    </span>
                  </>
                ) : ratingPending ? (
                  <span className="text-app-muted"> · updating your rating…</span>
                ) : (
                  <span className="text-app-muted"> · not rated (you&apos;ve tried this one before)</span>
                )}
              </p>
              {themes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {themes.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Card>
          ) : null}

          {moves.length > 0 || (result && !result.solved) ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-app-muted">
                {result && !result.solved ? "Solution" : "Moves played"}
              </p>
              <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
                {(result && !result.solved ? result.solutionMoves : moves).map((m, i) => (
                  <li key={i} className="font-medium text-app-text">
                    {m.san}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {phase === "solving" && serverHint ? (
            <Card className="p-3 text-sm text-app-text">
              <Lightbulb className="mr-1 inline size-4 align-text-bottom text-primary" strokeWidth={2.5} />
              {hintText(serverHint)}
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {phase === "solving" ? (
              <>
                {serverHint?.level !== 3 ? (
                  <SimpleTooltip label="A hint halves what this puzzle can win you">
                    <Button type="button" variant="outline" size="sm" onClick={() => void requestHint()}>
                      <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                      {serverHint ? "More hint" : "Hint"}
                    </Button>
                  </SimpleTooltip>
                ) : null}
                <SimpleTooltip label="Shows the answer — counts as a miss">
                  <Button type="button" variant="outline" size="sm" onClick={() => void giveUp()}>
                    <Eye className="mr-1.5 size-4" strokeWidth={2.5} />
                    View solution
                  </Button>
                </SimpleTooltip>
                {pendingSubmit ? (
                  <Button type="button" size="sm" onClick={() => void retrySubmit()}>
                    Send result again
                  </Button>
                ) : null}
              </>
            ) : (
              <Button type="button" onClick={onNext} disabled={loadingNext} autoFocus>
                Next puzzle
                <ArrowRight className="ml-1.5 size-4" strokeWidth={2.5} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function RecentResults({ recent }: { recent: PuzzleTrainingRecentResult[] }) {
  return (
    <section aria-label="Recent puzzles" className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-app-muted">Recent puzzles</h2>
      <ol className="flex flex-wrap gap-2">
        {recent.map((r) => (
          <li
            key={r.attemptId}
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums",
              r.solved
                ? "border-accent/40 bg-accent/10 text-accent-ink"
                : "border-app-danger/40 bg-app-danger/10 text-app-danger-ink"
            )}
          >
            {r.solved ? (
              <CheckCircle2 aria-label="Solved" className="size-3.5" strokeWidth={2.5} />
            ) : (
              <XCircle aria-label="Missed" className="size-3.5" strokeWidth={2.5} />
            )}
            {r.ratingChange !== null ? formatChange(r.ratingChange) : r.puzzleRating}
          </li>
        ))}
      </ol>
    </section>
  );
}
