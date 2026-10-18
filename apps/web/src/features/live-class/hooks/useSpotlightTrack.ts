"use client";

import { useMemo } from "react";
import { useTracks, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { isHumanParticipant } from "../lib/participants";
import { getRole, getTrackKey } from "../components/meeting/video-grid/videoGrid.utils";

/**
 * The one person worth showing in a mini player: whoever the user pinned, else
 * whoever is talking, else a screen share, else the coach, else anyone but
 * yourself. Shared by both mini-player implementations so the floating window
 * shows the same face whichever mechanism the browser gave us.
 */
export function useSpotlightTrack(pinnedKey: string | null): TrackReferenceOrPlaceholder | null {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  ).filter((t) => isHumanParticipant(t.participant));

  return useMemo(() => {
    if (tracks.length === 0) return null;

    const pinned = pinnedKey ? tracks.find((t) => getTrackKey(t) === pinnedKey) : undefined;
    if (pinned) return pinned;

    const speaking = tracks.find((t) => t.participant.isSpeaking && !t.participant.isLocal);
    if (speaking) return speaking;

    const screenShare = tracks.find((t) => t.source === Track.Source.ScreenShare);
    if (screenShare) return screenShare;

    const coach = tracks.find((t) => getRole(t.participant)?.toUpperCase() === "COACH");
    if (coach) return coach;

    return tracks.find((t) => !t.participant.isLocal) ?? tracks[0];
  }, [tracks, pinnedKey]);
}
