"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, FlipVertical2, Zap } from "lucide-react";
import { TOURNAMENT_END_REASON_LABELS, type TournamentEndReason, type TournamentGameResult } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PRACTICE_BOARD_GRID, PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { Chess } from "@/lib/chess";
import { cn } from "@/lib/utils";
import { clockText, resultText } from "../lib/format";
import { ClockFace, useNow, useServerOffset } from "./TournamentBits";

export type BoardGame = {
  id: string;
  roundNumber: number;
  board: number;
  white: { name: string; rating: number | null };
  black: { name: string; rating: number | null } | null;
  startFen: string;
  fen: string;
  moves: { san: string; uci: string }[];
  ply: number;
  clock: { whiteMs: number; blackMs: number; turnSince: string; running: "white" | "black" | null; serverNow: string };
  firstMoveDeadline: string | null;
  drawOfferedBy: "white" | "black" | null;
  berserk: { white: boolean; black: boolean };
  status: "ONGOING" | "FINISHED";
  result: TournamentGameResult | null;
  endReason: TournamentEndReason | null;
  delayed: boolean;
};

/** Every position of the game, start first (positions[k] = after k half-moves). */
function positionsOf(startFen: string, moves: { uci: string }[]): string[] {
  const chess = new Chess(startFen);
  const out = [chess.fen()];
  for (const move of moves) {
    try {
      chess.move({ from: move.uci.slice(0, 2), promotion: move.uci[4], to: move.uci.slice(2, 4) });
    } catch {
      break;
    }
    out.push(chess.fen());
  }
  return out;
}

export function useLiveClock(game: Pick<BoardGame, "clock" | "status"> | null | undefined) {
  const now = useNow(game?.status === "ONGOING" && game.clock.running ? 100 : 1000);
  const offset = useServerOffset(game?.clock.serverNow);
  if (!game) return { black: 0, white: 0 };
  const elapsed = Math.max(0, now + offset - Date.parse(game.clock.turnSince));
  return {
    black: game.clock.running === "black" && game.status === "ONGOING" ? game.clock.blackMs - elapsed : game.clock.blackMs,
    white: game.clock.running === "white" && game.status === "ONGOING" ? game.clock.whiteMs - elapsed : game.clock.whiteMs
  };
}

function PlayerStrip({
  side,
  color,
  ms,
  running,
  berserk,
  winner
}: {
  side: { name: string; rating: number | null } | null;
  color: "white" | "black";
  ms: number;
  running: boolean;
  berserk: boolean;
  winner: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={cn("size-3 shrink-0 rounded-full border border-app-line-strong", color === "white" ? "bg-side-white" : "bg-side-black")} />
        <span className={cn("truncate font-medium text-app-text", winner && "font-semibold")}>{side?.name ?? "Bye"}</span>
        {side?.rating ? <span className="shrink-0 text-xs text-app-muted">{side.rating}</span> : null}
        {berserk ? (
          <Badge variant="accent">
            <Zap aria-hidden className="size-3" />
            Berserk
          </Badge>
        ) : null}
      </div>
      <ClockFace active={running} label={`${color === "white" ? "White" : "Black"} clock`} low={ms < 20_000} ms={clockText(ms)} />
    </div>
  );
}

/**
 * Board, clocks and move list of one tournament game. Moves come from the
 * server (the source of truth); `onMove` is given only to the side to move.
 */
