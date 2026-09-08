"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttemptMove,
  PuzzleAttemptResultResponse,
  StartPuzzleAttemptResponse
} from "@nexa-chess/types";
import type { PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { useToast } from "@/providers/ToastProvider";
import { savePuzzleAttempt, submitPuzzleAttempt } from "../api/puzzleApi";
import { replayLine } from "../components/solver/puzzleSolverEngine";

type StartFn = () => Promise<{ attempt: StartPuzzleAttemptResponse }>;

/**
 * The server-backed puzzle-attempt flow: start an attempt, play the student's
 * side move by move (each `savePuzzleAttempt` returns feedback + the forced
 * opponent reply), auto-submit when the line completes. Shared by the standalone
 * student solver and the in-class puzzle solver — the only difference is the
 * `start` function (the in-class variant stamps `liveClassId`).
 */
export function usePuzzleAttempt({ start }: { start: StartFn }) {
  const toast = useToast();

  const [session, setSession] = useState<StartPuzzleAttemptResponse | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [moves, setMoves] = useState<AttemptMove[]>([]);
  const [phase, setPhase] = useState<"solving" | "done">("solving");
  const [wrong, setWrong] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [revealedHints, setRevealedHints] = useState(0);
  const [result, setResult] = useState<PuzzleAttemptResultResponse | null>(null);
  const startedAt = useRef(Date.now());
  const busy = useRef(false);

  const begin = useCallback(async () => {
    try {
      setStartError(null);
      const res = await start();
      setSession(res.attempt);
      setMoves(res.attempt.attempt.moves ?? []);
      setPhase("solving");
      setWrong(false);
      setRevealedHints(0);
      setResult(null);
      startedAt.current = Date.now();
    } catch (error) {
      setStartError((error as Error).message);
    }
    // `start` is expected to be a stable useCallback from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  useEffect(() => {
    void begin();
  }, [begin]);

  const puzzleId = session?.attempt.puzzleId ?? "";
  const attemptId = session?.attempt.id ?? "";
  const startFen = session?.fen ?? "";

  const currentFen = useMemo(() => {
    if (!startFen) return "";
    if (result && !result.solved) {
      return replayLine(startFen, result.solutionMoves.map((m) => m.uci));
    }
    return replayLine(startFen, moves.map((m) => m.uci));
  }, [startFen, moves, result]);

  const submit = useCallback(
    async (finalMoves: AttemptMove[]) => {
      if (!puzzleId || !attemptId) return;
      try {
        const res = await submitPuzzleAttempt(puzzleId, attemptId, {
          moves: finalMoves,
          durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
          hintsUsed: revealedHints
        });
        setResult(res);
        setPhase("done");
        return res;
      } catch (error) {
        toast.error({ title: "Could not submit", message: (error as Error).message });
      }
    },
    [puzzleId, attemptId, revealedHints, toast]
  );

  const handleMove = useCallback(
    async (pmv: PracticeBoardMove) => {
      if (!puzzleId || !attemptId || phase !== "solving" || busy.current) return;
      busy.current = true;
      const studentMove: AttemptMove = {
        ply: moves.length + 1,
        uci: pmv.uci,
        san: pmv.san,
        fenAfter: pmv.fen
      };
      try {
        const res = await savePuzzleAttempt(puzzleId, attemptId, {
          moves: [...moves, studentMove]
        });
        const fb = res.moveFeedback;
        if (fb && !fb.correct) {
          setWrong(true);
          setResetNonce((n) => n + 1);
          window.setTimeout(() => setWrong(false), 900);
          return;
        }
        let nextMoves = [...moves, studentMove];
        if (fb?.opponentReply) {
          nextMoves = [
            ...nextMoves,
            {
              ply: nextMoves.length + 1,
              uci: fb.opponentReply.uci,
              san: fb.opponentReply.san,
              fenAfter: fb.opponentReply.fenAfter
            }
          ];
          await savePuzzleAttempt(puzzleId, attemptId, { moves: nextMoves });
        }
        setWrong(false);
        setMoves(nextMoves);
        if (fb?.lineComplete) {
          await submit(nextMoves);
        }
      } catch (error) {
        toast.error({ title: "Move rejected", message: (error as Error).message });
        setResetNonce((n) => n + 1);
      } finally {
        busy.current = false;
      }
    },
    [puzzleId, attemptId, phase, moves, submit, toast]
  );

  const giveUp = useCallback(() => submit(moves), [submit, moves]);
  const showHint = useCallback(() => setRevealedHints((n) => n + 1), []);

  return {
    session,
    startError,
    moves,
    phase,
    wrong,
    resetNonce,
    result,
    currentFen,
    revealedHints,
    begin,
    handleMove,
    submit,
    giveUp,
    showHint
  };
}
