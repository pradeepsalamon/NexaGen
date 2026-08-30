"use client";

import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import {
  isTrackReference,
  ParticipantTile,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Hand, Maximize2, Mic, MicOff } from "lucide-react";
import { Track } from "livekit-client";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { NetworkQualityIndicator } from "../MeetingStatus";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";
import { getHandRaised, getRole, getTrackKey } from "./videoGrid.utils";

interface VideoTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  onPin?: (key: string) => void;
  /** Fill the grid cell instead of locking a 16:9 box (used when the grid is
   *  sized to fit the viewport — small participant counts / short screens). */
  fill?: boolean;
}

export const VideoTile = memo(function VideoTile({ trackRef, onPin, fill }: VideoTileProps) {
  const user = useAuthStore((state) => state.user);
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  const isMuted = !participant.isMicrophoneEnabled;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const trackKey = useMemo(() => getTrackKey(trackRef), [trackRef]);
  const role = useMemo(() => getRole(participant), [participant]);
  const handRaised = getHandRaised(participant);
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
        "group relative flex items-center justify-center overflow-hidden rounded-2xl border bg-app-surface transition-shadow duration-200",
        fill ? "aspect-video max-lg:aspect-auto max-lg:h-full max-lg:w-full max-lg:min-h-0" : "aspect-video",
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
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-app-soft p-2 sm:gap-3">
          <ParticipantAvatar
            name={name}
            size="lg"
            className={cn(fill && "size-12 text-base sm:size-16 lg:size-24 lg:text-3xl")}
          />
          {/* On small fill tiles the bottom-left pill already carries the name —
              keep the placeholder from crowding it. */}
          <div
            className={cn(
              "max-w-full items-center justify-center gap-1.5 text-center",
              fill ? "hidden lg:flex" : "flex",
            )}
          >
            <p className="truncate text-xs font-medium text-app-text/80 sm:text-sm">{name}</p>
            {role && role.toUpperCase() === "COACH" && (
              <span className="shrink-0 text-app-muted text-xs font-normal">(Coach)</span>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left name pill with mic status */}
      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2 py-1.5 pr-3 shadow-sm backdrop-blur-md">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full",
            isMuted ? "bg-red-500/20 text-red-500" : "bg-white/10 text-white/70",
          )}
          aria-label={isMuted ? "Microphone muted" : "Microphone on"}
        >
          {isMuted ? <MicOff className="size-3" /> : <Mic className="size-3" />}
        </span>

        <span className="max-w-[160px] flex items-center gap-1.5 truncate text-xs font-semibold text-white/90">
          <span className="truncate">
            {isLocal && !isScreenShare
              ? "You"
              : isScreenShare
                ? `${name}'s screen`
                : name}
          </span>
          {role && role.toUpperCase() === "COACH" && !isScreenShare && (
            <span className="text-white/70 font-normal shrink-0">(Coach)</span>
          )}
        </span>
      </div>

      {/* Bottom-right connection quality */}
      <div className="absolute bottom-2 right-2 z-10 flex items-center justify-center rounded-full border border-white/10 bg-black/60 p-1.5 px-2 shadow-sm backdrop-blur-md">
        <NetworkQualityIndicator participant={participant} />
      </div>

      {/* Top-right controls — visible on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2.5">
        <div className="flex gap-2 items-center">
          {handRaised && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
              <Hand className="h-3 w-3" />
            </span>
          )}
        </div>
        <div className="flex-1" />

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