export function GameBoardPanel({
  game,
  orientation: initialOrientation = "white",
  interactive = false,
  playerColor,
  onMove,
  resetKey,
  shapes,
  onShapesChange,
  onViewPly,
  actions,
  banner
}: {
  game: BoardGame;
  orientation?: "white" | "black";
  interactive?: boolean;
  playerColor?: "white" | "black";
  onMove?: (move: PracticeBoardMove) => void;
  resetKey?: number | string;
  shapes?: { orig: string; dest?: string; brush: "green" | "red" | "blue" | "yellow" }[];
  onShapesChange?: (shapes: { orig: string; dest?: string; brush: string }[]) => void;
  /** Reports the half-move being looked at (the studio pins commentary to it). */
  onViewPly?: (ply: number, fen: string) => void;
  actions?: ReactNode;
  banner?: ReactNode;
}) {
  const [orientation, setOrientation] = useState<"white" | "black">(initialOrientation);
  useEffect(() => setOrientation(initialOrientation), [initialOrientation]);
  const positions = useMemo(() => positionsOf(game.startFen, game.moves), [game.startFen, game.moves]);
  const last = positions.length - 1;
  // null = follow the latest move.
  const [viewPly, setViewPly] = useState<number | null>(null);
  const shownPly = viewPly === null ? last : Math.min(viewPly, last);
  const atLatest = shownPly === last;
  const fen = atLatest ? game.fen : positions[shownPly];
  const lastUci = shownPly > 0 ? game.moves[shownPly - 1]?.uci : undefined;
  const clocks = useLiveClock(game);
  const moveListRef = useRef<HTMLOListElement>(null);

  const onViewPlyRef = useRef(onViewPly);
  onViewPlyRef.current = onViewPly;
  useEffect(() => {
    onViewPlyRef.current?.(shownPly, fen);
  }, [shownPly, fen]);

  useEffect(() => {
    if (viewPly === null) moveListRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [game.moves.length, viewPly]);

  const go = (ply: number) => setViewPly(ply >= last ? null : Math.max(0, ply));
  const top = orientation === "white" ? "black" : "white";
  const bottom = orientation === "white" ? "white" : "black";
  const sideOf = (c: "white" | "black") => (c === "white" ? game.white : game.black);
  const strip = (c: "white" | "black") => (
    <PlayerStrip
      berserk={game.berserk[c]}
      color={c}
      ms={clocks[c]}
      running={game.status === "ONGOING" && game.clock.running === c}
      side={sideOf(c)}
      winner={(game.result === "WHITE_WON" && c === "white") || (game.result === "BLACK_WON" && c === "black")}
    />
  );

  const pairs: { n: number; white?: { san: string; ply: number }; black?: { san: string; ply: number } }[] = [];
  game.moves.forEach((m, i) => {
    const ply = i + 1;
    const n = Math.ceil(ply / 2);
    if (ply % 2 === 1) pairs.push({ n, white: { ply, san: m.san } });
    else if (pairs.length === 0 || pairs[pairs.length - 1].black) pairs.push({ black: { ply, san: m.san }, n });
    else pairs[pairs.length - 1].black = { ply, san: m.san };
  });

  return (
    <div className={PRACTICE_BOARD_GRID}>
      <div className="flex min-w-0 flex-col gap-2">
        {strip(top)}
        <PracticeBoard
          fen={fen}
          interactive={interactive && atLatest && game.status === "ONGOING"}
          lastMove={lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : null}
          onMove={onMove}
          onShapesChange={onShapesChange}
          orientation={orientation}
          playerColor={playerColor}
          premove={!!playerColor}
          resetKey={resetKey}
          shapes={shapes}
        />
        {strip(bottom)}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {banner}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Round {game.roundNumber} · Board {game.board}
          </Badge>
          {game.status === "FINISHED" ? (
            <Badge variant="secondary">
              {resultText(game.result)}
              {game.endReason ? ` · ${TOURNAMENT_END_REASON_LABELS[game.endReason]}` : ""}
            </Badge>
          ) : (
            <Badge variant="live">Live</Badge>
          )}
          {game.delayed ? <Badge variant="warning">Delayed broadcast</Badge> : null}
          {game.drawOfferedBy ? <Badge variant="info">Draw offered by {game.drawOfferedBy}</Badge> : null}
        </div>
        <div className="rounded-control border border-app-border bg-app-surface">
          <ol aria-label="Moves" className="grid max-h-64 grid-cols-[2.5rem_1fr_1fr] overflow-y-auto p-2 text-sm md:max-h-80" ref={moveListRef}>
            {pairs.length === 0 ? <li className="col-span-3 p-2 text-app-muted">No moves yet.</li> : null}
            {pairs.map((pair) => (
              <li className="contents" key={pair.n}>
                <span className="px-1 py-0.5 tabular-nums text-app-muted">{pair.n}.</span>
                {(["white", "black"] as const).map((c) => {
                  const m = pair[c];
                  return m ? (
                    <button
                      className={cn("rounded px-1.5 py-0.5 text-left font-medium hover:bg-app-soft", m.ply === shownPly && "bg-primary-soft text-primary-ink")}
                      key={c}
                      onClick={() => go(m.ply)}
                      type="button"
                    >
                      {m.san}
                    </button>
                  ) : (
                    <span key={c} />
                  );
                })}
              </li>
            ))}
          </ol>
          <div className="flex items-center justify-between border-t border-app-border p-1">
            <div className="flex items-center gap-1">
              <SimpleTooltip label="First move">
                <Button aria-label="First move" className="size-8 p-0" disabled={shownPly === 0} onClick={() => go(0)} variant="ghost">
                  <ChevronFirst className="size-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label="Previous move">
                <Button aria-label="Previous move" className="size-8 p-0" disabled={shownPly === 0} onClick={() => go(shownPly - 1)} variant="ghost">
                  <ChevronLeft className="size-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label="Next move">
                <Button aria-label="Next move" className="size-8 p-0" disabled={atLatest} onClick={() => go(shownPly + 1)} variant="ghost">
                  <ChevronRight className="size-4" />
                </Button>
              </SimpleTooltip>
              <SimpleTooltip label="Latest move">
                <Button aria-label="Latest move" className="size-8 p-0" disabled={atLatest} onClick={() => go(last)} variant="ghost">
                  <ChevronLast className="size-4" />
                </Button>
              </SimpleTooltip>
            </div>
            <SimpleTooltip label="Flip board">
              <Button aria-label="Flip board" className="size-8 p-0" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))} variant="ghost">
                <FlipVertical2 className="size-4" />
              </Button>
            </SimpleTooltip>
          </div>
        </div>
        {actions}
      </div>
    </div>
  );
}
