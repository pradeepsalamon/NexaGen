"use client";

import { useMemo, useRef } from "react";
import { AnimatePresence, LayoutGroup } from "framer-motion";
import {
  isTrackReference,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Minimize2, X } from "lucide-react";
import { Track } from "livekit-client";
import { ParticipantTile } from "@livekit/components-react";
import { ParticipantCard } from "./ParticipantCard";
import { EmptyMeetingState } from "./EmptyMeetingState";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { cn } from "@/lib/utils";

function getTrackKey(trackRef: TrackReferenceOrPlaceholder) {
  return [
    trackRef.participant.identity,
    trackRef.source,
    isTrackReference(trackRef) ? trackRef.publication.trackSid : "placeholder",
  ].join(":");
}

/**
 * Determine responsive grid classes based on participant count.
 * Designed to fill available space without leaving large empty areas.
 */
function getGridClasses(count: number): string {
  if (count === 0) return "";
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  if (count === 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3";
  if (count <= 9) return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
}

/**
 * Sort tracks by priority:
 * 1. Screen shares always first
 * 2. Active speakers (recently speaking)
 * 3. Local participant
 * 4. Everyone else (stable order by identity)
 */
function useSortedTracks(tracks: TrackReferenceOrPlaceholder[]) {
  // Keep a ref of recent speaker order so we don't cause jumps
  const speakerOrderRef = useRef<Map<string, number>>(new Map());

  return useMemo(() => {
    // Update speaker tracking
    const now = Date.now();
    tracks.forEach((t) => {
      if (t.participant.isSpeaking) {
        speakerOrderRef.current.set(t.participant.identity, now);
      }
    });

    // Cleanup old entries (older than 10s)
    for (const [key, time] of speakerOrderRef.current) {
      if (now - time > 10000) {
        speakerOrderRef.current.delete(key);
      }
    }

    const sorted = [...tracks].sort((a, b) => {
      const aIsScreen = a.source === Track.Source.ScreenShare;
      const bIsScreen = b.source === Track.Source.ScreenShare;
      if (aIsScreen !== bIsScreen) return aIsScreen ? -1 : 1;

      const aIsSpeaking = a.participant.isSpeaking;
      const bIsSpeaking = b.participant.isSpeaking;
      if (aIsSpeaking !== bIsSpeaking) return aIsSpeaking ? -1 : 1;

      // Recent speaker priority
      const aLastSpoke = speakerOrderRef.current.get(a.participant.identity) ?? 0;
      const bLastSpoke = speakerOrderRef.current.get(b.participant.identity) ?? 0;
      if (aLastSpoke !== bLastSpoke) return bLastSpoke - aLastSpoke;

      // Local user next
      if (a.participant.isLocal !== b.participant.isLocal) {
        return a.participant.isLocal ? -1 : 1;
      }

      // Stable fallback
      return a.participant.identity.localeCompare(b.participant.identity);
    });

    return sorted;
  }, [tracks]);
}

export function ParticipantGrid() {
  const { pinnedParticipantSid, setPinnedParticipantSid } =
    useLiveClassState();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const sortedTracks = useSortedTracks(tracks);

  const fullscreenTrack = useMemo(
    () =>
      pinnedParticipantSid
        ? tracks.find(
            (trackRef) => getTrackKey(trackRef) === pinnedParticipantSid
          ) ?? null
        : null,
    [pinnedParticipantSid, tracks]
  );

  const gridClasses = useMemo(
    () => getGridClasses(sortedTracks.length),
    [sortedTracks.length]
  );

  // No participants at all
  if (sortedTracks.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyMeetingState />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full items-center justify-center p-3 sm:p-4 pb-20 sm:pb-24">
        <LayoutGroup>
          <div
            className={cn(
              "grid w-full gap-2.5 sm:gap-3",
              gridClasses,
              // Auto-size rows to fill height
              "auto-rows-fr",
              // Constrain max size for low participant counts
              sortedTracks.length <= 2 && "max-w-5xl mx-auto",
              sortedTracks.length <= 4 && sortedTracks.length > 2 && "max-w-6xl mx-auto"
            )}
            style={{
              // Limit grid height to available space
              maxHeight: "100%",
            }}
          >
            <AnimatePresence mode="popLayout">
              {sortedTracks.map((trackRef) => (
                <ParticipantCard
                  key={getTrackKey(trackRef)}
                  trackRef={trackRef}
                  onPin={(key) => setPinnedParticipantSid(key)}
                />
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      </div>

      {/* Fullscreen overlay */}
      <AnimatePresence>
        {fullscreenTrack && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-background/95 p-4 backdrop-blur-md">
            <div className="relative flex h-full w-full max-w-7xl flex-col gap-3">
              <div className="flex shrink-0 items-center justify-end gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface/50 px-4 py-2 text-sm font-medium text-app-text transition-colors hover:bg-app-surface"
                  onClick={() => setPinnedParticipantSid(null)}
                >
                  <Minimize2 className="size-4" />
                  Exit full screen
                </button>
                <button
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
                  onClick={() => setPinnedParticipantSid(null)}
                  aria-label="Close full screen view"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-app-border bg-black shadow-2xl">
                <ParticipantTile
                  trackRef={fullscreenTrack}
                  className={cn(
                    "h-full w-full overflow-hidden rounded-2xl",
                    fullscreenTrack.source === Track.Source.ScreenShare
                      ? "[&_.lk-video-container_video]:object-contain"
                      : "[&_.lk-video-container_video]:object-cover"
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
