"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SkipForward, Timer, Zap } from "lucide-react";
import {
  PUZZLE_RACER_CONFIG,
  PUZZLE_STORM_CONFIG,
  type PuzzleRush,
  type PuzzleRushMode,
  type PuzzleRushStanding,
} from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { reportPuzzleRushProgress } from "../../../../../api/puzzleRush";
import {
  formatRushClock,
  useMyStanding,
  usePuzzleRush,
  useServerNow,
} from "../../../../../hooks/usePuzzleRush";
import {
  createRushRun,
  playRushMove,
  rushScore,
  skipRushMove,
  type RushRun,
} from "../../../../../lib/puzzleRushRun";
import { SectionTitle, ToolLoadError, ToolLoading } from "../../shared";
import {
  ComboBar,
  FeedbackPop,
  RaceTrack,
  RUSH_LABEL,
  RushRules,
  RushStandings,
  RushSummary,
} from "./RushParts";

/** A trailing report at most this often — every move would flood the room. */
const REPORT_EVERY_MS = 700;

/** A student's side of Puzzle Storm / Puzzle Racer: wait, count down, play, see results. */
export function RushPlayer({ classId, mode }: { classId: string; mode: PuzzleRushMode }) {
  const query = usePuzzleRush(classId);
  const userId = useAuthStore((s) => s.user?.id);
  const { rush, skewMs } = query;
  const me = useMyStanding(rush?.standings, userId);

  if (query.isLoading) return <ToolLoading />;
  if (query.isError) return <ToolLoadError onRetry={() => void query.refetch()} />;

  if (!rush || rush.mode !== mode) {
    return (
      <div className="space-y-4">
        <Alert variant="info">Your coach will start a {RUSH_LABEL[mode]} round. Get ready!</Alert>
        <RushRules mode={mode} />
      </div>
    );
  }

  if (rush.status === "COUNTDOWN") {
    return <RacerCountdown classId={classId} meId={userId} rush={rush} skewMs={skewMs} />;
  }

  // Didn't take part in a finished round: just the standings.
  if (rush.status === "ENDED" && !me?.startedAt) {
    return <RoundResults meId={userId} rush={rush} standing={null} />;
  }

  return <ActiveRun classId={classId} key={rush.id} me={me} rush={rush} skewMs={skewMs} userId={userId} />;
}

function RacerCountdown({
  classId,
  meId,
  rush,
  skewMs,
}: {
  classId: string;
  meId: string | undefined;
  rush: PuzzleRush;
  skewMs: number;
}) {
  const now = useServerNow(skewMs, true, 250);
  const left = Math.max(0, Date.parse(rush.startsAt) - now);
  // Put the student on the track before the start.
  const registered = useRef<string | null>(null);
  useEffect(() => {
    if (registered.current === rush.id) return;
    registered.current = rush.id;
    void reportPuzzleRushProgress(classId, emptyReport(rush.id)).catch(() => undefined);
  }, [classId, rush.id]);

  return (
    <div className="space-y-4">
      <div className="rounded-app bg-primary/10 px-4 py-6 text-center">
        <p className="text-sm font-semibold text-app-text">The race starts in</p>
        <p aria-live="polite" className="text-6xl font-extrabold tabular-nums text-primary-ink">
          {Math.ceil(left / 1000)}
        </p>
      </div>
      <RaceTrack meId={meId} standings={rush.standings} />
      <RushRules mode="RACER" />
    </div>
  );
}

function RoundResults({
  meId,
  rush,
  standing,
  durationMs,
  results,
}: {
  meId: string | undefined;
  rush: PuzzleRush;
  standing: PuzzleRushStanding | null;
  durationMs?: number | null;
  results?: RushRun["results"];
}) {
  const fallbackDuration =
    standing?.startedAt && standing.finishedAt
      ? Date.parse(standing.finishedAt) - Date.parse(standing.startedAt)
      : null;
  return (
    <div className="space-y-5">
      {standing ? (
        <RushSummary
          durationMs={durationMs ?? fallbackDuration}
          mode={rush.mode}
          results={results ?? []}
          standing={standing}
        />
      ) : (
        <Alert variant="info">This round is over — you didn&apos;t play in it.</Alert>
      )}
      <div className="space-y-2">
        <SectionTitle>{rush.status === "ENDED" ? "Final standings" : "Class standings"}</SectionTitle>
        {rush.mode === "RACER" ? (
          <RaceTrack meId={meId} standings={rush.standings} />
        ) : (
          <RushStandings meId={meId} mode={rush.mode} standings={rush.standings} />
        )}
      </div>
    </div>
  );
}

function emptyReport(rushId: string) {
  return {
    bestCombo: 0,
    clockEndsAt: null,
    errors: 0,
    finished: false,
    highestRating: null,
    moves: 0,
    puzzleIndex: 0,
    rushId,
    score: 0,
    skipsUsed: 0,
    solved: 0,
  };
}

