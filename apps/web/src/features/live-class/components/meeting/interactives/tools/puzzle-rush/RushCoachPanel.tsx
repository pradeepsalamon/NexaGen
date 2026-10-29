"use client";

import { useState } from "react";
import { Gamepad2, ListOrdered, Play, RotateCcw, Square } from "lucide-react";
import { PUZZLE_RUSH_POOL_SIZE, type PuzzleRushMode } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";
import {
  formatRushClock,
  useEndPuzzleRush,
  usePuzzleRush,
  useServerNow,
  useStartPuzzleRush,
} from "../../../../../hooks/usePuzzleRush";
import { SectionTitle, ToolLoadError, ToolLoading, useIsPresenting } from "../../shared";
import { RaceTrack, RUSH_LABEL, RushRules, RushStandings } from "./RushParts";
import { RushPlayer } from "./RushPlayer";

/**
 * The coach's side: rules, Start / End, and the class standings live — or,
 * with "Play along", the coach's own run of the same puzzles (ranked with the
 * class, labelled as the coach). End stays in reach either way.
 */
export function RushCoachPanel({ classId, mode }: { classId: string; mode: PuzzleRushMode }) {
  const query = usePuzzleRush(classId);
  const start = useStartPuzzleRush(classId);
  const end = useEndPuzzleRush(classId);
  const presenting = useIsPresenting();
  const userId = useAuthStore((s) => s.user?.id);
  const [confirmEnd, setConfirmEnd] = useState(false);
  // The round id the coach chose to play, so a new round opens on the standings again.
  const [playingRushId, setPlayingRushId] = useState<string | null>(null);
  // Once the coach joins a round the player stays mounted (hidden behind the
  // standings), so switching views keeps the run and its unsent progress.
  const [joinedRushId, setJoinedRushId] = useState<string | null>(null);
  const { rush, skewMs } = query;
  const active = !!rush && rush.status !== "ENDED";
  const now = useServerNow(skewMs, active, 500);

  if (query.isLoading) return <ToolLoading />;
  if (query.isError) return <ToolLoadError onRetry={() => void query.refetch()} />;

  const otherRunning = active && rush.mode !== mode;
  const mine = rush && rush.mode === mode ? rush : null;
  const playing = mine?.standings.filter((s) => s.startedAt && !s.finishedAt).length ?? 0;

  let status: string | null = null;
  if (mine?.status === "COUNTDOWN") {
    status = `Starting in ${Math.ceil(Math.max(0, Date.parse(mine.startsAt) - now) / 1000)}s`;
  } else if (mine?.status === "RUNNING") {
    status =
      mine.mode === "RACER" && mine.endsAt
        ? `${formatRushClock(Date.parse(mine.endsAt) - now)} left · ${mine.standings.length} racing`
        : `Open · ${playing} playing · ${mine.standings.filter((s) => s.finishedAt).length} finished`;
  } else if (mine?.status === "ENDED") {
    status = "Finished";
  }

  const startLabel = mode === "STORM" ? "Start Puzzle Storm" : "Start the race";
  const coachPlaying = !!mine && playingRushId === mine.id;
  const playToggle =
    mine && (mine.status !== "ENDED" || coachPlaying) ? (
      <Button
        className="w-full"
        onClick={() => {
          setPlayingRushId(coachPlaying ? null : mine.id);
          if (!coachPlaying) setJoinedRushId(mine.id);
        }}
        size="sm"
        variant={coachPlaying ? "outline" : "secondary"}
      >
        {coachPlaying ? (
          <ListOrdered aria-hidden="true" className="size-4" strokeWidth={2.5} />
        ) : (
          <Gamepad2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
        )}
        {coachPlaying ? "Back to the standings" : mode === "STORM" ? "Play along" : "Join the race"}
      </Button>
    ) : null;

  return (
    <div className="space-y-4">
      {!mine || mine.status === "ENDED" ? (
        <>
          <RushRules mode={mode} />
          <p className="text-xs text-app-muted">
            Every student gets the same {PUZZLE_RUSH_POOL_SIZE} Lichess puzzles, from about 1000 up to 2500 — the
            Lichess {mode === "STORM" ? "Storm" : "Racer"} ladder.
          </p>
          {!presenting ? (
            <Alert variant="warning">Turn on “Show to class” so students can play.</Alert>
          ) : null}
          {otherRunning ? (
            <Alert variant="info">
              A {RUSH_LABEL[rush.mode]} round is running. Starting this one ends it.
            </Alert>
          ) : null}
          <Button className="w-full" disabled={start.isPending} onClick={() => start.mutate(mode)}>
            {mine ? (
              <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
            ) : (
              <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
            )}
            {start.isPending ? "Picking puzzles…" : mine ? `New round — ${startLabel.toLowerCase()}` : startLabel}
          </Button>
        </>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-app bg-primary/10 px-3 py-2">
          <span aria-live="polite" className="text-sm font-bold tabular-nums text-primary-ink">
            {status}
          </span>
          <Button onClick={() => setConfirmEnd(true)} size="sm" variant="destructive">
            <Square aria-hidden="true" className="size-4" strokeWidth={2.5} />
            End
          </Button>
        </div>
      )}

      {playToggle}

      {mine && joinedRushId === mine.id ? (
        <div hidden={!coachPlaying}>
          <RushPlayer classId={classId} compact mode={mode} />
        </div>
      ) : null}
      {coachPlaying ? null : mine ? (
        <div className="space-y-2">
          <SectionTitle>{mine.status === "ENDED" ? "Final standings" : "Standings"}</SectionTitle>
          {mine.mode === "RACER" ? <RaceTrack meId={userId} standings={mine.standings} /> : null}
          <RushStandings meId={userId} mode={mine.mode} standings={mine.standings} />
        </div>
      ) : null}

      <AlertDialog onOpenChange={setConfirmEnd} open={confirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this {RUSH_LABEL[mode]} round?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone still playing stops now and the standings are final.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={() => end.mutate()}>End round</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
