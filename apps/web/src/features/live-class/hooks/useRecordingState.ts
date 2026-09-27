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
  const ctx = useOptionalLiveClassState();
  const override = ctx?.recordingOverride ?? null;
  const setOverride = ctx?.setRecordingOverride;

  const onNotice = useCallback(
    (msg: { payload: Uint8Array }) => {
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
