"use client";

import { useParticipants } from "@livekit/components-react";
import { RoomEvent } from "livekit-client";

// Who is in the room and how they are labelled — deliberately excludes
// ActiveSpeakersChanged / ConnectionQualityChanged / track events, which
// LiveKit's default fires several times a second in a talking class.
const ROSTER_EVENTS: RoomEvent[] = [
  RoomEvent.ParticipantAttributesChanged,
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.ParticipantNameChanged,
];

/**
 * `useParticipants()` for consumers that only need the roster (identity, name,
 * metadata, attributes). Use the plain hook when you render speaking or track
 * state.
 */
export function useRoster() {
  return useParticipants({ updateOnlyOn: ROSTER_EVENTS });
}