function ActiveRun({
  classId,
  me,
  rush,
  skewMs,
  userId,
}: {
  classId: string;
  me: PuzzleRushStanding | null;
  rush: PuzzleRush;
  skewMs: number;
  userId: string | undefined;
}) {
  const storm = rush.mode === "STORM";
  const [run, setRun] = useState<RushRun>(() => createRushRun(rush.mode, rush.puzzles, me));
  // Storm: when the clock would run out with no bonus or penalty (null = not started).
  const [clockBase, setClockBase] = useState<number | null>(() =>
    storm && me?.clockEndsAt ? Date.parse(me.clockEndsAt) : null,
  );
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    me?.startedAt ? Date.parse(me.startedAt) : null,
  );
  // A refresh after the run ended (or a round already over) opens on the results.
  const [finishedAt, setFinishedAt] = useState<number | null>(() =>
    me?.finishedAt ? Date.parse(me.finishedAt) : null,
  );

  const now = useServerNow(skewMs, finishedAt === null, 200);
  const clockEndsAt = storm
    ? clockBase === null
      ? null
      : clockBase + run.clockAdjustSeconds * 1000
    : rush.endsAt
      ? Date.parse(rush.endsAt)
      : null;
  const remainingMs = clockEndsAt === null ? PUZZLE_STORM_CONFIG.initialSeconds * 1000 : clockEndsAt - now;
  const outOfTime = clockEndsAt !== null && remainingMs <= 0;
  const done = finishedAt !== null || outOfTime || run.exhausted || rush.status === "ENDED";

  useEffect(() => {
    if (done && finishedAt === null) setFinishedAt(Math.min(now, clockEndsAt ?? now));
  }, [clockEndsAt, done, finishedAt, now]);

  // ── Reporting: trailing-throttled, immediate once the run is over ──
  const latest = useRef({ clockEndsAt, done, run });
  latest.current = { clockEndsAt, done, run };
  const timer = useRef<number | null>(null);
  const stopped = useRef(!!me?.finishedAt);
  const lastSent = useRef(0);

  const send = useCallback(() => {
    timer.current = null;
    if (stopped.current) return;
    const { clockEndsAt: ends, done: over, run: r } = latest.current;
    lastSent.current = Date.now();
    if (over) stopped.current = true;
    void reportPuzzleRushProgress(classId, {
      bestCombo: r.bestCombo,
      clockEndsAt: storm && ends !== null ? new Date(ends).toISOString() : null,
      errors: r.errors,
      finished: over,
      highestRating: r.highestRating,
      moves: r.moves,
      puzzleIndex: r.puzzleIndex,
      rushId: rush.id,
      score: rushScore(r),
      skipsUsed: r.skipsUsed,
      solved: r.solved,
    }).catch(() => {
      // Round over or offline — the next report (or the final one) carries the totals.
    });
  }, [classId, rush.id, storm]);

  useEffect(() => {
    // Nothing played, nothing to report (a Racer is already on the track from the countdown).
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

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const begin = () => {
    if (startedAt !== null) return;
    setStartedAt(now);
    if (storm) setClockBase(now + PUZZLE_STORM_CONFIG.initialSeconds * 1000);
  };

  const onMove = (move: PracticeBoardMove) => {
    if (done) return;
    begin();
    setRun((r) => playRushMove(r, rush.puzzles, move.uci));
  };

  const onSkip = () => {
    if (done) return;
    begin();
    setRun((r) => skipRushMove(r, rush.puzzles));
  };

  if (done) {
    const standing = {
      bestCombo: run.bestCombo,
      errors: run.errors,
      highestRating: run.highestRating,
      moves: run.moves,
      rank: me?.rank ?? 0,
      score: rushScore(run),
    };
    return (
      <RoundResults
        durationMs={startedAt !== null && finishedAt !== null ? finishedAt - startedAt : null}
        meId={userId}
        results={run.results}
        rush={rush}
        standing={{ ...(me ?? fallbackStanding(userId)), ...standing }}
      />
    );
  }

  const low = clockEndsAt !== null && remainingMs <= 10_000;
  const toMove = run.color === "white" ? "White" : "Black";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_15rem] md:items-start">
      <div className="space-y-2">
        <p className="text-center text-sm font-semibold text-app-text">
          {startedAt === null && storm ? "Your move — the clock starts when you play." : `Find the best move for ${toMove}.`}
        </p>
        <PracticeBoard
          className="mx-auto max-w-[min(100%,calc(100dvh-16rem))] md:max-w-[min(100%,calc(100dvh-12rem))]"
          fen={run.fen}
          lastMove={run.lastMove}
          onMove={onMove}
          orientation={run.color}
          playerColor={run.color}
        />
      </div>

      <div className="space-y-4 md:order-none">
        {rush.mode === "RACER" ? <RaceTrack meId={userId} standings={rush.standings} /> : null}
        <div className="flex items-center justify-between gap-2 rounded-app border border-app-border px-3 py-2">
          <span
            aria-label={`${formatRushClock(remainingMs)} left`}
            className={cn(
              "flex items-center gap-1.5 text-3xl font-extrabold tabular-nums",
              low ? "text-app-danger-ink" : "text-app-text",
            )}
            role="timer"
          >
            <Timer aria-hidden="true" className="size-6" strokeWidth={2.5} />
            {formatRushClock(remainingMs)}
          </span>
          <FeedbackPop feedback={run.feedback} />
        </div>
        <div className="flex items-center justify-between rounded-app bg-primary/10 px-3 py-2">
          <span className="text-xs font-bold uppercase tracking-wide text-app-muted">
            {storm ? "Solved" : "Score"}
          </span>
          <span className="text-3xl font-extrabold tabular-nums text-primary-ink">{rushScore(run)}</span>
        </div>
        <ComboBar combo={run.combo} mode={rush.mode} />
        {rush.mode === "RACER" ? (
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

function fallbackStanding(userId: string | undefined): PuzzleRushStanding {
  return {
    bestCombo: 0,
    clockEndsAt: null,
    errors: 0,
    finishedAt: null,
    highestRating: null,
    moves: 0,
    name: "You",
    puzzleIndex: 0,
    rank: 0,
    score: 0,
    skipsUsed: 0,
    solved: 0,
    startedAt: null,
    studentId: userId ?? "",
  };
}
