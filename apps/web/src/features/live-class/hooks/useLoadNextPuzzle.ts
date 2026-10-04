"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PuzzleListQuery, PuzzleSummary } from "@nexa-chess/types";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { getPuzzle, getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { loadPuzzleCursor, savePuzzleCursor } from "../lib/puzzleCursor";
import { loadLastShareOptions } from "../lib/puzzleShareOptions";
import { useAssignLivePuzzle } from "./useLivePuzzle";

/**
 * Steps through the coach's current folder, by title, from the last puzzle
 * shared or loaded.
 *
 * - `loadNext` puts it on the shared board as a plain position — no timer,
 *   leaderboard or student attempt; the coach just shows it.
 * - `askNext` shares it as a live puzzle with the coach's last share options
 *   (the same ones the Ask dialog remembers), replacing any active one.
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
  const pushHistory = useBoardStore((s) => s.pushHistory);
  const setOrientation = useBoardStore((s) => s.setOrientation);
  const assign = useAssignLivePuzzle(classId);
  const [loading, setLoading] = useState(false);

  const findNext = useCallback(async (): Promise<PuzzleSummary | null> => {
    const cursor = loadPuzzleCursor();
    if (!cursor.folderId) {
      toast.info({ title: "Pick a folder first" });
      onNoFolder();
      return null;
    }
    const query: PuzzleListQuery = {
      topicId: cursor.folderId,
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
    const index = cursor.puzzleId ? puzzles.findIndex((p) => p.id === cursor.puzzleId) : -1;
    const next = puzzles[index + 1];
    if (!next) {
      toast.info({ title: "Last puzzle in this folder" });
      return null;
    }
    return next;
  }, [qc, toast, onNoFolder]);

  const loadNext = useCallback(async () => {
    setLoading(true);
    try {
      const next = await findNext();
      if (!next) return;
      const { puzzle } = await getPuzzle(next.id);
      pushHistory(puzzle.fen, "");
      setOrientation(puzzle.orientation);
      savePuzzleCursor({ puzzleId: puzzle.id });
      toast.success({ title: `Loaded: ${puzzle.title}` });
    } catch (error) {
      toast.error({ title: "Couldn't load the next puzzle", message: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, [findNext, pushHistory, setOrientation, toast]);

  const askNext = useCallback(async () => {
    setLoading(true);
    try {
      let next: PuzzleSummary | null;
      try {
        next = await findNext();
      } catch (error) {
        toast.error({ title: "Couldn't find the next puzzle", message: (error as Error).message });
        return;
      }
      if (!next) return;
      const last = loadLastShareOptions();
      await assign.mutateAsync({
        puzzleId: next.id,
        durationSeconds: last.durationSeconds ? Number(last.durationSeconds) : null,
        leaderboard: last.leaderboard,
        scoring: last.scoring
      });
      savePuzzleCursor({ puzzleId: next.id });
    } catch {
      // Already toasted by useAssignLivePuzzle.
    } finally {
      setLoading(false);
    }
  }, [assign, findNext, toast]);

  return { askNext, loadNext, loading };
}
