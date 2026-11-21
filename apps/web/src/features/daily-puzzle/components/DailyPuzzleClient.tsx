"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Eye, Flame, Lightbulb, MessageCircle, Trophy, XCircle } from "lucide-react";
import {
  DAILY_PUZZLE_LEVEL_LABELS,
  type DailyPuzzleCard,
  type DailyPuzzleLevel,
  type DailyPuzzleTodayResponse,
  type DailyPuzzleWhatsAppStatus
} from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { hintSquaresFor, hintText } from "@/features/assignments/lib/solveLineHint";
import { PRACTICE_BOARD_GRID, PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { startPuzzleAttempt } from "@/features/puzzles/api/puzzleApi";
import { usePuzzleAttempt } from "@/features/puzzles/hooks/usePuzzleAttempt";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useDailyPuzzleToday, useSetDailyPuzzleWhatsApp, useStartDailyPuzzle } from "../hooks/useDailyPuzzle";
import { titleWithoutRating } from "../lib/puzzleTitle";

/**
 * Puzzle of the Day (docs/PUZZLE_OF_THE_DAY.md): three puzzles a day, one per
 * level, the student's own level first. Finishing one (solved or not) keeps
 * the streak. Solving runs on the ordinary attempt routes.
 */
export function DailyPuzzleClient() {
  const today = useDailyPuzzleToday();
  const data = today.data;
  const [level, setLevel] = useState<DailyPuzzleLevel | null>(null);
  const selected = level ?? data?.myLevel ?? null;

  const header = (
    <PageHeader
      description="A new puzzle every day at three levels. Finish one a day, solved or not, to keep your streak."
      title="Puzzle of the Day"
    />
  );

  if (today.isLoading) {
    return (
      <div className="animate-fade-in pb-10">
        {header}
        <Skeleton className="h-[32rem] w-full rounded-app" />
      </div>
    );
  }
  if (today.isError || !data) {
    return (
      <div className="animate-fade-in pb-10">
        {header}
        <WidgetError message="Couldn't load today's puzzle." onRetry={() => void today.refetch()} />
      </div>
    );
  }

  const card = data.puzzles.find((p) => p.level === selected) ?? null;

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      {header}
      <Stats data={data} />

      {!data.enabled ? (
        <EmptyState
          description="Your coach or academy has turned it off for now. Puzzle training and Storm still work."
          illustration="puzzles"
          title="Puzzle of the Day isn't on for your batch"
        />
      ) : data.puzzles.length === 0 ? (
        <EmptyState
          description="There are no puzzles to pick from yet. Check back later."
          illustration="puzzles"
          title="No puzzle today"
        />
      ) : (
        <>
          <LevelPicker myLevel={data.myLevel} onChange={setLevel} puzzles={data.puzzles} value={selected} />
          {card ? <DailyBoard card={card} key={`${data.day}-${card.level}`} /> : null}
        </>
      )}

      {data.enabled && (data.whatsapp.available || data.whatsapp.on) ? <WhatsAppCard status={data.whatsapp} /> : null}
    </div>
  );
}

/** Step 2: the student's own switch. It goes to the account's phone and never names them. */
function WhatsAppCard({ status }: { status: DailyPuzzleWhatsAppStatus }) {
  const toggle = useSetDailyPuzzleWhatsApp();
  const noPhone = status.phoneMasked === null;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex min-w-0 items-start gap-3">
        <MessageCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-app-muted" strokeWidth={2.5} />
        <div className="min-w-0">
          <p className="font-extrabold text-app-text">Get it on WhatsApp</p>
          <p className="text-sm text-app-muted">
            {!status.available
              ? "Your academy has paused WhatsApp puzzles for now."
              : noPhone
                ? "Add your WhatsApp number to your profile to turn this on."
                : `A short message with the link, ${status.schedule?.toLowerCase() ?? "each day"}, to ${status.phoneMasked}.`}
          </p>
          {noPhone && status.available ? (
            <Link className="text-sm font-semibold text-primary-ink underline-offset-2 hover:underline" href="/profile">
              Open my profile
            </Link>
          ) : null}
        </div>
      </div>
      <Switch
        aria-label="Puzzle of the Day on WhatsApp"
        checked={status.on}
        disabled={toggle.isPending || (!status.on && (noPhone || !status.available))}
        onCheckedChange={(on) => toggle.mutate(on)}
      />
    </Card>
  );
}

