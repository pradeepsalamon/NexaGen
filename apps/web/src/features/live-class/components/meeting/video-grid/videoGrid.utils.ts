import { useMemo, useRef } from "react";
import { isTrackReference, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";

export function getTrackKey(trackRef: TrackReferenceOrPlaceholder) {
  return [
    trackRef.participant.identity,
    trackRef.source,
    isTrackReference(trackRef) ? trackRef.publication.trackSid : "placeholder",
  ].join(":");
}

export function getGridClasses(count: number): string {
  if (count === 0) return "";
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  // 3 on a phone: two columns rather than a tall single-column scroll.
  if (count === 3) return "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3";
  if (count === 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
  if (count <= 9) return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
}

export function getRole(
  participant: TrackReferenceOrPlaceholder["participant"]
): string | null {
  try {
    const meta = participant.metadata ? JSON.parse(participant.metadata) : null;
    if (meta?.role) return meta.role as string;
  } catch {
    // ignore parse errors
  }
  return null;
}

export function getHandRaised(
  participant: TrackReferenceOrPlaceholder["participant"]
): boolean {
  return participant.attributes?.handRaised === "true";
}

export function useSortedTracks(tracks: TrackReferenceOrPlaceholder[]) {
  const speakerOrderRef = useRef<Map<string, number>>(new Map());

  return useMemo(() => {
    const now = Date.now();
    tracks.forEach((t) => {
      if (t.participant.isSpeaking) {
        speakerOrderRef.current.set(t.participant.identity, now);
      }
    });

    // Cleanup entries older than 10s
    for (const [key, time] of speakerOrderRef.current) {
      if (now - time > 10000) {
        speakerOrderRef.current.delete(key);
      }
    }

    const sorted = [...tracks].sort((a, b) => {
      const aIsScreen = a.source === Track.Source.ScreenShare;
      const bIsScreen = b.source === Track.Source.ScreenShare;
      if (aIsScreen !== bIsScreen) return aIsScreen ? -1 : 1;

      const aIsCoach = getRole(a.participant)?.toUpperCase() === "COACH";
      const bIsCoach = getRole(b.participant)?.toUpperCase() === "COACH";
      if (aIsCoach !== bIsCoach) return aIsCoach ? -1 : 1;

      const aIsSpeaking = a.participant.isSpeaking;
      const bIsSpeaking = b.participant.isSpeaking;
      if (aIsSpeaking !== bIsSpeaking) return aIsSpeaking ? -1 : 1;

      const aLastSpoke = speakerOrderRef.current.get(a.participant.identity) ?? 0;
      const bLastSpoke = speakerOrderRef.current.get(b.participant.identity) ?? 0;
      if (aLastSpoke !== bLastSpoke) return bLastSpoke - aLastSpoke;

      if (a.participant.isLocal !== b.participant.isLocal) {
        return a.participant.isLocal ? -1 : 1;
      }

      return a.participant.identity.localeCompare(b.participant.identity);
    });

    return sorted;
  }, [tracks]);
}
