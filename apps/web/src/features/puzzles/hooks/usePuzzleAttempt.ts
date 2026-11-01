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

/** A move the server rejected, labelled with its move number ("12. Nf3", "12… Nf3"). */
export type WrongPuzzleMove = { id: number; label: string; san: string };

function moveLabel(fen: string, san: string) {
  const [, side, , , , fullmove] = fen.split(" ");
  return `${fullmove ?? "1"}${side === "b" ? "…" : "."} ${san}`;
}

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
  const [wrongMoves, setWrongMoves] = useState<WrongPuzzleMove[]>([]);
  const [resetNonce, setResetNonce] = useState(0);
  const [revealedHints, setRevealedHints] = useState(0);
  // The server's progressive hint (piece → origin → move) for puzzles with no
  // text hints. It points at the next student move, so a played move clears it.
  const [serverHint, setServerHint] = useState<PuzzleHintResponse | null>(null);
  const [result, setResult] = useState<PuzzleAttemptResultResponse | null>(null);
  // Moves of a finished line whose submit never reached the server; kept so the
  // student can send it again instead of the attempt staying open forever.
  const [pendingSubmit, setPendingSubmit] = useState<AttemptMove[] | null>(null);
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const startedAt = useRef(Date.now());
  const busy = useRef(false);
  const queuedGiveUp = useRef(false);
  // A submit (with its retries) runs at most once at a time.
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const begin = useCallback(async () => {
    try {
      setStartError(null);
      const res = await start();
      setSession(res.attempt);
      setMoves(res.attempt.attempt.moves ?? []);
      setPhase("solving");
      setWrong(false);
      setWrongMoves([]);
      setRevealedHints(0);
      setServerHint(null);
      setResult(null);
      setPendingSubmit(null);
      queuedGiveUp.current = false;
      startedAt.current = Date.now();
    } catch (error) {
      setStartError((error as Error).message);
    }
    // `start` is expected to be a stable useCallback from the caller.
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
      if (!puzzleId || !attemptId || submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      const body = {
        moves: finalMoves,
        durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
        hintsUsed: revealedHints
      };
      // A dropped request here is the difference between "solved" and "still
      // solving" on the coach's screen, so ride out a brief network blip.
      let lastError: unknown;
      try {
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
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
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
          const fenBefore = moves.length ? moves[moves.length - 1].fenAfter : startFen;
          setWrongMoves((list) => [
            ...list,
            { id: list.length + 1, label: moveLabel(fenBefore ?? "", pmv.san), san: pmv.san }
          ]);
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
        if (queuedGiveUp.current) {
          queuedGiveUp.current = false;
          void submit(movesRef.current);
        }
      }
    },
    [puzzleId, attemptId, phase, moves, startFen, submit, toast]
  );

  // Not while a move is still being saved: queue the give-up request until the save finishes.
  const giveUp = useCallback(() => {
    if (busy.current) {
      queuedGiveUp.current = true;
      return;
    }
    return submit(movesRef.current);
  }, [submit]);
  const retrySubmit = useCallback(
    () => (pendingSubmit ? submit(pendingSubmit) : undefined),
    [submit, pendingSubmit]
  );
  const showHint = useCallback(() => setRevealedHints((n) => n + 1), []);
  /** `level` jumps straight to a hint level (2 = the piece's square); omitted, it steps up one. */
  const requestHint = useCallback(async (level?: 1 | 2 | 3) => {
    if (!puzzleId || !attemptId || phase !== "solving" || busy.current) return;
    busy.current = true;
    try {
      level ??= Math.min(3, (serverHint?.level ?? 0) + 1) as 1 | 2 | 3;
      setServerHint(await getPuzzleHint(puzzleId, attemptId, { moves, level }));
    } catch (error) {
      toast.error({ title: "Hint unavailable", message: (error as Error).message });
    } finally {
      busy.current = false;
      if (queuedGiveUp.current) {
        queuedGiveUp.current = false;
        void submit(movesRef.current);
      }
    }
  }, [puzzleId, attemptId, phase, serverHint, moves, submit, toast]);

  return {
    session,
    startError,
    moves,
    phase,
    wrong,
    wrongMoves,
    resetNonce,
    result,
    currentFen,
    revealedHints,
    begin,
    handleMove,
    pendingSubmit: pendingSubmit !== null,
    retrySubmit,
    submitting,
    submit,
    giveUp,
    showHint,
    serverHint,
    requestHint
  };
}
