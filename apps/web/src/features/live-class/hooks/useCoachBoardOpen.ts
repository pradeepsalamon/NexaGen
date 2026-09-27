import { useEffect } from "react";
import { useConnectionState, useLocalParticipant, useParticipants } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../providers/LiveClassProvider";

/**
 * Mirrors the coach's shared-board state onto students. On the single-page
 * layout the coach's board is always shared (`autoShare`), announced through
 * the `isChessboardOpen` participant attribute; everyone else watches for a
 * coach whose attribute is `"true"` (also covers the coach leaving the room,
 * which drops the board).
 */
export function useCoachBoardOpen({ autoShare }: { autoShare: boolean }) {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { isChessboardOpen, setIsChessboardOpen } = useLiveClassState();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const connected = useConnectionState() === ConnectionState.Connected;

  useEffect(() => {
    if (!isCoach || !autoShare || !connected || !localParticipant) return;
    if (!isChessboardOpen) setIsChessboardOpen(true);
    if (localParticipant.attributes?.isChessboardOpen !== "true") {
      localParticipant.setAttributes({ isChessboardOpen: "true" }).catch(console.warn);
    }
  }, [isCoach, autoShare, connected, localParticipant, isChessboardOpen, setIsChessboardOpen]);

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
