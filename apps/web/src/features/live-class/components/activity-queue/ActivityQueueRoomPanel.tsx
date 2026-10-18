"use client";

import { useCallback, useContext, useMemo } from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { ActivityQueueItem } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { useToast } from "@/providers/ToastProvider";
import { useActivityQueueSync } from "../../hooks/useActivityQueue";
import { useLiveClassChapters } from "../../hooks/useLiveClassChapters";
import { useLoadPuzzleOnBoard } from "../../hooks/useLoadNextPuzzle";
import { loadChapterOnBoard } from "../../lib/chapterBoard";
import { ActivityQueueManager, type RoomQueueSources } from "./ActivityQueueManager";

const sideToMove = (fen: string): "white" | "black" => (fen.split(" ")[1] === "b" ? "black" : "white");

/**
 * The coach's "Queue" tab in the live room. Adds the room-only sources (the
 * board's position, the batch's chapters) and puts each activity the class
 * moves to onto the shared board, the same way Share / Load / chapter Load do
 * — the ordinary board sync carries it to every student.
 */
export function ActivityQueueRoomPanel({ classId, onOpenResponses }: { classId: string; onOpenResponses: () => void }) {
  const store = useContext(BoardContext);
  const toast = useToast();
  const loadPuzzle = useLoadPuzzleOnBoard();
  const chapters = useLiveClassChapters(classId);
  useActivityQueueSync(classId, { isManager: true });

  const boardFen = useCallback(() => store?.getState().fen ?? null, [store]);
  const room = useMemo<RoomQueueSources>(
    () => ({
      boardFen,
      chapters: (chapters.data?.chapters ?? []).map((c) => ({ id: c.id, title: c.title }))
    }),
    [boardFen, chapters.data]
  );

  const onActivityStarted = useCallback(
    (item: ActivityQueueItem) => {
      if (!store || item.activationError) return;
      const board = store.getState();
      try {
        if (item.kind === "CHAPTER" && item.chapterState) {
          loadChapterOnBoard(board, item.chapterState);
        } else if (item.kind === "QUESTION" && item.fen) {
          board.pushHistory(item.fen, "");
          board.setOrientation(sideToMove(item.fen));
        } else if (item.kind === "PUZZLE" && item.puzzleId && loadPuzzle) {
          void loadPuzzle(item.puzzleId).catch(() => undefined);
        }
      } catch (error) {
        toast.error({ title: `Couldn't put "${item.title}" on the board`, message: (error as Error).message });
      }
    },
    [store, loadPuzzle, toast]
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <ActivityQueueManager
        classId={classId}
        room={room}
        onActivityStarted={onActivityStarted}
        questionAction={
          <Button size="sm" variant="outline" onClick={onOpenResponses}>
            <MessageCircleQuestion className="size-4" /> Open the Response tab
          </Button>
        }
      />
    </div>
  );
}
