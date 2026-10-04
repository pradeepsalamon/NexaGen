"use client";

import { useCallback, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PuzzleListQuery, PuzzleSummary } from "@nexa-chess/types";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { getPuzzle, getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { loadPuzzleCursor, savePuzzleCursor } from "../lib/puzzleCursor";
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

/**
 * Steps through the coach's current folder, by title. Ask and Load keep their
 * own place (`askedId` / `loadedId` in the cursor), so loading ahead never
 * skips a puzzle the class hasn't been asked yet.
 *
 * - `loadNext` puts the next puzzle on the shared board — no timer,
 *   leaderboard or student attempt; the coach just shows it.
 * - `askNext` / `askPrevious` share a puzzle as a live puzzle with the coach's
 *   last share options, replacing any active one, and load it on the board too.
 */
export function useLoadNextPuzzle({
  classId,
  onNoFolder
}: {
  classId: string;
  onNoFolder: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const loadOnBoard = useLoadPuzzleOnBoard();
  if (!loadOnBoard) throw new Error("useLoadNextPuzzle must be used within a BoardProvider");
  const assign = useAssignLivePuzzle(classId);
  const [loading, setLoading] = useState(false);

  const findStep = useCallback(
    async (fromId: string | null, step: 1 | -1): Promise<PuzzleSummary | null> => {
      const { folderId } = loadPuzzleCursor();
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
        toast.info({ title: "No earlier puzzle shared in this folder" });
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

  const loadNext = useCallback(async () => {
    setLoading(true);
    try {
      const next = await findStep(loadPuzzleCursor().loadedId, 1);
      if (!next) return;
      const puzzle = await loadOnBoard(next.id);
      savePuzzleCursor({ loadedId: puzzle.id });
      toast.success({ title: `Loaded: ${puzzle.title}` });
    } catch (error) {
      toast.error({ title: "Couldn't load the next puzzle", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [findStep, loadOnBoard, toast]);

  const ask = useCallback(
    async (step: 1 | -1) => {
      setLoading(true);
      try {
        let target: PuzzleSummary | null;
        try {
          target = await findStep(loadPuzzleCursor().askedId, step);
        } catch (error) {
          toast.error({ title: "Couldn't find the puzzle", message: (error as Error).message });
          return;
        }
        if (!target) return;
        const last = loadLastShareOptions();
        await assign.mutateAsync({
          puzzleId: target.id,
          durationSeconds: last.durationSeconds ? Number(last.durationSeconds) : null,
          leaderboard: last.leaderboard,
          scoring: last.scoring
        });
        savePuzzleCursor({ askedId: target.id });
        await loadOnBoard(target.id).catch(() => undefined);
      } catch {
        // Already toasted by useAssignLivePuzzle.
      } finally {
        setLoading(false);
      }
    },
    [assign, findStep, loadOnBoard, toast]
  );

  const askNext = useCallback(() => ask(1), [ask]);
  const askPrevious = useCallback(() => ask(-1), [ask]);

  return { askNext, askPrevious, loadNext, loading };
}
