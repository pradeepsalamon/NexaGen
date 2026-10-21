"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { analyzePosition } from "../api/stockfishApi";
import { useBoardStore } from "../context/BoardProvider";

/** Plays the engine's best move on the board (full strength). Ignores repeat calls while thinking. */
export function useEngineMove() {
  const fen = useBoardStore((s) => s.fen);
  const isGameOver = useBoardStore((s) => s.isGameOver);
  const setupOnly = useBoardStore((s) => s.positionIssues.length > 0);
  const makeMove = useBoardStore((s) => s.makeMove);
  const [isEngineMoving, setIsEngineMoving] = useState(false);
  const busy = useRef(false);
  // The latest position, so a reply computed for an old one is never played.
  const latestFen = useRef(fen);
  latestFen.current = fen;

  const playEngineMove = useCallback(async () => {
    if (busy.current) return;
    if (isGameOver) {
      toast.error("The game is already over.");
      return;
    }
    if (setupOnly) {
      toast.error("The engine needs a legal position — this one is set-up only.");
      return;
    }
    busy.current = true;
    setIsEngineMoving(true);
    try {
      // Full strength, longer think — the engine is playing, not just advising.
      const requestedFen = fen;
      const analysis = await analyzePosition(requestedFen, undefined, "move");
      if (latestFen.current !== requestedFen) return;
      const uci = analysis.bestMoveUci;
      if (!uci || uci.length < 4) {
        toast.error("Engine could not find a move for this position.");
        return;
      }
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      if (!makeMove(uci.slice(0, 2), uci.slice(2, 4), promotion)) {
        toast.error("Could not play the engine's move.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to get the engine's move.");
    } finally {
      busy.current = false;
      setIsEngineMoving(false);
    }
  }, [fen, isGameOver, setupOnly, makeMove]);

  return { isEngineMoving, playEngineMove };
}
