"use client";

import { memo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  isTrackReference,
  ParticipantTile,
  useIsMuted,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Hand, Mic, MicOff, VideoOff } from "lucide-react";
import { Track } from "livekit-client";
import { useOptionalLiveClassState } from "../../../providers/LiveClassProvider";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { TileModerationControls } from "./TileModerationControls";

/**
 * Small video tile. `strip` (default) is the fixed-size filmstrip chip;
 * `grid` fills whatever cell the panel gallery gives it (16:9), so every tile
 * in that grid is the same size whoever is in it or speaking.
 */
export const CompactVideoTile = memo(function CompactVideoTile({
  trackRef,
  variant = "strip",
  style,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  variant?: "strip" | "grid";
  /** Grid placement, e.g. indenting the first tile of a partial last row. */
  style?: CSSProperties;
}) {
  const user = useAuthStore((state) => state.user);
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const isMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const cameraOff = useIsMuted({ participant, source: Track.Source.Camera });
  const isGrid = variant === "grid";
  const handRaised = !!useOptionalLiveClassState((s) => !!s.raisedHands[participant.identity]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      style={isGrid ? { containerType: "size", ...style } : style}
      className={cn(
        "group relative flex shrink-0 items-center justify-center overflow-hidden rounded-control border bg-app-surface transition-shadow duration-150",
        // The speaking ring is an inset overlay and the border never changes
        // width, so highlighting someone can't resize their tile.
        isGrid ? "aspect-video w-full min-w-0" : "w-28 h-20 sm:w-36 sm:h-24",
        handRaised && !isScreenShare ? "border-amber-500" : isSpeaking ? "border-success" : "border-app-border/60",
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-2 ring-inset ring-success transition-opacity duration-150",
          isSpeaking ? "opacity-100" : "opacity-0",
        )}
      />
      {hasVideo ? (
        <ParticipantTile
          trackRef={trackRef}
          className={cn(
            "h-full w-full overflow-hidden rounded-control [&_.lk-participant-metadata]:hidden [&_.lk-participant-name]:hidden",
            isScreenShare
              ? "[&_.lk-video-container_video]:object-contain"
              : "[&_.lk-video-container_video]:object-cover",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-app-soft">
          <ParticipantAvatar
            name={name}
            size="sm"
            className={
              isGrid
                ? "size-[clamp(1.75rem,32cqmin,5rem)] text-[clamp(0.5625rem,11cqmin,1.5rem)]"
                : "size-7 text-[9px]"
            }
          />
        </div>
      )}

      {handRaised && !isScreenShare ? (
        <span
          className="absolute left-1 top-1 z-10 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-card"
          aria-label="Hand raised"
        >
          <Hand className="size-3" strokeWidth={2.5} />
        </span>
      ) : null}

      {/* Coach quick actions. Hover-revealed; a filmstrip tile is too small to
          carry them permanently on a phone, where the gallery and People
          panel have them. A gallery tile always shows them on touch. */}
      <div
        className={cn(
          "absolute right-1 top-1 z-10 transition-opacity duration-150",
          isGrid
            ? "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden",
        )}
      >
        <TileModerationControls participant={participant} name={name} screenShare={isScreenShare} size="sm" />
      </div>

      {/* Name pill */}
      <div className="absolute bottom-1 left-1 right-1 z-10 flex items-center gap-1 rounded-control bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
        {isMuted ? (
          <MicOff className="size-2.5 text-red-400 shrink-0" aria-label="Microphone off" />
        ) : (
          <Mic className="size-2.5 text-white/60 shrink-0" aria-label="Microphone on" />
        )}
        {isGrid && cameraOff && !isScreenShare ? (
          <VideoOff className="size-2.5 text-red-400 shrink-0" aria-label="Camera off" />
        ) : null}
        <span className="truncate text-[10px] font-medium text-white/90">
          {participant.isLocal && !isScreenShare ? "You" : name}
        </span>
      </div>
    </motion.div>
  );
});
