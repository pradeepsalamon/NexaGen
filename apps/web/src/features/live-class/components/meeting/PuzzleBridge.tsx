"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDataChannel } from "@livekit/components-react";
import { decodeLivePuzzle, LIVE_CLASS_PUZZLE_TOPIC } from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useCountdown } from "../../hooks/useCountdown";
import { useEndLivePuzzle, useLivePuzzleState } from "../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../providers/LiveClassProvider";

/**
 * Keeps `LiveClassProvider.activePuzzle` current. Seeds from
 * `GET /live-class/:id/puzzle` on mount (the data channel has no backlog) and
 * then tracks `PUZZLE_ASSIGNED` / `PUZZLE_ENDED` packets the API injects when a
 * coach shares or ends a puzzle. Must render inside `<LiveKitRoom>` and
 * `<LiveClassProvider>`.
 */
export function PuzzleBridge({
  classId,
  autoEnd = true
}: {
  classId: string;
  /** Off in the coach's board tab, so the meeting tab alone ends a timed puzzle. */
  autoEnd?: boolean;
}) {
  const { activePuzzle, applyPuzzleAssignment, clearActivePuzzle, setPuzzleSolverOpen } =
    useLiveClassState();
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const seed = useLivePuzzleState(classId);
  useEffect(() => {
    if (seed.data) applyPuzzleAssignment(seed.data.assignment);
  }, [seed.data, applyPuzzleAssignment]);

  // A timed puzzle is ended once by the coach's client when the clock runs out,
  // regardless of which panel they're looking at (the server rejects late work
  // anyway, but this closes the assignment and broadcasts PUZZLE_ENDED).
  const endPuzzle = useEndLivePuzzle(classId);
  const { expired } = useCountdown(activePuzzle?.endsAt);
  const autoEndedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!autoEnd || !isCoach || !activePuzzle || !expired) return;
    if (autoEndedFor.current === activePuzzle.id) return;
    autoEndedFor.current = activePuzzle.id;
    endPuzzle.mutate();
  }, [autoEnd, isCoach, activePuzzle, expired, endPuzzle]);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      const decoded = decodeLivePuzzle(msg.payload);
      if (!decoded) return;
      if (decoded.type === "PUZZLE_ASSIGNED") {
        applyPuzzleAssignment(decoded.assignment);
        qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.state(classId) });
        qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
        // Straight onto the student's screen — no click-through to find it.
        if (!isCoach) setPuzzleSolverOpen(true);
      } else if (decoded.type === "PUZZLE_UPDATED") {
        applyPuzzleAssignment(decoded.assignment);
        qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
        if (!isCoach) toast.info("Your coach changed the puzzle's scoring.", { duration: 3000 });
      } else if (decoded.type === "PUZZLE_ENDED") {
        clearActivePuzzle(decoded.assignmentId);
        qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.state(classId) });
        qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
      } else {
        // LEADERBOARD_DIRTY — a peer just finished.
        qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
      }
    },
    [applyPuzzleAssignment, clearActivePuzzle, setPuzzleSolverOpen, qc, classId, isCoach]
  );

  useDataChannel(LIVE_CLASS_PUZZLE_TOPIC, onMessage);

  return null;
}
