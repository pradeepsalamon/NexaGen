"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, Lightbulb, SkipForward, XCircle } from "lucide-react";
import {
  REVISION_GRADES,
  REVISION_GRADE_DESCRIPTIONS,
  REVISION_GRADE_LABELS,
  REVISION_OUTCOME_LABELS,
  defaultRevisionGrade,
  trainingThemeLabels,
  type RevisionCurrent,
  type RevisionGrade,
  type RevisionPendingRating,
  type RevisionReviewResponse
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { PRACTICE_BOARD_GRID, PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { hintSquaresFor, hintText } from "@/features/assignments/lib/solveLineHint";
import { startPuzzleAttempt } from "@/features/puzzles/api/puzzleApi";
import { usePuzzleAttempt } from "@/features/puzzles/hooks/usePuzzleAttempt";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { formatInterval, formatNextDue } from "../lib/revisionFormat";

const GRADE_STYLE: Record<RevisionGrade, string> = {
  AGAIN: "border-app-danger/50 text-app-danger-ink hover:bg-app-danger/10",
  EASY: "border-primary/50 text-primary hover:bg-primary/10",
  GOOD: "border-accent/50 text-accent-ink hover:bg-accent/10",
  HARD: "border-secondary/60 text-app-text hover:bg-secondary/15"
};

type BoardProps = {
  current: RevisionCurrent;
  position: number;
  total: number;
  reviewed: RevisionReviewResponse | null;
  rating: boolean;
  onRate: (grade: RevisionGrade) => void;
  onSkip: () => void;
  onNext: () => void;
  /** The puzzle was just finished: the parent re-reads the item to get the server's verdict. */
  onFinished: () => void;
  loadingNext: boolean;
};

function reasonLabel(current: RevisionCurrent): string {
  if (current.kind === "TOPIC") return `Concept: ${current.topicName ?? "folder"}`;
  if (current.source === "COACH") return current.recommendedByName ? `Recommended by ${current.recommendedByName}` : "Recommended";
  if (current.source === "GAME") return "A tactic from one of your games";
  return "One you missed before";
}

/**
 * One revision item: the puzzle on the ordinary server-graded attempt routes,
 * then the recall rating. The ratings offered are the server's
 * (`current.pendingRating`), never worked out here — a missed puzzle is always
 * Again, a hint or a wrong move caps it at Hard.
 *
 * A review finished earlier but never rated (the tab closed) resumes straight
 * at the rating: the solver is not mounted for it, since a finished attempt
 * can't be restarted.
 */
export function RevisionItemBoard(props: BoardProps) {
  const [resumedAtRating] = useState(() => props.current.pendingRating !== null);
  return resumedAtRating ? <PendingRatingView {...props} /> : <SolveView {...props} />;
}

function ItemHeader({ current, position, total }: Pick<BoardProps, "current" | "position" | "total">) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-bold text-app-text">
        Item {position} of {total}
      </p>
      <div
        aria-label={`Item ${position} of ${total}`}
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={position - 1}
        className="h-2 w-40 overflow-hidden rounded-full bg-app-border"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${Math.round(((position - 1) / Math.max(1, total)) * 100)}%` }}
        />
      </div>
      <div className="flex w-full flex-wrap gap-1.5">
        <Badge variant="secondary">{reasonLabel(current)}</Badge>
        {current.reviewCount === 0 ? <Badge variant="outline">First review</Badge> : null}
        {current.dueStatus === "OVERDUE" ? <Badge variant="warning">Overdue</Badge> : null}
      </div>
    </div>
  );
}

/** 1–4 rate (only grades the server allows), Enter/→ moves on once rated. */
function useRevisionKeys({
  allowed,
  canRate,
  reviewed,
  loadingNext,
  onRate,
  onNext
}: {
  allowed: readonly RevisionGrade[];
  canRate: boolean;
  reviewed: boolean;
  loadingNext: boolean;
  onRate: (grade: RevisionGrade) => void;
  onNext: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (canRate) {
        const grade = REVISION_GRADES[Number(e.key) - 1];
        if (grade && allowed.includes(grade)) {
          e.preventDefault();
          onRate(grade);
        }
      } else if (reviewed && !loadingNext && (e.key === "Enter" || e.key === "ArrowRight")) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed, canRate, reviewed, loadingNext, onRate, onNext]);
}

function GradeButtons({
  pending,
  rating,
  onRate
}: {
  pending: RevisionPendingRating;
  rating: boolean;
  onRate: (grade: RevisionGrade) => void;
}) {
  const focus = defaultRevisionGrade(pending.outcome);
  return (
    <fieldset className="space-y-2" disabled={rating}>
      <legend className="mb-1 text-sm font-bold text-app-text">How well did you remember it?</legend>
      <div className="grid grid-cols-2 gap-2">
        {REVISION_GRADES.map((grade, i) => {
          const ok = pending.allowedGrades.includes(grade);
          return (
            <Button
              aria-describedby={`grade-${grade}`}
              autoFocus={grade === focus}
              className={cn("h-auto flex-col items-start gap-0.5 py-2 text-left", ok && GRADE_STYLE[grade])}
              disabled={!ok}
              key={grade}
              onClick={() => onRate(grade)}
              type="button"
              variant="outline"
            >
              <span className="text-sm font-extrabold">
                <kbd className="mr-1.5 font-mono text-xs text-app-muted">{i + 1}</kbd>
                {REVISION_GRADE_LABELS[grade]}
              </span>
              <span className="text-xs font-normal text-app-muted" id={`grade-${grade}`}>
                {REVISION_GRADE_DESCRIPTIONS[grade]}
              </span>
            </Button>
          );
        })}
      </div>
      {pending.outcome !== "CLEAN" ? (
        <p className="text-xs text-app-muted">
          {pending.outcome === "FAILED"
            ? "A puzzle that wasn't solved is always rated Again."
            : "You used a hint or played a wrong move, so Hard is the highest rating."}
        </p>
      ) : null}
    </fieldset>
  );
}

function ReviewedPanel({
  reviewed,
  loadingNext,
  onNext
}: {
  reviewed: RevisionReviewResponse;
  loadingNext: boolean;
  onNext: () => void;
}) {
  const tz = useUserTimeZone();
  const themes = trainingThemeLabels(reviewed.themes);
  return (
    <div className="space-y-3">
      <p className="text-sm text-app-text">
        Rated <span className="font-bold">{REVISION_GRADE_LABELS[reviewed.grade]}</span>. Next review{" "}
        <span className="font-bold">{formatNextDue(reviewed.dueAt, tz)}</span>
        {formatInterval(reviewed.intervalDays) ? (
          <span className="text-app-muted">
            {" "}
            ({formatInterval(reviewed.intervalDays)} · {formatFullDate(reviewed.dueAt, tz)})
          </span>
        ) : null}
        .
      </p>
      {reviewed.longTermRecall ? (
        <Badge variant="success">Long-term recall: remembered across several spaced reviews</Badge>
      ) : null}
      {themes.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {themes.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}
      <Button autoFocus disabled={loadingNext} onClick={onNext} type="button">
        Next
        <ArrowRight className="ml-1.5 size-4" strokeWidth={2.5} />
      </Button>
    </div>
  );
}

function RatingArea({
  current,
  reviewed,
  rating,
  loadingNext,
  onRate,
  onNext
}: Pick<BoardProps, "current" | "reviewed" | "rating" | "loadingNext" | "onRate" | "onNext">) {
  if (reviewed) return <ReviewedPanel loadingNext={loadingNext} onNext={onNext} reviewed={reviewed} />;
  if (!current.pendingRating) return <p className="text-sm text-app-muted">Checking your result…</p>;
  return <GradeButtons onRate={onRate} pending={current.pendingRating} rating={rating} />;
}

/** A review finished earlier and never rated: ask for the rating, nothing else. */
function PendingRatingView(props: BoardProps) {
  const { current, reviewed, rating, loadingNext, onRate, onNext } = props;
  const pending = current.pendingRating as RevisionPendingRating;
  useRevisionKeys({
    allowed: pending.allowedGrades,
    canRate: !reviewed && !rating,
    loadingNext,
    onNext,
    onRate,
    reviewed: !!reviewed
  });
  const solved = pending.outcome !== "FAILED";
  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <ItemHeader current={current} position={props.position} total={props.total} />
      <Card
        className={cn(
          "space-y-1 p-4",
          solved ? "border-accent/40 bg-accent/10" : "border-app-danger/30 bg-app-danger/5"
        )}
      >
        <p className="text-sm text-app-muted">You finished this puzzle earlier but didn&apos;t rate it yet.</p>
        <p className={cn("flex items-center gap-2 text-lg font-extrabold", solved ? "text-accent-ink" : "text-app-danger-ink")}>
          {solved ? <CheckCircle2 className="size-5" strokeWidth={2.5} /> : <XCircle className="size-5" strokeWidth={2.5} />}
          {REVISION_OUTCOME_LABELS[pending.outcome]}
        </p>
      </Card>
      <RatingArea {...props} />
    </Card>
  );
}

function SolveView(props: BoardProps) {
  const { current, reviewed, rating, loadingNext, onRate, onNext, onSkip, onFinished } = props;
  const start = useCallback(() => startPuzzleAttempt(current.puzzleId), [current.puzzleId]);
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

  // Once the submit lands, ask the server what it graded (and so which ratings it accepts).
  const reported = useRef(false);
  useEffect(() => {
    if (phase === "done" && result && !reported.current) {
      reported.current = true;
      onFinished();
    }
  }, [phase, result, onFinished]);

  useRevisionKeys({
    allowed: current.pendingRating?.allowedGrades ?? [],
    canRate: phase === "done" && !!current.pendingRating && !reviewed && !rating,
    loadingNext,
    onNext,
    onRate,
    reviewed: !!reviewed
  });

  if (startError) {
    return (
      <Card className="space-y-3 p-5">
        <WidgetError message={`This item can't be opened right now: ${startError}`} onRetry={() => void begin()} />
        <Button onClick={onSkip} size="sm" type="button" variant="outline">
          <SkipForward className="mr-1.5 size-4" strokeWidth={2.5} />
          Skip it for now
        </Button>
      </Card>
    );
  }
  if (!session || !currentFen) return <Skeleton className="h-96 w-full" />;

  const side = session.studentColor === "white" ? "White" : "Black";
  const last = moves[moves.length - 1];
  const outcome = current.pendingRating?.outcome ?? null;

  return (
    <Card className="p-4 sm:p-6">
      <ItemHeader current={current} position={props.position} total={props.total} />
      <div className={PRACTICE_BOARD_GRID}>
        <div>
          <PracticeBoard
            fen={currentFen}
            hintSquares={phase === "solving" ? hintSquaresFor(serverHint) : null}
            interactive={phase === "solving"}
            lastMove={last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null}
            onMove={handleMove}
            orientation={session.orientation}
            playerColor={session.studentColor}
            resetKey={`${moves.length}-${resetNonce}`}
          />
        </div>

        <div aria-live="polite" className="space-y-4">
          {current.note ? (
            <p className="rounded-control border border-app-border bg-app-background p-3 text-sm text-app-text">
              <span className="font-semibold">Coach&apos;s note:</span> {current.note}
            </p>
          ) : null}

          {phase === "solving" ? (
            <div>
              <p className="text-lg font-extrabold leading-tight text-app-text">Your turn</p>
              <p className="text-sm text-app-muted">Find the best move for {side}.</p>
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
                "space-y-1 p-4",
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
                {outcome ? REVISION_OUTCOME_LABELS[outcome] : result.solved ? "Solved" : "Not solved"}
              </p>
              {!result.solved && result.solutionMoves.length > 0 ? (
                <p className="text-sm text-app-text">
                  Solution: <span className="font-semibold">{result.solutionMoves.map((m) => m.san).join(" ")}</span>
                </p>
              ) : null}
            </Card>
          ) : null}

          {phase === "solving" && serverHint ? (
            <Card className="p-3 text-sm text-app-text">
              <Lightbulb className="mr-1 inline size-4 align-text-bottom text-primary" strokeWidth={2.5} />
              {hintText(serverHint)}
            </Card>
          ) : null}

          {phase === "solving" ? (
            <div className="flex flex-wrap gap-2">
              {serverHint?.level !== 3 ? (
                <SimpleTooltip label="A hint means you can rate this one Hard at best">
                  <Button onClick={() => void requestHint()} size="sm" type="button" variant="outline">
                    <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                    {serverHint ? "More hint" : "Hint"}
                  </Button>
                </SimpleTooltip>
              ) : null}
              <SimpleTooltip label="Shows the answer — counts as Again">
                <Button onClick={() => void giveUp()} size="sm" type="button" variant="outline">
                  <Eye className="mr-1.5 size-4" strokeWidth={2.5} />
                  Show solution
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label="Come back to it later in this session">
                <Button onClick={onSkip} size="sm" type="button" variant="ghost">
                  <SkipForward className="mr-1.5 size-4" strokeWidth={2.5} />
                  Skip
                </Button>
              </SimpleTooltip>
              {pendingSubmit ? (
                <Button onClick={() => void retrySubmit()} size="sm" type="button">
                  Send result again
                </Button>
              ) : null}
            </div>
          ) : (
            <RatingArea {...props} />
          )}
        </div>
      </div>
    </Card>
  );
}
