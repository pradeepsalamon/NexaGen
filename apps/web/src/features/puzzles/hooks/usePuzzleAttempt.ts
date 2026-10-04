"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AttemptMove,
  PuzzleAttemptResultResponse,
  PuzzleHintResponse,
  StartPuzzleAttemptResponse
} from "@nexa-chess/types";
import type { PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { useToast } from "@/providers/ToastProvider";
import { getPuzzleHint, savePuzzleAttempt, submitPuzzleAttempt } from "../api/puzzleApi";
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
  // The server's progressive hint (piece → origin → move) for puzzles with no
  // text hints. It points at the next student move, so a played move clears it.
  const [serverHint, setServerHint] = useState<PuzzleHintResponse | null>(null);
  const [result, setResult] = useState<PuzzleAttemptResultResponse | null>(null);
  // Moves of a finished line whose submit never reached the server; kept so the
  // student can send it again instead of the attempt staying open forever.
  const [pendingSubmit, setPendingSubmit] = useState<AttemptMove[] | null>(null);
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
      setServerHint(null);
      setResult(null);
      setPendingSubmit(null);
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
      const body = {
        moves: finalMoves,
        durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
        hintsUsed: revealedHints
      };
      // A dropped request here is the difference between "solved" and "still
      // solving" on the coach's screen, so ride out a brief network blip.
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const res = await submitPuzzleAttempt(puzzleId, attemptId, body);
          setPendingSubmit(null);
          setResult(res);
          setPhase("done");
          return res;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await new Promise((r) => window.setTimeout(r, 800 * (attempt + 1)));
        }
      }
      setPendingSubmit(finalMoves);
      toast.error({ title: "Could not submit", message: (lastError as Error).message });
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
        setServerHint(null);
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
  const retrySubmit = useCallback(
    () => (pendingSubmit ? submit(pendingSubmit) : undefined),
    [submit, pendingSubmit]
  );
  const showHint = useCallback(() => setRevealedHints((n) => n + 1), []);
  const requestHint = useCallback(async () => {
    if (!puzzleId || !attemptId || phase !== "solving" || busy.current) return;
    busy.current = true;
    try {
      const level = Math.min(3, (serverHint?.level ?? 0) + 1);
      setServerHint(await getPuzzleHint(puzzleId, attemptId, { moves, level }));
    } catch (error) {
      toast.error({ title: "Hint unavailable", message: (error as Error).message });
    } finally {
      busy.current = false;
    }
  }, [puzzleId, attemptId, phase, serverHint, moves, toast]);

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
    pendingSubmit: pendingSubmit !== null,
    retrySubmit,
    submit,
    giveUp,
    showHint,
    serverHint,
    requestHint
  };
}
