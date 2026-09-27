"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { RoomEvent, type Participant } from "livekit-client";
import { useLiveClassState } from "../providers/LiveClassProvider";
import {
  RECENT_SPEAKER_MS,
  SPEAKING_HOLD_MS,
  createSpeakerTracker,
  trackSpeakers,
  type ActivityContext,
} from "../lib/participantActivity";

/**
 * Live `ActivityContext` for `sortByActivity`: who spoke when (from LiveKit's
 * active-speaker updates) plus the room's raised hands. Re-renders on every
 * speaker change and again when a speaking hold / recent-speaker window lapses,
 * so the order settles without waiting for the next event.
 */
export function useParticipantActivity(): ActivityContext {
  const room = useRoomContext();
  const { raisedHands } = useLiveClassState();
  const tracker = useRef(createSpeakerTracker());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    // One pending timer per window, re-armed on each update (a busy class
    // fires this event constantly; a timer per event would pile up).
    const timers: Record<"hold" | "recent", number | undefined> = { hold: undefined, recent: undefined };
    const bump = () => setVersion((v) => v + 1);
    const later = (key: "hold" | "recent", ms: number) => {
      window.clearTimeout(timers[key]);
      timers[key] = window.setTimeout(bump, ms + 50);
    };

    const onSpeakers = (speakers: Participant[]) => {
      trackSpeakers(tracker.current, speakers);
      bump();
      later("hold", SPEAKING_HOLD_MS);
      later("recent", RECENT_SPEAKER_MS);
    };

    onSpeakers(room.activeSpeakers);
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers);
      window.clearTimeout(timers.hold);
      window.clearTimeout(timers.recent);
    };
  }, [room]);

  return useMemo(
    () => ({
      lastSpokeAt: new Map(tracker.current.lastSpokeAt),
      now: Date.now(),
      raisedHandAt: raisedHands,
    }),
    // `version` is the change signal for the mutable tracker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, raisedHands],
  );
}
