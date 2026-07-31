"use client";

import { useMemo, useRef, memo } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  isTrackReference,
  useTracks,
  ParticipantTile,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Mic, MicOff, Maximize2, Minimize2, X, Pin, Hand } from "lucide-react";
import { Track } from "livekit-client";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { NetworkQualityIndicator } from "./MeetingStatus";
import { EmptyMeetingState } from "./EmptyMeetingState";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────

function getTrackKey(trackRef: TrackReferenceOrPlaceholder) {
  return [
    trackRef.participant.identity,
    trackRef.source,
    isTrackReference(trackRef) ? trackRef.publication.trackSid : "placeholder",
  ].join(":");
}

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

function getRole(participant: TrackReferenceOrPlaceholder["participant"]): string | null {
  try {
    const meta = participant.metadata ? JSON.parse(participant.metadata) : null;
    if (meta?.role) return meta.role as string;
  } catch {
    // ignore parse errors
  }
  return null;
}

function getHandRaised(participant: TrackReferenceOrPlaceholder["participant"]): boolean {
  try {
    const meta = participant.metadata ? JSON.parse(participant.metadata) : null;
    return !!meta?.handRaised;
  } catch {
    return false;
  }
}

// ─── Track Sorting ───────────────────────────────────────────

function useSortedTracks(tracks: TrackReferenceOrPlaceholder[]) {
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

// ─── Video Tile ──────────────────────────────────────────────

interface VideoTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  onPin?: (key: string) => void;
}

