import { useEffect } from "react";
import { useParticipants } from "@livekit/components-react";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../providers/LiveClassProvider";

/**
 * Mirrors the coach's shared-board state onto students. The coach controls
 * their own `isChessboardOpen`; everyone else watches for a coach participant
 * whose `isChessboardOpen` attribute is `"true"` (also covers the coach leaving
 * the room, which drops the board).
 */
export function useCoachBoardOpen() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { setIsChessboardOpen } = useLiveClassState();
  const participants = useParticipants();

  useEffect(() => {
    if (isCoach) return;

    const openByCoach = participants.some((p) => {
      let coachRole = false;
      try {
        if (p.metadata) {
          const meta = JSON.parse(p.metadata);
          coachRole = meta.role === "COACH" || isStaffRole(meta.role);
        }
      } catch {
        // ignore malformed metadata
      }
      return coachRole && p.attributes?.isChessboardOpen === "true";
    });

    setIsChessboardOpen(openByCoach);
  }, [participants, isCoach, setIsChessboardOpen]);
}