function Stats({ data }: { data: DailyPuzzleTodayResponse }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile
        icon={Flame}
        label="Day streak"
        tone="reward"
        value={`${data.streak} ${data.streak === 1 ? "day" : "days"}`}
      />
      <StatTile icon={Trophy} label="Best streak" tone="primary" value={String(data.bestStreak)} />
      <StatTile icon={CalendarCheck} label="Today" tone="secondary" value={data.doneToday ? "Done" : "Not yet"} />
    </div>
  );
}

function LevelPicker({
  myLevel,
  onChange,
  puzzles,
  value
}: {
  myLevel: DailyPuzzleLevel;
  onChange: (level: DailyPuzzleLevel) => void;
  puzzles: DailyPuzzleCard[];
  value: DailyPuzzleLevel | null;
}) {
  return (
    <div aria-label="Level" className="flex flex-wrap gap-2" role="group">
      {puzzles.map((p) => (
        <button
          aria-pressed={p.level === value}
          className={cn(
            "flex min-h-[var(--control-h)] items-center gap-2 rounded-control border px-3 text-sm font-bold",
            p.level === value
              ? "border-primary bg-primary text-on-primary"
              : "border-app-border bg-app-surface text-app-text hover:bg-app-soft"
          )}
          key={p.level}
          onClick={() => onChange(p.level)}
          type="button"
        >
          {DAILY_PUZZLE_LEVEL_LABELS[p.level]}
          {p.level === myLevel ? <span className="text-xs font-medium opacity-80">(your level)</span> : null}
          {p.result === "SOLVED" ? (
            <CheckCircle2 aria-label="Solved" className="size-4" strokeWidth={2.5} />
          ) : p.result === "FAILED" ? (
            <XCircle aria-label="Missed" className="size-4" strokeWidth={2.5} />
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** One level's puzzle: opens today's DAILY attempt, then the ordinary solver. */
function DailyBoard({ card }: { card: DailyPuzzleCard }) {
  const open = useStartDailyPuzzle();
  const [opened, setOpened] = useState(card.result === "IN_PROGRESS");

  // Finished earlier: the summary. Finished just now: the solver stays, with its result and solution.
  if (!opened && (card.result === "SOLVED" || card.result === "FAILED")) {
    return (
      <Card
        className={cn(
          "flex flex-wrap items-center gap-3 p-5",
          card.result === "SOLVED" ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"
        )}
      >
        {card.result === "SOLVED" ? (
          <CheckCircle2 aria-hidden="true" className="size-6 text-success-ink" strokeWidth={2.5} />
        ) : (
          <XCircle aria-hidden="true" className="size-6 text-warning-ink" strokeWidth={2.5} />
        )}
        <div>
          <p className="font-extrabold text-app-text">
            {card.result === "SOLVED" ? "Solved!" : "Missed this one"} · {DAILY_PUZZLE_LEVEL_LABELS[card.level]}
          </p>
          <p className="text-sm text-app-muted">Your streak is safe for today. A new puzzle comes tomorrow.</p>
        </div>
      </Card>
    );
  }

  if (!opened) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="font-extrabold text-app-text">{titleWithoutRating(card.title, card.rating)}</p>
          <p className="text-sm text-app-muted">
            {DAILY_PUZZLE_LEVEL_LABELS[card.level]}
            {card.rating ? ` · rated ${card.rating}` : ""}
          </p>
        </div>
        <Button
          disabled={open.isPending}
          onClick={async () => {
            try {
              await open.mutateAsync(card.level);
              setOpened(true);
            } catch {
              // The hook's toast says why.
            }
          }}
          type="button"
        >
          Solve today&apos;s puzzle
        </Button>
      </Card>
    );
  }

  return <DailySolver puzzleId={card.puzzleId} rating={card.rating} />;
}

function DailySolver({ puzzleId, rating }: { puzzleId: string; rating: number | null }) {
  const qc = useQueryClient();
  // Resumes the DAILY attempt `startDailyPuzzle` just opened.
  const start = useCallback(() => startPuzzleAttempt(puzzleId), [puzzleId]);
  const { session, startError, moves, phase, wrong, resetNonce, result, currentFen, begin, handleMove, giveUp, pendingSubmit, retrySubmit, serverHint, requestHint } =
    usePuzzleAttempt({ start });

  const done = phase === "done";
  useEffect(() => {
    if (!done) return;
    void qc.invalidateQueries({ queryKey: queryKeys.dailyPuzzle.today });
    void qc.invalidateQueries({ queryKey: queryKeys.progress.mine });
  }, [done, qc]);

  if (startError) return <WidgetError message={startError} onRetry={() => void begin()} />;
  if (!session || !currentFen) return <Skeleton className="h-96 w-full" />;

  const side = session.studentColor === "white" ? "White" : "Black";
  const last = moves[moves.length - 1];

  return (
    <Card className="p-4 sm:p-6">
      <div className={PRACTICE_BOARD_GRID}>
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
        <div aria-live="polite" className="space-y-4">
          {phase === "solving" ? (
            <div>
              <p className="text-lg font-extrabold text-app-text">Your turn</p>
              <p className="text-sm text-app-muted">
                Find the best move for {side}.{rating ? ` Rated ${rating}.` : ""}
              </p>
            </div>
          ) : null}
          {wrong ? (
            <Card className="flex items-center gap-2 border-warning/40 bg-warning/10 p-3 text-sm text-warning-ink">
              <XCircle aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.5} />
              Not the move — try again.
            </Card>
          ) : null}
          {result ? (
            <Card className={cn("p-4", result.solved ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10")}>
              <p className={cn("flex items-center gap-2 text-lg font-extrabold", result.solved ? "text-success-ink" : "text-warning-ink")}>
                {result.solved ? <CheckCircle2 aria-hidden="true" className="size-5" strokeWidth={2.5} /> : <XCircle aria-hidden="true" className="size-5" strokeWidth={2.5} />}
                {result.solved ? "Solved!" : "Puzzle missed"}
              </p>
              <p className="text-sm text-app-text">Your streak is safe for today.</p>
            </Card>
          ) : null}
          {result && !result.solved ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-app-muted">Solution</p>
              <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
                {result.solutionMoves.map((m, i) => (
                  <li className="font-medium text-app-text" key={i}>
                    {m.san}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          {phase === "solving" && serverHint ? (
            <Card className="p-3 text-sm text-app-text">
              <Lightbulb aria-hidden="true" className="mr-1 inline size-4 align-text-bottom text-app-muted" strokeWidth={2.5} />
              {hintText(serverHint)}
            </Card>
          ) : null}
          {phase === "solving" ? (
            <div className="flex flex-wrap gap-2">
              {serverHint?.level !== 3 ? (
                <Button onClick={() => void requestHint()} size="sm" type="button" variant="outline">
                  <Lightbulb aria-hidden="true" className="mr-1.5 size-4" strokeWidth={2.5} />
                  {serverHint ? "More hint" : "Hint"}
                </Button>
              ) : null}
              <SimpleTooltip label="Shows the answer. Counts as a miss, but still keeps your streak">
                <Button onClick={() => void giveUp()} size="sm" type="button" variant="outline">
                  <Eye aria-hidden="true" className="mr-1.5 size-4" strokeWidth={2.5} />
                  View solution
                </Button>
              </SimpleTooltip>
              {pendingSubmit ? (
                <Button onClick={() => void retrySubmit()} size="sm" type="button">
                  Send result again
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
