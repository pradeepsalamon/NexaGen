"use client";

import { useCallback, useEffect } from "react";
import { useDataChannel } from "@livekit/components-react";
import { LIVE_CLASS_WAITING_ROOM_TOPIC, waitingRoomEventSchema } from "@nexa-chess/types";
import { toast } from "sonner";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { getWaitingRoomList } from "../../api/live-class";

function toastId(studentId: string) {
  return `waiting-room-${studentId}`;
}

/**
 * Coach/admin only: seeds the pending-admission list from the REST endpoint
 * (covers requests that arrived before this tab connected to the room), then
 * keeps it live off the `waiting_room` data channel the API server-injects a
 * request/resolution notice on. A student never listens here — they aren't
 * in the room yet while pending. Must render inside both `<LiveKitRoom>` and
 * `<LiveClassProvider>`.
 */
export function WaitingRoomBridge({ classId }: { classId: string }) {
  const { setWaitingRoomEntries, upsertWaitingRoomEntry, removeWaitingRoomEntry, setActiveSidebar } =
    useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  useEffect(() => {
    if (!isCoach) return;
    let mounted = true;
    getWaitingRoomList(classId)
      .then((res) => {
        if (mounted) setWaitingRoomEntries(res.entries);
      })
      .catch(() => {
        // Best-effort seed — the data channel still keeps the list current.
      });
    return () => {
      mounted = false;
    };
  }, [classId, isCoach, setWaitingRoomEntries]);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      if (!isCoach) return;
      try {
        const decoded = JSON.parse(new TextDecoder().decode(msg.payload));
        const parsed = waitingRoomEventSchema.safeParse(decoded);
        if (!parsed.success) return;
        const { type, entry } = parsed.data;

        if (type === "JOIN_REQUESTED") {
          upsertWaitingRoomEntry(entry);
          toast(`${entry.studentName} wants to join`, {
            id: toastId(entry.studentId),
            duration: 10000,
            action: { label: "View", onClick: () => setActiveSidebar("participants") },
          });
        } else {
          removeWaitingRoomEntry(entry.studentId);
          toast.dismiss(toastId(entry.studentId));
        }
      } catch {
        // Malformed packet — ignore.
      }
    },
    [isCoach, upsertWaitingRoomEntry, removeWaitingRoomEntry, setActiveSidebar],
  );

  useDataChannel(LIVE_CLASS_WAITING_ROOM_TOPIC, onMessage);

  return null;
}
