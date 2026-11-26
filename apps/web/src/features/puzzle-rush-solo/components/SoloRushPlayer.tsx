"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SkipForward, Timer, Zap } from "lucide-react";
import { PUZZLE_RACER_CONFIG, PUZZLE_RUSH_MAX_PLAYED, PUZZLE_STORM_CONFIG, type SoloRushRun } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { formatRushClock, useServerNow } from "@/features/live-class/hooks/usePuzzleRush";
import {
  createRushRun,
  playRushMove,
  rushBoardKey,
  rushScore,
  skipRushMove,
  type RushRun
} from "@/features/live-class/lib/puzzleRushRun";
import {
  ComboBar,
  FeedbackPop,
  RUSH_LABEL,
  RushSummary
} from "@/features/live-class/components/meeting/interactives/tools/puzzle-rush/RushParts";
import { cn } from "@/lib/utils";
import { reportSoloRushProgress } from "../api/soloRushApi";

/** A trailing report at most this often. */
const REPORT_EVERY_MS = 700;

/**
 * One solo Storm / Racer run. The rules and the move checking are the live
 * class's (`lib/puzzleRushRun.ts`); here nobody else is on the board, so the
 * only server round-trip is the trailing progress report the API clamps.
 */
export function SoloRushPlayer({
  onFinished,
  onLeave,
  run: frozen
}: {
  onFinished: () => void;
  onLeave: () => void;
  run: SoloRushRun;
}) {
  const storm = frozen.mode === "STORM";
  const [skewMs] = useState(() => Date.parse(frozen.serverTime) - Date.now());
  const [run, setRun] = useState<RushRun>(() => createRushRun(frozen.mode, frozen.puzzles, null));
  const [clockBase, setClockBase] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  const now = useServerNow(skewMs, finishedAt === null, 200);
  const countdownLeft = Math.max(0, Date.parse(frozen.startsAt) - now);
  const counting = !storm && countdownLeft > 0;

  const clockEndsAt = storm
    ? clockBase === null
      ? null
      : clockBase + run.clockAdjustSeconds * 1000
    : frozen.endsAt
      ? Date.parse(frozen.endsAt)
      : null;
  const remainingMs = clockEndsAt === null ? PUZZLE_STORM_CONFIG.initialSeconds * 1000 : clockEndsAt - now;
  const outOfTime = !counting && clockEndsAt !== null && remainingMs <= 0;
  const done = finishedAt !== null || outOfTime || run.exhausted;

  useEffect(() => {
    if (done && finishedAt === null) setFinishedAt(Math.min(now, clockEndsAt ?? now));
  }, [clockEndsAt, done, finishedAt, now]);

  // ── Reporting: trailing-throttled, immediate once the run is over ──
  const latest = useRef({ clockEndsAt, done, run });
  latest.current = { clockEndsAt, done, run };
  const timer = useRef<number | null>(null);
  const stopped = useRef(false);
  const lastSent = useRef(0);

  const send = useCallback(() => {
    timer.current = null;
    if (stopped.current) return;
    const { clockEndsAt: ends, done: over, run: r } = latest.current;
    lastSent.current = Date.now();
    if (over) stopped.current = true;
    reportSoloRushProgress(frozen.id, {
      bestCombo: r.bestCombo,
      clockEndsAt: storm && ends !== null ? new Date(ends).toISOString() : null,
      errors: r.errors,
      finished: over,
      highestRating: r.highestRating,
      moves: r.moves,
      // Each finished puzzle's moves, for the student's Board play (docs/AI_PLAY_REVIEW.md).
      played: r.played.slice(-PUZZLE_RUSH_MAX_PLAYED),
      puzzleIndex: r.puzzleIndex,
      score: rushScore(r),
      skipsUsed: r.skipsUsed,
      solved: r.solved
    })
      .catch(() => {
        // Offline or the run closed — the next report (or the final one) carries the totals.
      })
      .finally(() => {
        if (over) onFinished();
      });
  }, [frozen.id, onFinished, storm]);

  useEffect(() => {
    if (startedAt === null) return;
    if (done) {
      if (timer.current !== null) window.clearTimeout(timer.current);
      send();
      return;
    }
    if (timer.current !== null) return;
    const wait = Math.max(0, REPORT_EVERY_MS - (Date.now() - lastSent.current));
    timer.current = window.setTimeout(send, wait);
  }, [done, run, send, startedAt]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const begin = () => {
    if (startedAt !== null) return;
    setStartedAt(now);
    if (storm) setClockBase(now + PUZZLE_STORM_CONFIG.initialSeconds * 1000);
  };

  const onMove = (move: PracticeBoardMove) => {
    if (done || counting) return;
    begin();
    setRun((r) => playRushMove(r, frozen.puzzles, move.uci));
  };

  const onSkip = () => {
    if (done || counting) return;
    begin();
    setRun((r) => skipRushMove(r, frozen.puzzles));
  };

  // A Racer nobody touched still ends when its 90 seconds are up; make sure it is reported.
  useEffect(() => {
    if (done && startedAt === null) setStartedAt(now);
  }, [done, now, startedAt]);

  if (done) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <RushSummary
          durationMs={startedAt !== null && finishedAt !== null ? Math.max(0, finishedAt - startedAt) : null}
          mode={frozen.mode}
          results={run.results}
          standing={{
            bestCombo: run.bestCombo,
            errors: run.errors,
            highestRating: run.highestRating,
            moves: run.moves,
            // Alone on the board: no class rank to show.
            rank: 0,
            score: rushScore(run)
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={onLeave}>Back to Storm and Racer</Button>
        </div>
      </div>
    );
  }

  if (counting) {
    return (
      <div className="mx-auto max-w-md rounded-app bg-primary/10 px-4 py-8 text-center">
        <p className="text-sm font-semibold text-app-text">{RUSH_LABEL.RACER} starts in</p>
        <p aria-live="polite" className="text-6xl font-extrabold tabular-nums text-primary-ink">
          {Math.ceil(countdownLeft / 1000)}
        </p>
      </div>
    );
  }

  const low = clockEndsAt !== null && remainingMs <= 10_000;
  const toMove = run.color === "white" ? "White" : "Black";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_15rem] md:items-start">
      <div className="space-y-2">
        <p className="text-center text-sm font-semibold text-app-text">
          {startedAt === null && storm
            ? "Your move — the clock starts when you play."
            : `Find the best move for ${toMove}.`}
        </p>
        <PracticeBoard
          className="mx-auto max-w-[min(100%,calc(100dvh-14rem))]"
          fen={run.fen}
          lastMove={run.lastMove}
          onMove={onMove}
          orientation={run.color}
          playerColor={run.color}
          resetKey={rushBoardKey(run)}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-app border border-app-border px-3 py-2">
          <span
            aria-label={`${formatRushClock(remainingMs)} left`}
            className={cn(
              "flex items-center gap-1.5 text-3xl font-extrabold tabular-nums",
              low ? "text-app-danger-ink" : "text-app-text"
            )}
            role="timer"
          >
            <Timer aria-hidden="true" className="size-6" strokeWidth={2.5} />
            {formatRushClock(remainingMs)}
          </span>
          <FeedbackPop feedback={run.feedback} />
        </div>
        <div className="flex items-center justify-between rounded-app bg-primary/10 px-3 py-2">
          <span className="text-xs font-bold text-app-muted">{storm ? "Solved" : "Score"}</span>
          <span className="text-3xl font-extrabold tabular-nums text-primary-ink">{rushScore(run)}</span>
        </div>
        <ComboBar combo={run.combo} mode={frozen.mode} />
        {!storm ? (
          <Button
            className="w-full"
            disabled={run.skipsUsed >= PUZZLE_RACER_CONFIG.skips}
            onClick={onSkip}
            size="sm"
            variant="outline"
          >
            <SkipForward aria-hidden="true" className="size-4" strokeWidth={2.5} />
            {run.skipsUsed >= PUZZLE_RACER_CONFIG.skips ? "Skip used" : "Skip this move"}
          </Button>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-app-muted">
            <Zap aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.5} />
            Wrong move: −{PUZZLE_STORM_CONFIG.malusSeconds}s and the next puzzle.
          </p>
        )}
      </div>
    </div>
  );
}
