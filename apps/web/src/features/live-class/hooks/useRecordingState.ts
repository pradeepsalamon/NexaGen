"use client";

import { useCallback, useEffect } from "react";
import { useDataChannel, useIsRecording } from "@livekit/components-react";
import {
  LIVE_CLASS_RECORDING_TOPIC,
  type RecordingStateNotice,
} from "@nexa-chess/types";
import { useOptionalLiveClassState } from "../providers/LiveClassProvider";

/**
 * Effective "is this class being recorded". LiveKit's `isRecording` only turns
 * off once egress has finalized the file, so a stop would linger for many
 * seconds; the API's RECORDING_STATE packet (and the coach's own click) set an
 * override that wins until LiveKit agrees.
 */
export function useRecordingState() {
  const lkRecording = useIsRecording();
  const override = useOptionalLiveClassState((s) => s.recordingOverride) ?? null;
  const setOverride = useOptionalLiveClassState((s) => s.setRecordingOverride);

  const onNotice = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      // Only the API sends these; a participant-sent packet is ignored.
      if (msg.from) return;
      try {
        const notice = JSON.parse(new TextDecoder().decode(msg.payload)) as RecordingStateNotice;
        if (notice?.type === "RECORDING_STATE" && typeof notice.recording === "boolean") {
          setOverride?.(notice.recording);
        }
      } catch {
        // Malformed packet — LiveKit's own flag still applies.
      }
    },
    [setOverride],
  );
  useDataChannel(LIVE_CLASS_RECORDING_TOPIC, onNotice);

  useEffect(() => {
    if (override !== null && override === lkRecording) setOverride?.(null);
  }, [override, lkRecording, setOverride]);

  return {
    isRecording: override ?? lkRecording,
    setRecordingOverride: setOverride,
  };
}
