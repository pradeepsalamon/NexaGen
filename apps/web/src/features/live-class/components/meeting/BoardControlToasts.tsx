"use client";

import { useEffect, useRef } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Crown } from "lucide-react";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { boardControlSideLabel } from "./BoardControlSideToggle";
import { meetingToast } from "../../lib/meetingToasts";
import type { BoardControlSide } from "@/features/chessboard/types/sync";

/**
 * Tells a student — and only that student — when the coach hands them the
 * board or takes it back.
 *
 * The grant lands here as an `UPDATE_PERMISSIONS` packet the whole room
 * receives, so this deliberately compares against the *local* identity before
 * saying anything: a class of twenty should not watch each other's grants go by.
 * The coach clicked the control themselves and needs no echo.
 *
 * Must render inside `<BoardProvider>` and `<LiveKitRoom>`.
 */
export function BoardControlToasts() {
  const { localParticipant } = useLocalParticipant();
  const permissionMode = useBoardStore((s) => s.permissionMode);
  const selectedStudentIds = useBoardStore((s) => s.selectedStudentIds);
  const selectedStudentSides = useBoardStore((s) => s.selectedStudentSides);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const lastSide = useRef<BoardControlSide | null | undefined>(undefined);

  useEffect(() => {
    if (isCoach) return;
    const identity = localParticipant?.identity;
    if (!identity) return;

    // A grant sent without a side means "both" — older clients omitted it.
    const side: BoardControlSide | null =
      permissionMode === "SELECTED_STUDENT" && selectedStudentIds.includes(identity)
        ? selectedStudentSides[identity] ?? "both"
        : null;

    // First read after joining is the current state, not a change.
    if (lastSide.current === undefined) {
      lastSide.current = side;
      return;
    }
    if (lastSide.current === side) return;
    const previous = lastSide.current;
    lastSide.current = side;

    if (side) {
      meetingToast({
        tone: "success",
        id: "board-control",
        title: previous ? "Your board control changed" : "The coach gave you board control",
        description:
          side === "both"
            ? "You can move either colour on the shared board."
            : `You can move the ${side} pieces on their turn.`,
        icon: <Crown className="size-4" />,
      });
    } else {
      meetingToast({
        tone: "warning",
        id: "board-control",
        title: "The coach took back board control",
        description: `You had ${boardControlSideLabel(previous).toLowerCase()}.`,
        icon: <Crown className="size-4" />,
      });
    }
  }, [
    isCoach,
    localParticipant?.identity,
    permissionMode,
    selectedStudentIds,
    selectedStudentSides,
  ]);

  return null;
}
