"use client";

import { useCallback, useEffect } from "react";
import { useDataChannel } from "@livekit/components-react";
import { LIVE_CLASS_SCREEN_SHARE_TOPIC, screenShareRequestEventSchema } from "@nexa-chess/types";
import { toast } from "sonner";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { getScreenShareRequestList } from "../../api/live-class";

function toastId(studentId: string) {
  return `screen-share-request-${studentId}`;
}

/**
 * Coach/admin: seeds the pending+approved list from the REST endpoint (covers
 * requests that arrived before this tab connected to the room), then keeps it
 * live off the `screen_share_request` data channel the API server-injects a
 * request/resolution notice on. A student also listens, self-filtered to
 * their own request, so the toolbar reflects a coach's decision without
 * waiting on a rejoin. Must render inside both `<LiveKitRoom>` and
 * `<LiveClassProvider>`.
 */
export function ScreenShareRequestBridge({ classId }: { classId: string }) {
  const { setScreenShareRequests, upsertScreenShareRequest, setActiveSidebar } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  useEffect(() => {
    if (!isCoach) return;
    let mounted = true;
    getScreenShareRequestList(classId)
      .then((res) => {
        if (mounted) setScreenShareRequests(res.entries);
      })
      .catch(() => {
        // Best-effort seed — the data channel still keeps the list current.
      });
    return () => {
      mounted = false;
    };
  }, [classId, isCoach, setScreenShareRequests]);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      try {
        const decoded = JSON.parse(new TextDecoder().decode(msg.payload));
        const parsed = screenShareRequestEventSchema.safeParse(decoded);
        if (!parsed.success) return;
        const { type, entry } = parsed.data;

        if (isCoach) {
          // Approved rows stay in the map (unlike waiting room) — the student
          // is already in the room and the panel still needs a Revoke action.
          upsertScreenShareRequest(entry);
          if (type === "REQUESTED") {
            toast(`${entry.studentName} wants to share their screen`, {
              id: toastId(entry.studentId),
              duration: 10000,
              action: { label: "View", onClick: () => setActiveSidebar("participants") },
            });
          } else {
            toast.dismiss(toastId(entry.studentId));
          }
        } else if (entry.studentId === user?.id) {
          upsertScreenShareRequest(entry);
        }
      } catch {
        // Malformed packet — ignore.
      }
    },
    [isCoach, upsertScreenShareRequest, setActiveSidebar, user?.id],
  );

  useDataChannel(LIVE_CLASS_SCREEN_SHARE_TOPIC, onMessage);

  return null;
}
