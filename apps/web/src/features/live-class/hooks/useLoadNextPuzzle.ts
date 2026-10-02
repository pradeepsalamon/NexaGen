"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PuzzleListQuery } from "@nexa-chess/types";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { getPuzzle, getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { loadPuzzleCursor, savePuzzleCursor } from "../lib/puzzleCursor";

/**
 * Puts the next puzzle (by title) in the coach's current folder onto the shared
 * board as a plain position. Deliberately NOT a live assignment: no timer,
 * leaderboard or student attempt — the coach just shows it.
 */
export function useLoadNextPuzzle({ onNoFolder }: { onNoFolder: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const pushHistory = useBoardStore((s) => s.pushHistory);
  const setOrientation = useBoardStore((s) => s.setOrientation);
  const [loading, setLoading] = useState(false);

  const loadNext = useCallback(async () => {
    const cursor = loadPuzzleCursor();
    if (!cursor.folderId) {
      toast.info({ title: "Pick a folder first" });
      onNoFolder();
      return;
    }
    setLoading(true);
    try {
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
        return;
      }
      const index = cursor.puzzleId ? puzzles.findIndex((p) => p.id === cursor.puzzleId) : -1;
      const next = puzzles[index + 1];
      if (!next) {
        toast.info({ title: "Last puzzle in this folder" });
        return;
      }
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
  }, [qc, toast, pushHistory, setOrientation, onNoFolder]);

  return { loadNext, loading };
}
