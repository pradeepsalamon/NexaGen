"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { Chess } from "chess.js";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useChessAppearance } from "@/features/chess-appearance/context/ChessAppearanceProvider";

type Ply = { fen: string; san: string; from: string; to: string; check: boolean };

const DEFAULT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function parsePgn(pgn: string): { plies: Ply[]; startFen: string; error: boolean } {
  const loaded = new Chess();

  try {
    loaded.loadPgn(pgn.trim());
  } catch {
    return { plies: [], startFen: DEFAULT_FEN, error: true };
  }

  const startFen = loaded.header().FEN ?? DEFAULT_FEN;
  const replay = new Chess();

  try {
    if (loaded.header().FEN) replay.load(startFen);
  } catch {
    return { plies: [], startFen: DEFAULT_FEN, error: true };
  }

  const plies: Ply[] = [];
  for (const san of loaded.history()) {
    const move = replay.move(san);
    plies.push({ fen: replay.fen(), san, from: move.from, to: move.to, check: replay.inCheck() });
  }

  return { plies, startFen, error: false };
}

export function PgnBoardViewer({ pgn }: { pgn: string }) {
  const { plies, startFen, error } = useMemo(() => parsePgn(pgn), [pgn]);
  const {
    currentBoardTheme,
    currentPieceSet,
    showCoordinates,
    animationEnabled,
    highlightSettings,
    hasCustomPieceColors,
  } = useChessAppearance();

  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  // -1 = starting position, 0..plies.length-1 = after that ply.
  const [cursor, setCursor] = useState(plies.length - 1);

  useEffect(() => {
    setCursor(plies.length - 1);
  }, [plies.length]);

  const currentFen = cursor < 0 ? startFen : plies[cursor]?.fen ?? startFen;
  const currentPly = cursor >= 0 ? plies[cursor] : undefined;

  useEffect(() => {
    if (!containerRef.current) return;
    apiRef.current = Chessground(containerRef.current, {
      fen: currentFen,
      viewOnly: true,
      coordinates: showCoordinates,
      drawable: { enabled: false },
      animation: { enabled: animationEnabled, duration: 150 }
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // Mount once; FEN changes are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiRef.current?.set({
      fen: currentFen,
      lastMove: currentPly ? [currentPly.from, currentPly.to] as any : undefined,
      check: currentPly?.check ?? false,
      highlight: {
        lastMove: highlightSettings.highlightEnabled,
        check: highlightSettings.checkIndicatorEnabled,
      },
    });
  }, [currentFen, currentPly, highlightSettings]);

  const atStart = cursor < 0;
  const atEnd = cursor >= plies.length - 1;

  if (error) {
    return (
      <div className="rounded-panel border border-app-border bg-app-surface p-6 text-sm text-app-muted">
        This assignment&apos;s PGN could not be read.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="w-full max-w-[420px]">
        <div
          ref={containerRef}
          className="aspect-square w-full rounded-app border border-app-border"
          data-nexa-board-theme={currentBoardTheme}
          data-nexa-piece-set={currentPieceSet}
          data-nexa-piece-recolor={hasCustomPieceColors ? "on" : undefined}
          data-nexa-highlights={highlightSettings.highlightEnabled ? undefined : "off"}
        />
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            aria-label="First move"
            variant="outline"
            size="icon"
            className="size-9 rounded-full p-0"
            disabled={atStart}
            onClick={() => setCursor(-1)}
          >
            <ChevronFirst className="size-4" strokeWidth={2.5} />
          </Button>
          <Button
            aria-label="Previous move"
            variant="outline"
            size="icon"
            className="size-9 rounded-full p-0"
            disabled={atStart}
            onClick={() => setCursor((c) => Math.max(-1, c - 1))}
          >
            <ChevronLeft className="size-4" strokeWidth={2.5} />
          </Button>
          <Button
            aria-label="Next move"
            variant="outline"
            size="icon"
            className="size-9 rounded-full p-0"
            disabled={atEnd}
            onClick={() => setCursor((c) => Math.min(plies.length - 1, c + 1))}
          >
            <ChevronRight className="size-4" strokeWidth={2.5} />
          </Button>
          <Button
            aria-label="Last move"
            variant="outline"
            size="icon"
            className="size-9 rounded-full p-0"
            disabled={atEnd}
            onClick={() => setCursor(plies.length - 1)}
          >
            <ChevronLast className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-app-muted">Moves</p>
        {plies.length === 0 ? (
          <p className="text-sm text-app-muted">Starting position only — no moves in this PGN.</p>
        ) : (
          <ol className="flex flex-wrap gap-x-1 gap-y-1 text-sm">
            {plies.map((ply, index) => {
              const moveNumber = Math.floor(index / 2) + 1;
              const isWhite = index % 2 === 0;
              return (
                <li key={index} className="flex items-center gap-1">
                  {isWhite && <span className="text-app-muted">{moveNumber}.</span>}
                  <button
                    type="button"
                    onClick={() => setCursor(index)}
                    className={cn(
                      "rounded px-1.5 py-0.5 font-medium transition-colors hover:bg-app-soft",
                      cursor === index ? "bg-primary text-white hover:bg-primary" : "text-app-text"
                    )}
                  >
                    {ply.san}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
