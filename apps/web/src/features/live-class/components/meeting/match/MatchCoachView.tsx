"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Gavel, Shuffle, Swords, Trophy, Users, X } from "lucide-react";
import {
  compareMatchGamesForCoach,
  MATCH_PAIRING_MODE_LABELS,
  matchScoreLabel,
  type LiveMatchGame,
  type MatchColor,
  type MatchPair,
  type MatchPairingMode
} from "@nexa-chess/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { cn } from "@/lib/utils";
import {
  useEndLiveMatch,
  useLiveMatchAction,
  usePairLiveMatch,
  useUpdateLiveMatchMode
} from "../../../hooks/useLiveMatch";
import { Z } from "../../../lib/meetingUi";
import { matchResultText, useMatch } from "../../../providers/MatchProvider";
import { PuzzleBoardTile } from "../PuzzleBoardTile";
import { SimulMoveList } from "../simul/SimulMoveList";
import { MatchClock } from "./MatchClock";
import { MatchPairBuilder } from "./MatchPairBuilder";

const MODES: MatchPairingMode[] = ["AUTO", "COACH", "STUDENT_CHOICE"];

function tileStatus(game: LiveMatchGame): string {
  if (game.status === "FINISHED") return `${matchScoreLabel(game)} · ${game.result ? "done" : "unfinished"}`;
  if (game.drawOfferedBy) return "Draw offered";
  const toMove = game.turn === "white" ? game.white : game.black;
  return `${toMove.name.split(" ")[0]} to move · move ${Math.floor(game.ply / 2) + 1}`;
}

function NameLine({ game, color, compact }: { game: LiveMatchGame; color: MatchColor; compact?: boolean }) {
  const { classId } = useMatch();
  const action = useLiveMatchAction(classId);
  const player = color === "white" ? game.white : game.black;
  const toMove = game.status === "ONGOING" && game.turn === color;
  return (
    <div className="flex w-full items-center justify-between gap-1.5">
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          compact ? "text-xs" : "text-sm",
          toMove ? "font-semibold text-app-text" : "text-app-muted"
        )}
      >
        <span
          className={cn(
            "shrink-0 rounded-full border border-app-border",
            compact ? "size-2.5" : "size-3",
            color === "white" ? "bg-white" : "bg-neutral-900"
          )}
          aria-hidden="true"
        />
        <span className="truncate">{player.name}</span>
      </span>
      <MatchClock
        game={game}
        color={color}
        compact={compact}
        onFlag={() => action.mutate({ body: { action: "CLAIM_TIMEOUT" }, game })}
      />
    </div>
  );
}

function FocusedGame({ game, onBack }: { game: LiveMatchGame; onBack: () => void }) {
  const { classId, round } = useMatch();
  const action = useLiveMatchAction(classId);
  const [flipped, setFlipped] = useState(false);
  const orientation: MatchColor = flipped ? "black" : "white";
  const last = game.moves[game.moves.length - 1];
  const ongoing = round?.status === "ACTIVE" && game.status === "ONGOING";
  const top: MatchColor = orientation === "white" ? "black" : "white";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:flex-row md:items-start">
      <div className="flex flex-1 flex-col items-center gap-2">
        <div className="flex w-full max-w-[min(600px,64dvh)] items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-1.5 size-4" />
            All boards
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setFlipped((f) => !f)}>
            Flip
          </Button>
        </div>
        <div className="flex w-full max-w-[min(600px,64dvh)] flex-col gap-2">
          <NameLine game={game} color={top} />
          <PracticeBoard
            fen={game.fen}
            orientation={orientation}
            interactive={false}
            lastMove={last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null}
            resetKey={game.ply}
          />
          <NameLine game={game} color={orientation} />
        </div>
      </div>

      <div className="flex w-full flex-col gap-3 md:w-72">
        {game.status === "FINISHED" ? (
          <p className="rounded-app border border-primary/40 bg-primary/10 p-3 text-sm font-medium text-primary-ink">
            {matchResultText(game)}
          </p>
        ) : ongoing ? (
          <div className="flex flex-wrap gap-2">
            {game.drawOfferedBy ? (
              <Badge variant="info">
                {(game.drawOfferedBy === "white" ? game.white : game.black).name} offers a draw
              </Badge>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={action.isPending}>
                  <Gavel className="mr-1.5 size-4" />
                  Decide result
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => action.mutate({ body: { action: "ADJUDICATE", result: "WHITE_WON" }, game })}>
                  {game.white.name} wins
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => action.mutate({ body: { action: "ADJUDICATE", result: "DRAW" }, game })}>
                  Draw
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => action.mutate({ body: { action: "ADJUDICATE", result: "BLACK_WON" }, game })}>
                  {game.black.name} wins
                </DropdownMenuItem>
                <DropdownMenuItem className="text-app-danger-ink" onSelect={() => action.mutate({ body: { action: "ABORT" }, game })}>
                  Abort (no result)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
        <SimulMoveList
          moves={game.moves}
          blackStarts={game.startFen.split(" ")[1] === "b"}
          className="max-h-72 rounded-app border border-app-border bg-app-surface p-2"
        />
      </div>
    </div>
  );
}

