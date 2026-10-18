"use client";

import { useEffect, useRef } from "react";
import { useConnectionState, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { ConnectionState, Track, createLocalAudioTrack } from "livekit-client";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { isDocumentPipSupported } from "../../lib/documentPip";
import { useMediaDeviceManager } from "../../providers/MediaDeviceProvider";

/**
 * Holds a microphone capture open for the whole class — published but muted, so
 * nothing is transmitted — the way Google Meet does.
 *
 * Chrome only offers its automatic Picture-in-Picture (the mini player that
 * pops out when the tab loses focus) to a tab that is *actively capturing*
 * camera or microphone. A student who joins muted with their camera off
 * captures nothing, so without this the mini player would only ever open on a
 * manual tap. Publishing a muted mic track fixes that for everyone; the
 * toolbar's mute button then just unmutes / re-mutes this same track.
 *
 * No-op unless the browser is Chromium with Document Picture-in-Picture — the
 * only engine whose automatic PiP is capture-gated (so Safari / Firefox / phones
 * are never prompted for a mic they don't need here). Also a no-op when the
 * class forces the mic off, when a mic publication already exists (coach, or a
 * student who turned it on), or when the permission prompt is declined — in
 * which case the mini player simply stays manual.
 */
export function PipMicCaptureBridge() {
  const state = useConnectionState();
  const { localParticipant } = useLocalParticipant();
  const room = useRoomContext();
  const { settings } = useLiveClassState("settings");
  const user = useAuthStore((s) => s.user);
  const doneRef = useRef(false);
  // Wait for MediaDeviceProvider's join-time restore: it may be about to turn
  // the mic on (pre-join choice), and two captures racing would publish twice.
  const initialApplied = useMediaDeviceManager()?.initialApplied ?? true;

  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const micForcedOff = !isCoach && settings?.student.mic === "FORCED_OFF";

  useEffect(() => {
    if (doneRef.current) return;
    if (state !== ConnectionState.Connected || !localParticipant || !initialApplied) return;
    if (typeof window === "undefined" || !isDocumentPipSupported()) return;
    if (micForcedOff) return;

    const hasMic = [...localParticipant.trackPublications.values()].some(
      (pub) => pub.source === Track.Source.Microphone,
    );
    if (hasMic || localParticipant.isMicrophoneEnabled) {
      doneRef.current = true;
      return;
    }

    doneRef.current = true;
    let cancelled = false;
    let completed = false;

    void (async () => {
      try {
        // Create → mute → publish, in that order: the track never carries audio
        // to the room before it is muted, so a moment of live mic is impossible.
        // Same capture defaults as the toolbar toggle, so unmuting later uses
        // the microphone the student picked (saved device), not the OS default.
        const track = await createLocalAudioTrack(room.options.audioCaptureDefaults);
        await track.mute();
        if (cancelled) {
          track.stop();
          return;
        }
        await localParticipant.publishTrack(track);
      } catch {
        // No device, or the student declined — automatic PiP just won't apply
        // for them; the manual mini player still works.
      } finally {
        completed = true;
      }
    })();

    return () => {
      cancelled = true;
      if (!completed) {
        doneRef.current = false;
      }
    };
  }, [state, localParticipant, room, micForcedOff, initialApplied]);

  return null;
}
