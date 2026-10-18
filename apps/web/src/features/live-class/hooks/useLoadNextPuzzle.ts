"use client";

import { useCallback, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PuzzleListQuery, PuzzleSummary } from "@nexa-chess/types";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { getPuzzle, getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { loadPuzzleCursor, savePuzzleCursor } from "../lib/puzzleCursor";
import { claimBoardForShare, putPuzzleOnBoard } from "../lib/puzzleShare";
import { loadLastShareOptions } from "../lib/puzzleShareOptions";
import { useAssignLivePuzzle } from "./useLivePuzzle";

/**
 * Puts a puzzle's position on the shared board — a plain position, no timer or
 * attempt. Null outside a `BoardProvider` (the phone sidebar has no board).
 */
export function useLoadPuzzleOnBoard() {
  const store = useContext(BoardContext);

  const load = useCallback(
    async (puzzleId: string) => {
      const { puzzle } = await getPuzzle(puzzleId);
      if (store) {
        store.getState().pushHistory(puzzle.fen, "");
        store.getState().setOrientation(puzzle.orientation);
      }
      return puzzle;
    },
    [store]
  );
  return store ? load : null;
}

export type PuzzleStep = -1 | 1;

/**
 * Steps through the coach's current folder, by title, from ONE place in the
 * cursor — Share and Load move it alike.
 *
 * - `share(step)` shares the previous / next puzzle with the coach's last share
 *   options, replacing any active one, and loads it on the board too.
 * - `load(step)` only puts it on the shared board — no timer or leaderboard.
 * - `loadCurrent()` puts the puzzle the class is solving back on the board
 *   (after the coach moved on to something else).
 */
export function useLoadNextPuzzle({
  classId,
  activePuzzleId,
  onNoFolder
}: {
  classId: string;
  activePuzzleId: string | null;
  onNoFolder: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const store = useContext(BoardContext);
  const loadOnBoard = useLoadPuzzleOnBoard();
  if (!store || !loadOnBoard) throw new Error("useLoadNextPuzzle must be used within a BoardProvider");
  const assign = useAssignLivePuzzle(classId);
  const [loading, setLoading] = useState(false);

  const findStep = useCallback(
    async (step: PuzzleStep): Promise<PuzzleSummary | null> => {
      const { folderId, puzzleId: fromId } = loadPuzzleCursor();
      if (!folderId) {
        toast.info({ title: "Pick a folder first" });
        onNoFolder();
        return null;
      }
      const query: PuzzleListQuery = {
        topicId: folderId,
        topicScope: "direct",
        status: "PUBLISHED",
        scope: "all",
        sort: "title",
        order: "asc",
        pageSize: 100
      };
      const list = await qc.fetchQuery({
        queryKey: queryKeys.puzzles.list(query),
        queryFn: () => getPuzzles(query),
        staleTime: 30_000
      });
      const puzzles = list.puzzles;
      if (puzzles.length === 0) {
        toast.info({ title: "No published puzzles in this folder" });
        return null;
      }
      const index = fromId ? puzzles.findIndex((p) => p.id === fromId) : -1;
      if (step === -1 && index === -1) {
        toast.info({ title: "No earlier puzzle in this folder" });
        return null;
      }
      const target = puzzles[index + step];
      if (!target) {
        toast.info({ title: step === 1 ? "Last puzzle in this folder" : "First puzzle in this folder" });
        return null;
      }
      return target;
    },
    [qc, toast, onNoFolder]
  );

  const run = useCallback(async (work: () => Promise<void>) => {
    setLoading(true);
    try {
      await work();
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(
    (step: PuzzleStep) =>
      run(async () => {
        try {
          const target = await findStep(step);
          if (!target) return;
          const puzzle = await loadOnBoard(target.id);
          savePuzzleCursor({ puzzleId: puzzle.id });
          toast.success({ title: `Loaded: ${puzzle.title}` });
        } catch (error) {
          toast.error({ title: "Couldn't load the puzzle", message: (error as Error).message });
        }
      }),
    [run, findStep, loadOnBoard, toast]
  );

  const loadCurrent = useCallback(
    () =>
      run(async () => {
        if (!activePuzzleId) {
          toast.info({ title: "No puzzle is shared right now" });
          return;
        }
        try {
          const puzzle = await loadOnBoard(activePuzzleId);
          toast.success({ title: `Loaded: ${puzzle.title}` });
        } catch (error) {
          toast.error({ title: "Couldn't load the puzzle", message: (error as Error).message });
        }
      }),
    [run, activePuzzleId, loadOnBoard, toast]
  );

  const share = useCallback(
    (step: PuzzleStep) =>
      run(async () => {
        let target: PuzzleSummary | null;
        try {
          target = await findStep(step);
        } catch (error) {
          toast.error({ title: "Couldn't find the puzzle", message: (error as Error).message });
          return;
        }
        if (!target) return;
        const isNewest = claimBoardForShare(classId);
        const last = loadLastShareOptions();
        let assignment;
        try {
          ({ assignment } = await assign.mutateAsync({
            puzzleId: target.id,
            durationSeconds: last.durationSeconds ? Number(last.durationSeconds) : null,
            leaderboard: last.leaderboard,
            scoring: last.scoring
          }));
        } catch {
          return; // Already toasted by useAssignLivePuzzle.
        }
        savePuzzleCursor({ puzzleId: target.id });
        if (!assignment || !isNewest()) return;
        try {
          putPuzzleOnBoard(store, assignment.fen, assignment.orientation);
        } catch (error) {
          toast.error({ title: "Shared, but the main board couldn't show it", message: (error as Error).message });
        }
      }),
    [run, assign, findStep, store, classId, toast]
  );

  return { share, load, loadCurrent, loading };
}