/** Coach-only, full-screen: every student-vs-student board, pairing tools and standings. */
export function MatchCoachView() {
  const { classId, round, coachOpen, setCoachOpen, setStartOpen, focusedGameId, setFocusedGameId } = useMatch();
  const pair = usePairLiveMatch(classId);
  const setMode = useUpdateLiveMatchMode(classId);
  const endRound = useEndLiveMatch(classId);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pairs, setPairs] = useState<MatchPair[]>([]);
  const [showFinished, setShowFinished] = useState(true);

  const games = useMemo(() => round?.games ?? [], [round]);
  const sorted = useMemo(() => [...games].sort(compareMatchGamesForCoach), [games]);
  const visible = showFinished ? sorted : sorted.filter((g) => g.status === "ONGOING");
  const ongoing = games.filter((g) => g.status === "ONGOING").length;
  const focused = games.find((g) => g.id === focusedGameId) ?? null;
  const active = round?.status === "ACTIVE";

  const waiting = useMemo(
    () => (round?.players ?? []).filter((p) => p.inClass && !p.gameId).map((p) => ({ id: p.studentId, name: p.name })),
    [round]
  );
  const standings = useMemo(() => (round?.players ?? []).filter((p) => p.played > 0), [round]);

  // Drop built pairs whose students got a game some other way.
  useEffect(() => {
    const free = new Set(waiting.map((w) => w.id));
    setPairs((prev) => {
      const next = prev.filter((p) => free.has(p.whiteId) && free.has(p.blackId));
      return next.length === prev.length ? prev : next;
    });
  }, [waiting]);

  useEffect(() => {
    if (!coachOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || confirmEnd) return;
      if (focusedGameId) setFocusedGameId(null);
      else setCoachOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coachOpen, confirmEnd, focusedGameId, setCoachOpen, setFocusedGameId]);

  if (!coachOpen || !round) return null;

  return (
    <div className={cn("fixed inset-0 flex flex-col bg-app-background", Z.overlay)} role="dialog" aria-modal="true" aria-label="Student matches">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-app-border bg-app-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Swords className="size-5 text-primary-ink" />
          <h2 className="text-base font-semibold text-app-text">Student matches</h2>
          {active ? <Badge variant="secondary">{ongoing} playing</Badge> : <Badge variant="secondary">Finished</Badge>}
          {round.timeControl ? (
            <Badge variant="outline">
              {round.timeControl.initialSeconds / 60} + {round.timeControl.incrementSeconds}
            </Badge>
          ) : null}
        </div>

        {active ? (
          <div className="flex rounded-control border border-app-border p-0.5" role="radiogroup" aria-label="Pairing">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={round.pairingMode === mode}
                disabled={setMode.isPending}
                onClick={() => round.pairingMode !== mode && setMode.mutate(mode)}
                className={cn(
                  "rounded-control px-2.5 py-1 text-xs font-medium transition-colors",
                  round.pairingMode === mode ? "bg-primary/10 text-primary-ink" : "text-app-muted hover:bg-app-soft"
                )}
              >
                {MATCH_PAIRING_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {active ? (
            <Button size="sm" variant="destructive" onClick={() => setConfirmEnd(true)}>
              End matches
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setCoachOpen(false);
                setStartOpen(true);
              }}
            >
              New round
            </Button>
          )}
          <SimpleTooltip label="Back to class (Esc)">
            <Button size="icon" variant="ghost" className="rounded-full" aria-label="Back to class" onClick={() => setCoachOpen(false)}>
              <X className="size-5" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-5">
          {focused ? (
            <FocusedGame game={focused} onBack={() => setFocusedGameId(null)} />
          ) : games.length === 0 ? (
            <p className="m-auto max-w-sm text-center text-sm text-app-muted">
              {round.pairingMode === "STUDENT_CHOICE"
                ? "No games yet — students are choosing their opponents. You can also pair them yourself."
                : "No games yet. Pair students from the panel."}
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-2">
                <p className="text-sm text-app-muted">
                  {games.length} {games.length === 1 ? "game" : "games"}
                </p>
                {games.length > ongoing ? (
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setShowFinished((v) => !v)}>
                    {showFinished ? "Hide finished" : "Show finished"}
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,200px),1fr))] gap-3">
                {visible.map((game) => (
                  <div
                    key={game.id}
                    className={cn(
                      "flex flex-col gap-1.5 rounded-app border bg-app-surface p-2",
                      game.drawOfferedBy ? "border-info/60" : "border-app-border"
                    )}
                  >
                    <NameLine game={game} color="black" compact />
                    <button
                      type="button"
                      onClick={() => setFocusedGameId(game.id)}
                      aria-label={`Watch ${game.white.name} vs ${game.black.name}`}
                      className="rounded-control transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
                    >
                      <PuzzleBoardTile fen={game.fen} orientation="white" />
                    </button>
                    <NameLine game={game} color="white" compact />
                    <span className={cn("truncate text-[0.7rem]", game.status === "FINISHED" ? "text-primary-ink" : "text-app-muted")}>
                      {tileStatus(game)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>

        <aside className="flex max-h-[45dvh] shrink-0 flex-col gap-4 overflow-y-auto border-t border-app-border bg-app-surface p-3 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          {active ? (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-app-muted" />
                <h3 className="text-sm font-semibold text-app-text">Waiting to play ({waiting.length})</h3>
              </div>
              {waiting.length === 0 ? (
                <p className="text-xs text-app-muted">Everyone in class is playing.</p>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={waiting.length < 2 || pair.isPending}
                    onClick={() => pair.mutate({ type: "AUTO" })}
                  >
                    <Shuffle className="mr-1.5 size-4" />
                    Auto pair everyone waiting
                  </Button>
                  <MatchPairBuilder students={waiting} pairs={pairs} onChange={setPairs} />
                  {pairs.length > 0 ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      disabled={pair.isPending}
                      onClick={() => pair.mutate({ pairs, type: "MANUAL" }, { onSuccess: () => setPairs([]) })}
                    >
                      Start {pairs.length} {pairs.length === 1 ? "game" : "games"}
                    </Button>
                  ) : null}
                </>
              )}
              {round.challenges.length > 0 ? (
                <div className="space-y-1 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">Open challenges</p>
                  {round.challenges.map((c) => (
                    <p key={c.id} className="truncate text-xs text-app-muted">
                      {c.from.name} → {c.to.name}
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <Trophy className="size-4 text-app-muted" />
              <h3 className="text-sm font-semibold text-app-text">Standings</h3>
            </div>
            {standings.length === 0 ? (
              <p className="text-xs text-app-muted">No finished games yet.</p>
            ) : (
              <ol className="space-y-1">
                {standings.map((p, i) => (
                  <li key={p.studentId} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-xs text-app-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-app-text">{p.name}</span>
                    <span className="font-semibold text-app-text">{p.points}</span>
                    <span className="text-xs text-app-muted">/ {p.played}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the matches?</AlertDialogTitle>
            <AlertDialogDescription>
              {ongoing > 0
                ? `${ongoing} game${ongoing === 1 ? " is" : "s are"} still being played and will be left unscored.`
                : "Every game is finished."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={() => endRound.mutate(undefined)}>End matches</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
