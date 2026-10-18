"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AssignLivePuzzleRequest, LivePuzzleAssignment } from "@nexa-chess/types";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { materialiseCatalogPuzzle } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { claimBoardForShare, putPuzzleOnBoard } from "../lib/puzzleShare";
import { useAssignLivePuzzle } from "./useLivePuzzle";

export type ShareTarget = { puzzleId: string } | { catalogSourceId: string };
export type ShareOptions = Omit<AssignLivePuzzleRequest, "puzzleId">;

/**
 * Share a puzzle with the class AND put it on the coach's shared board, as one
 * awaited flow. Sharing makes the coach's stage switch to "Live boards", which
 * unmounts the dialog that started it — so nothing here may hang off a
 * component-scoped callback (a `mutate(…, { onSuccess })` is dropped on
 * unmount, which is exactly how the board load used to get lost).
 *
 * A catalogue puzzle is materialised to its library copy first. The board gets
 * the position the API actually assigned (`assignment.fen` / `orientation`),
 * and only if no newer share has started since. Resolves to the assignment, or
 * null when the share failed (already reported).
 */
export function useSharePuzzleWithClass(classId: string) {
  const store = useContext(BoardContext);
  const assign = useAssignLivePuzzle(classId);
  const qc = useQueryClient();
  const toast = useToast();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const share = useCallback(
    async (target: ShareTarget, options: ShareOptions): Promise<LivePuzzleAssignment | null> => {
      const isNewest = claimBoardForShare(classId);
      setPendingKey("puzzleId" in target ? target.puzzleId : target.catalogSourceId);
      try {
        let puzzleId: string;
        if ("puzzleId" in target) {
          puzzleId = target.puzzleId;
        } else {
          try {
            ({ puzzleId } = await materialiseCatalogPuzzle(target.catalogSourceId));
            void qc.invalidateQueries({ queryKey: queryKeys.puzzles.topics });
          } catch (error) {
            toast.error({ title: "Couldn't share this puzzle", message: (error as Error).message });
            return null;
          }
        }

        let assignment: LivePuzzleAssignment | null;
        try {
          ({ assignment } = await assign.mutateAsync({ ...options, puzzleId }));
        } catch {
          return null; // useAssignLivePuzzle already reported it
        }
        if (!assignment) return null;

        if (store && isNewest()) {
          try {
            putPuzzleOnBoard(store, assignment.fen, assignment.orientation);
          } catch (error) {
            toast.error({
              title: "Shared, but the main board couldn't show it",
              message: (error as Error).message
            });
          }
        }
        return assignment;
      } finally {
        if (mounted.current) setPendingKey(null);
      }
    },
    [classId, store, assign, qc, toast]
  );

  return { pendingKey, share, sharing: pendingKey !== null };
}