const VideoTile = memo(function VideoTile({ trackRef, onPin }: VideoTileProps) {
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  const isMuted = !participant.isMicrophoneEnabled;
  const name = participant.name || participant.identity || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const trackKey = useMemo(() => getTrackKey(trackRef), [trackRef]);
  const role = useMemo(() => getRole(participant), [participant]);
  const handRaised = useMemo(() => getHandRaised(participant), [participant, participant.metadata]);
  const isLocal = participant.isLocal;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{
        opacity: 1,
        scale: isSpeaking ? 1.01 : 1,
      }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border bg-app-surface transition-shadow duration-200",
        isSpeaking
          ? "border-primary/60 shadow-[0_0_24px_rgba(66,120,206,0.25),0_0_48px_rgba(66,120,206,0.08)]"
          : "border-app-border hover:border-app-border/80",
      )}
    >
      {/* Video layer */}
      {hasVideo ? (
        <ParticipantTile
          trackRef={trackRef}
          className={cn(
            "h-full w-full overflow-hidden rounded-2xl [&_.lk-participant-metadata]:hidden [&_.lk-participant-name]:hidden",
            isScreenShare
              ? "[&_.lk-video-container_video]:object-contain"
              : "[&_.lk-video-container_video]:object-cover",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-app-soft">
          <ParticipantAvatar name={name} size="lg" />
          <div className="text-center">
            <p className="text-sm font-medium text-app-text/80">{name}</p>
            {role && (
              <span className="mt-0.5 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {role}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left name pill with mic status */}
      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2 py-1.5 pr-3 shadow-sm backdrop-blur-md">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full",
            isMuted
              ? "bg-red-500/20 text-red-500"
              : "bg-white/10 text-white/70",
          )}
          aria-label={isMuted ? "Microphone muted" : "Microphone on"}
        >
          {isMuted ? <MicOff className="size-3" /> : <Mic className="size-3" />}
        </span>

        <span className="max-w-[120px] truncate text-xs font-semibold text-white/90">
          {isLocal && !isScreenShare
            ? "You"
            : isScreenShare
              ? `${name}'s screen`
              : name}
        </span>
      </div>

      {/* Bottom-right connection quality */}
      <div className="absolute bottom-2 right-2 z-10 flex items-center justify-center rounded-full border border-white/10 bg-black/60 p-1.5 px-2 shadow-sm backdrop-blur-md">
        <NetworkQualityIndicator participant={participant} />
      </div>

      {/* Top-right controls — visible on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2.5">
        <div className="flex gap-2 items-center">
          {/* Role badge (when video is on) */}
          {hasVideo && role && (
            <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary backdrop-blur-sm">
              {role}
            </span>
          )}
          {/* Hand raised indicator */}
          {handRaised && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
              <Hand className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="flex-1" />

        {/* Pin button */}
        {onPin && (
          <button
            type="button"
            className="pointer-events-auto flex size-8 items-center justify-center rounded-full border border-white/10 bg-black/50 text-white/60 opacity-0 backdrop-blur-sm transition-all duration-150 hover:bg-black/70 hover:text-white group-hover:opacity-100"
            onClick={() => onPin(trackKey)}
            aria-label={
              isScreenShare
                ? "View screen full screen"
                : "View participant full screen"
            }
          >
            <Maximize2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* Active speaker animated ring */}
      {isSpeaking && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-2xl"
          animate={{
            boxShadow: [
              "inset 0 0 0 2px rgba(66,120,206,0.4)",
              "inset 0 0 0 2px rgba(66,120,206,0.7)",
              "inset 0 0 0 2px rgba(66,120,206,0.4)",
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
});

// ─── Compact Video Tile (for filmstrip) ──────────────────────

const CompactVideoTile = memo(function CompactVideoTile({
  trackRef,
}: {
  trackRef: TrackReferenceOrPlaceholder;
}) {
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  const name = participant.name || participant.identity || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const isMuted = !participant.isMicrophoneEnabled;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-app-surface transition-shadow duration-150",
        "w-28 h-20 sm:w-36 sm:h-24",
        isSpeaking
          ? "border-primary/60 shadow-[0_0_12px_rgba(66,120,206,0.2)]"
          : "border-app-border/60",
      )}
    >
      {hasVideo ? (
        <ParticipantTile
          trackRef={trackRef}
          className={cn(
            "h-full w-full overflow-hidden rounded-xl [&_.lk-participant-metadata]:hidden [&_.lk-participant-name]:hidden",
            isScreenShare
              ? "[&_.lk-video-container_video]:object-contain"
              : "[&_.lk-video-container_video]:object-cover",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-app-soft">
          <ParticipantAvatar name={name} size="sm" className="size-7 text-[9px]" />
        </div>
      )}

      {/* Name pill */}
      <div className="absolute bottom-1 left-1 right-1 z-10 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
        {isMuted ? (
          <MicOff className="size-2.5 text-red-400 shrink-0" />
        ) : (
          <Mic className="size-2.5 text-white/60 shrink-0" />
        )}
        <span className="truncate text-[10px] font-medium text-white/90">
          {participant.isLocal && !isScreenShare ? "You" : name}
        </span>
      </div>
    </motion.div>
  );
});

// ─── Focus View (pinned / screenshare overlay) ───────────────

function FocusOverlay({
  trackRef,
  onClose,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  onClose: () => void;
}) {
  const name = trackRef.participant.name || trackRef.participant.identity || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app-background/95 p-4 backdrop-blur-md">
      <div className="relative flex h-full w-full max-w-7xl flex-col gap-3">
        {/* Header bar */}
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-app-muted">
            <Pin className="size-4" />
            <span className="font-medium">
              {isScreenShare ? `${name}'s screen` : name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface/50 px-4 py-2 text-sm font-medium text-app-text transition-colors hover:bg-app-surface"
              onClick={onClose}
            >
              <Minimize2 className="size-4" />
              Exit full screen
            </button>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
              onClick={onClose}
              aria-label="Close full screen view"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Video container */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-app-border bg-black shadow-2xl">
          <ParticipantTile
            trackRef={trackRef}
            className={cn(
              "h-full w-full overflow-hidden rounded-2xl [&_.lk-participant-metadata]:hidden",
              isScreenShare
                ? "[&_.lk-video-container_video]:object-contain"
                : "[&_.lk-video-container_video]:object-cover",
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Video Grid ─────────────────────────────────────────

export function MeetingVideoGrid({ compact = false }: { compact?: boolean }) {
  const { pinnedParticipantSid, setPinnedParticipantSid } = useLiveClassState();

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const sortedTracks = useSortedTracks(tracks);

  const fullscreenTrack = useMemo(
    () =>
      pinnedParticipantSid
        ? tracks.find((trackRef) => getTrackKey(trackRef) === pinnedParticipantSid) ?? null
        : null,
    [pinnedParticipantSid, tracks],
  );

  const gridClasses = useMemo(
    () => getGridClasses(sortedTracks.length),
    [sortedTracks.length],
  );

  if (sortedTracks.length === 0 && !compact) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <EmptyMeetingState />
      </div>
    );
  }

  // ─── Compact Filmstrip Mode ──────────────────────────────────
  if (compact) {
    if (sortedTracks.length === 0) return null;

    return (
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto custom-scrollbar">
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {sortedTracks.map((trackRef) => (
              <CompactVideoTile key={getTrackKey(trackRef)} trackRef={trackRef} />
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full w-full items-center justify-center p-3 pb-20 sm:p-4 sm:pb-24">
        <LayoutGroup>
          <div
            className={cn(
              "grid w-full gap-2.5 auto-rows-fr sm:gap-3",
              gridClasses,
              sortedTracks.length <= 2 && "mx-auto max-w-5xl",
              sortedTracks.length <= 4 && sortedTracks.length > 2 && "mx-auto max-w-6xl",
            )}
            style={{ maxHeight: "100%" }}
          >
            <AnimatePresence mode="popLayout">
              {sortedTracks.map((trackRef) => (
                <VideoTile
                  key={getTrackKey(trackRef)}
                  trackRef={trackRef}
                  onPin={setPinnedParticipantSid}
                />
              ))}
            </AnimatePresence>
          </div>
        </LayoutGroup>
      </div>

      {/* Fullscreen / Focus overlay */}
      <AnimatePresence>
        {fullscreenTrack && (
          <FocusOverlay
            trackRef={fullscreenTrack}
            onClose={() => setPinnedParticipantSid(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
