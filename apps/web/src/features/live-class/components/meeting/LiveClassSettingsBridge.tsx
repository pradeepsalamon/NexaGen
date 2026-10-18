"use client";

import { useCallback } from "react";
import { useDataChannel } from "@livekit/components-react";
import { LIVE_CLASS_SETTINGS_TOPIC, liveClassSettingsMessageSchema } from "@nexa-chess/types";
import { toast } from "sonner";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";

/**
 * Listens for the API-injected `SETTINGS_UPDATE` packet a coach's mid-class
 * change triggers and feeds it into `LiveClassProvider`, so the mic / camera /
 * screen-share locks and the board default re-derive without a rejoin. The
 * matching LiveKit token grants are pushed server-side in the same operation.
 * Must render inside both `<LiveKitRoom>` and `<LiveClassProvider>`.
 */
export function LiveClassSettingsBridge() {
  const { applySettingsUpdate } = useLiveClassState("applySettingsUpdate");
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      // Only the API sends these; a participant-sent packet is ignored.
      if (msg.from) return;
      try {
        const decoded = JSON.parse(new TextDecoder().decode(msg.payload));
        const parsed = liveClassSettingsMessageSchema.safeParse(decoded);
        if (!parsed.success) return;
        applySettingsUpdate(parsed.data.settings);
        if (!isCoach) {
          toast.info("Your coach updated the class settings.");
        }
      } catch {
        // Malformed packet — ignore.
      }
    },
    [applySettingsUpdate, isCoach],
  );

  useDataChannel(LIVE_CLASS_SETTINGS_TOPIC, onMessage);

  return null;
}
