"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { InRoomPuzzleSolver } from "./InRoomPuzzleSolver";

/**
 * The student's one in-class puzzle solver. The video-grid tile, the Puzzle
 * panel's Solve button and the "your coach shared a puzzle" toast all open this
 * same dialog (`puzzleSolverOpen` in LiveClassProvider), so a student never has
 * two boards driving one attempt. Rendered once in `MeetingRoom`.
 */
export function PuzzleSolverHost({ classId }: { classId: string }) {
  const { activePuzzle, puzzleSolverOpen, setPuzzleSolverOpen } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  if (isCoach || !activePuzzle) return null;

  return (
    <Dialog open={puzzleSolverOpen} onOpenChange={setPuzzleSolverOpen}>
      {/* No backdrop blur: blurring over live <video> flashes black on mobile GPUs. */}
      <DialogContent
        className="max-h-[92dvh] max-w-lg overflow-y-auto"
        overlayClassName="bg-black/60 backdrop-blur-none"
      >
        <DialogHeader>
          <DialogTitle>Solve the puzzle</DialogTitle>
        </DialogHeader>
        {/* Keyed by assignment so a swapped puzzle starts a fresh attempt. */}
        <InRoomPuzzleSolver
          key={activePuzzle.id}
          classId={classId}
          puzzle={activePuzzle}
          onClose={() => setPuzzleSolverOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
