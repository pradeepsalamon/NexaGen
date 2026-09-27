"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  ChevronRight,
  Flag,
  Gavel,
  Handshake,
  Lightbulb,
  Loader2,
  Swords,
  UserPlus,
  X
} from "lucide-react";
import {
  compareSimulGamesForCoach,
  SIMUL_END_REASON_LABELS,
  simulScoreLabel,
  tallySimul,
  type LiveSimulGame,
  type LiveSimulGameActionRequest
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
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { analyzePosition } from "@/features/chessboard/api/stockfishApi";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { getPullRoster } from "../../../api/live-class";
import {
  useAddLiveSimulPlayer,
  useEndLiveSimul,
  useLiveSimulAction,
  useLiveSimulEngineMove,
  useLiveSimulMove
} from "../../../hooks/useLiveSimul";
import { Z } from "../../../lib/meetingUi";
import { useSimul } from "../../../providers/SimulProvider";
import { PuzzleBoardTile } from "../PuzzleBoardTile";
import { SimulMoveList } from "./SimulMoveList";

const ENGINE_LEVELS = [
  { value: "20", label: "Full strength" },
  { value: "15", label: "Strong" },
  { value: "10", label: "Club" },
  { value: "5", label: "Casual" },
  { value: "1", label: "Beginner" }
];

type Hint = { gameId: string; ply: number; from: string; to: string };

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function waitLabel(since: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function resultText(game: LiveSimulGame): string {
  if (!game.result) return "Unfinished";
  const reason = game.endReason ? SIMUL_END_REASON_LABELS[game.endReason] : "";
  const who = game.result === "DRAW" ? "Draw" : game.result === "COACH_WON" ? "You won" : `${game.studentName} won`;
  return `${who} · ${reason}`;
}

/** Coach-only, full-screen: every simul board, the ones waiting on the coach first. */
export function SimulCoachView() {
  const {
    classId,
    simul,
    coachOpen,
    setCoachOpen,
    setStartOpen,
    focusedGameId,
    setFocusedGameId
  } = useSimul();
  const toast = useToast();
  const now = useNow(1000);

  const move = useLiveSimulMove(classId, "COACH");
  const engineMove = useLiveSimulEngineMove(classId);
  const action = useLiveSimulAction(classId);
  const endSimul = useEndLiveSimul(classId);
  const addPlayer = useAddLiveSimulPlayer(classId);

  const [autoAdvance, setAutoAdvance] = useState(true);
  const [engineLevel, setEngineLevel] = useState("20");
  const [enginePending, setEnginePending] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const games = useMemo(() => simul?.games ?? [], [simul]);
  const sorted = useMemo(() => [...games].sort(compareSimulGamesForCoach), [games]);
  const tally = useMemo(() => tallySimul(games), [games]);
  const active = simul?.status === "ACTIVE";
  const focused = games.find((g) => g.id === focusedGameId) ?? null;

  useEffect(() => {
    if (coachOpen && !focused && sorted.length > 0) setFocusedGameId(sorted[0].id);
  }, [coachOpen, focused, sorted, setFocusedGameId]);

  const roster = useQuery({
    queryKey: queryKeys.livePull.roster(classId),
    queryFn: () => getPullRoster(classId),
    enabled: coachOpen && active
  });
  const addable = useMemo(() => {
    const playing = new Set(games.map((g) => g.studentId));
    return (roster.data?.students ?? []).filter((s) => !playing.has(s.studentId));
  }, [roster.data, games]);

  const nextCoachBoard = useCallback(
    (excludeId?: string) =>
      sorted.find((g) => g.turn === "COACH" && g.id !== excludeId && !enginePending.has(g.id)) ?? null,
    [sorted, enginePending]
  );

  const advanceFrom = useCallback(
    (gameId: string) => {
      const next = nextCoachBoard(gameId);
      if (next) setFocusedGameId(next.id);
    },
    [nextCoachBoard, setFocusedGameId]
  );

  const onBoardMove = (game: LiveSimulGame, m: PracticeBoardMove) => {
    move.mutate({ game, uci: m.uci, san: m.san, fen: m.fen });
    if (autoAdvance) advanceFrom(game.id);
  };

  const playEngine = (game: LiveSimulGame) => {
    setEnginePending((prev) => new Set(prev).add(game.id));
    engineMove.mutate(
      { game, skillLevel: Number(engineLevel) },
      {
        onSettled: () =>
          setEnginePending((prev) => {
            const next = new Set(prev);
            next.delete(game.id);
            return next;
          })
      }
    );
    if (autoAdvance) advanceFrom(game.id);
  };

  const showHint = async (game: LiveSimulGame) => {
    setHintLoading(true);
    try {
      const result = await analyzePosition(game.fen);
      const uci = result.bestMoveUci;
      if (uci) setHint({ gameId: game.id, ply: game.ply, from: uci.slice(0, 2), to: uci.slice(2, 4) });
    } catch (error) {
      toast.error({ title: "Engine hint unavailable", message: error instanceof Error ? error.message : undefined });
    } finally {
      setHintLoading(false);
    }
  };

  const act = (game: LiveSimulGame, body: LiveSimulGameActionRequest) => action.mutate({ game, body });

  // Esc closes the view; N jumps to the next board waiting on you.
  useEffect(() => {
    if (!coachOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.key === "Escape" && !confirmEnd) setCoachOpen(false);
      if (e.key.toLowerCase() === "n") {
        const next = nextCoachBoard(focusedGameId ?? undefined);
        if (next) setFocusedGameId(next.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coachOpen, confirmEnd, focusedGameId, nextCoachBoard, setCoachOpen, setFocusedGameId]);

  if (!coachOpen || !simul) return null;

  const nextBoard = nextCoachBoard(focused?.id);
  const focusedHint = hint && focused && hint.gameId === focused.id && hint.ply === focused.ply ? hint : null;

  return (
    <div
      className={cn("fixed inset-0 flex flex-col bg-app-background", Z.overlay)}
      role="dialog"
      aria-modal="true"
      aria-label="Simul"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-app-border bg-app-surface px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Swords className="size-5 text-primary-ink" />
          <h2 className="text-base font-semibold text-app-text">Simul</h2>
          {active ? (
            <Badge variant={tally.coachToMove > 0 ? "warning" : "secondary"}>
              {tally.coachToMove} waiting on you
            </Badge>
          ) : (
            <Badge variant="secondary">Finished</Badge>
          )}
        </div>
        <p className="text-sm text-app-muted">
          <span className="font-semibold text-app-text">{tally.coachPoints}</span> /{" "}
          {games.length - tally.ongoing} · {tally.coachWins}W {tally.draws}D {tally.studentWins}L
          {tally.ongoing > 0 ? ` · ${tally.ongoing} playing` : ""}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {active ? (
            <>
              <Switch
                checked={autoAdvance}
                onCheckedChange={setAutoAdvance}
                label="Auto-advance"
                aria-label="Jump to the next board after each move"
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={addPlayer.isPending}>
                    <UserPlus className="mr-1.5 size-4" />
                    Add player
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                  <DropdownMenuLabel>Add a board for…</DropdownMenuLabel>
                  {addable.length === 0 ? (
                    <DropdownMenuItem disabled>Everyone is already playing</DropdownMenuItem>
                  ) : (
                    addable.map((s) => (
                      <DropdownMenuItem key={s.studentId} onSelect={() => addPlayer.mutate(s.studentId)}>
                        {s.name}
                        {s.inClass ? "" : " (not in class)"}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="destructive" onClick={() => setConfirmEnd(true)}>
                End simul
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => {
                setCoachOpen(false);
                setStartOpen(true);
              }}
            >
              New simul
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
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 md:flex-row md:items-start">
              <div className="flex flex-1 flex-col items-center gap-2">
                <div className="flex w-full max-w-[min(640px,70dvh)] items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-app-text">{focused.studentName}</p>
                    <p className="text-xs text-app-muted">
                      You play {focused.coachColor === "white" ? "White" : "Black"} · move {Math.floor(focused.ply / 2) + 1}
                    </p>
                  </div>
                  {focused.status === "FINISHED" ? (
                    <Badge variant="secondary">{simulScoreLabel(focused)}</Badge>
                  ) : enginePending.has(focused.id) ? (
                    <Badge variant="info">Engine thinking…</Badge>
                  ) : focused.turn === "COACH" ? (
                    <Badge variant="warning">Your move</Badge>
                  ) : (
                    <Badge variant="outline">Their move</Badge>
                  )}
                </div>
                <PracticeBoard
                  fen={focused.fen}
                  orientation={focused.coachColor}
                  playerColor={focused.coachColor}
                  interactive={
                    active &&
                    focused.status === "ONGOING" &&
                    focused.turn === "COACH" &&
                    !enginePending.has(focused.id)
                  }
                  lastMove={
                    focused.moves.length > 0
                      ? [focused.moves[focused.moves.length - 1].uci.slice(0, 2), focused.moves[focused.moves.length - 1].uci.slice(2, 4)]
                      : null
                  }
                  hintSquares={focusedHint}
                  onMove={(m) => onBoardMove(focused, m)}
                  resetKey={focused.ply}
                  className="max-w-[min(640px,70dvh)]"
                />
              </div>

              <div className="flex w-full flex-col gap-3 md:w-72">
                {focused.status === "FINISHED" ? (
                  <p className="rounded-app border border-primary/40 bg-primary/10 p-3 text-sm font-medium text-primary-ink">
                    {resultText(focused)}
                  </p>
                ) : active ? (
                  <>
                    {focused.drawOfferedBy === "STUDENT" ? (
                      <div className="space-y-2 rounded-app border border-info/40 bg-info/10 p-3 text-sm text-info-ink">
                        <p className="flex items-center gap-2 font-medium">
                          <Handshake className="size-4" /> {focused.studentName} offers a draw
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => act(focused, { action: "ACCEPT_DRAW" })}>
                            Accept
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => act(focused, { action: "DECLINE_DRAW" })}>
                            Decline
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2 rounded-app border border-app-border bg-app-surface p-3">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-app-text">
                        <Bot className="size-4" /> Engine
                      </p>
                      <Select
                        aria-label="Engine strength"
                        value={engineLevel}
                        onChange={(e) => setEngineLevel(e.target.value)}
                        options={ENGINE_LEVELS}
                        className="min-h-9"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={focused.turn !== "COACH" || hintLoading}
                          onClick={() => void showHint(focused)}
                        >
                          {hintLoading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Lightbulb className="mr-1.5 size-4" />}
                          Hint
                        </Button>
                        <Button
                          size="sm"
                          disabled={focused.turn !== "COACH" || enginePending.has(focused.id)}
                          onClick={() => playEngine(focused)}
                        >
                          <Bot className="mr-1.5 size-4" />
                          Play it
                        </Button>
                      </div>
                      <p className="text-xs text-app-muted">Hint shows the best move (full strength); Play it moves at the chosen strength.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={focused.drawOfferedBy !== null || action.isPending}
                        onClick={() => act(focused, { action: "OFFER_DRAW" })}
                      >
                        <Handshake className="mr-1.5 size-4" />
                        {focused.drawOfferedBy === "COACH" ? "Draw offered" : "Offer draw"}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" disabled={action.isPending}>
                            <Gavel className="mr-1.5 size-4" />
                            Decide result
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => act(focused, { action: "ADJUDICATE", result: "COACH_WON" })}>
                            I win this board
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => act(focused, { action: "ADJUDICATE", result: "DRAW" })}>
                            Draw
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => act(focused, { action: "ADJUDICATE", result: "STUDENT_WON" })}>
                            {focused.studentName} wins
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-app-danger-ink"
                            onSelect={() => act(focused, { action: "RESIGN" })}
                          >
                            <Flag className="mr-1.5 size-4" /> Resign this board
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </>
                ) : null}

                {active && nextBoard ? (
                  <Button variant="outline" onClick={() => setFocusedGameId(nextBoard.id)}>
                    Next board: {nextBoard.studentName}
                    <ChevronRight className="ml-1 size-4" />
                  </Button>
                ) : null}

                <SimulMoveList
                  moves={focused.moves}
                  blackStarts={simul.startFen.split(" ")[1] === "b"}
                  showEngine
                  className="max-h-60 rounded-app border border-app-border bg-app-surface p-2"
                />
                {focused.engineMoves > 0 ? (
                  <p className="text-xs text-app-muted">
                    {focused.engineMoves} engine move{focused.engineMoves === 1 ? "" : "s"} on this board (marked E).
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="m-auto text-sm text-app-muted">No boards in this simul.</p>
          )}
        </main>

        <aside className="flex shrink-0 gap-2 overflow-x-auto border-t border-app-border bg-app-surface p-2 lg:w-80 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:border-l lg:border-t-0 lg:p-3">
          <p className="hidden text-xs font-semibold uppercase tracking-wide text-app-muted lg:block">
            Boards ({games.length})
          </p>
          <div className="flex gap-2 lg:grid lg:grid-cols-2">
            {sorted.map((game) => (
              <button
                key={game.id}
                type="button"
                onClick={() => setFocusedGameId(game.id)}
                aria-label={`Open ${game.studentName}'s board`}
                aria-current={game.id === focused?.id}
                className={cn(
                  "flex w-28 shrink-0 flex-col gap-1 rounded-app border p-1.5 text-left transition-colors lg:w-auto",
                  game.id === focused?.id
                    ? "border-primary bg-primary/5"
                    : game.turn === "COACH"
                      ? "border-warning/60 hover:bg-app-soft"
                      : "border-app-border hover:bg-app-soft"
                )}
              >
                <PuzzleBoardTile fen={game.fen} orientation={game.coachColor} />
                <span className="truncate text-xs font-semibold text-app-text">{game.studentName}</span>
                <span
                  className={cn(
                    "truncate text-[0.7rem]",
                    game.turn === "COACH" ? "font-semibold text-warning-ink" : "text-app-muted"
                  )}
                >
                  {game.status === "FINISHED"
                    ? `${simulScoreLabel(game)} · ${game.result ? "done" : "unfinished"}`
                    : enginePending.has(game.id)
                      ? "Engine thinking…"
                      : game.turn === "COACH"
                        ? `Your move · ${waitLabel(game.turnSince, now)}`
                        : game.drawOfferedBy === "STUDENT"
                          ? "Offers a draw"
                          : "Their move"}
                </span>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <AlertDialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End the simul?</AlertDialogTitle>
            <AlertDialogDescription>
              {tally.ongoing > 0
                ? `${tally.ongoing} game${tally.ongoing === 1 ? " is" : "s are"} still being played and will be left unscored.`
                : "Every game is finished."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction onClick={() => endSimul.mutate()}>End simul</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
