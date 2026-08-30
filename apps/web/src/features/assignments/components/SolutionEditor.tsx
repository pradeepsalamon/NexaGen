"use client";

import { useMemo } from "react";
import { Chess } from "chess.js";
import type { SolutionMove } from "@nexa-chess/types";
import { RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";

interface Props {
  startFen: string;
  value: SolutionMove[];
  onChange: (moves: SolutionMove[]) => void;
  orientation?: "white" | "black";
}

// Admin builds the expected line by PLAYING it on the board. We capture UCI +
// SAN so the server never has to parse free-text PGN for scoring.
export function SolutionEditor({ startFen, value, onChange, orientation = "white" }: Props) {
  const { fen, valid } = useMemo(() => {
    try {
      const chess = new Chess(startFen);
      for (const m of value) {
        chess.move({
          from: m.uci.slice(0, 2),
          to: m.uci.slice(2, 4),
          promotion: m.uci.slice(4) || undefined
        });
      }
      return { fen: chess.fen(), valid: true };
    } catch {
      return { fen: startFen, valid: false };
    }
  }, [startFen, value]);

  const handleMove = (mv: PracticeBoardMove) => {
    onChange([...value, { uci: mv.uci, san: mv.san }]);
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start">
      <PracticeBoard
        fen={valid ? fen : startFen}
        orientation={orientation}
        interactive={valid}
        onMove={handleMove}
        className="md:w-[360px]"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <p className="text-sm text-app-muted">
          Play the moves for both sides in the order the student should follow. The student sees the
          forced replies automatically.
        </p>
        {value.length === 0 ? (
          <p className="text-sm text-app-muted">No solution moves recorded yet.</p>
        ) : (
          <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
            {value.map((m, i) => (
              <li key={i} className="flex items-center gap-1">
                {i % 2 === 0 && <span className="text-app-muted">{Math.floor(i / 2) + 1}.</span>}
                <span className="font-medium text-app-text">{m.san}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.length === 0}
            onClick={() => onChange(value.slice(0, -1))}
          >
            <Undo2 className="mr-1.5 size-4" strokeWidth={2.5} />
            Undo last move
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={value.length === 0}
            onClick={() => onChange([])}
          >
            <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
            Reset solution
          </Button>
        </div>
      </div>
    </div>
  );
}
