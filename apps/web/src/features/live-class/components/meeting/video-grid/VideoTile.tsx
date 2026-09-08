"use client";

import { memo, useMemo, type CSSProperties } from "react";
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
import { useReducedMotion } from "../../../lib/meetingUi";
import { getRole, getTrackKey } from "./videoGrid.utils";
import { useOptionalLiveClassState } from "../../../providers/LiveClassProvider";

interface VideoTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  onPin?: (key: string) => void;
  /** Grid placement, e.g. indenting the first tile of a partial last row. */
  style?: CSSProperties;
}

export const VideoTile = memo(function VideoTile({ trackRef, onPin, style }: VideoTileProps) {
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
  // Raised hands ride a data channel, not participant attributes — see
  // `lib/handRaise.ts`. Optional: the recorder template renders tiles outside
  // the provider stack.
  const liveClassState = useOptionalLiveClassState();
  const handRaised = !!liveClassState?.raisedHands[participant.identity];
  const isLocal = participant.isLocal;
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      layout={!reducedMotion}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "group relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border bg-app-surface transition-[box-shadow,border-color] duration-200",
        isSpeaking
          ? "border-primary ring-2 ring-primary/60"
          : "border-app-border hover:border-app-border/80",
      )}
      style={{ containerType: "size", ...style }}
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
          {/* Tiles are sized in px by the grid, so the placeholder scales off
              the tile itself (cqw) rather than off viewport breakpoints. */}
          <ParticipantAvatar
            name={name}
            size="lg"
            className="size-[clamp(2rem,18cqw,6rem)] text-[clamp(0.7rem,6cqw,1.875rem)]"
          />
          <div className="flex max-w-full items-center justify-center gap-1.5 text-center">
            <p className="truncate text-xs font-medium text-app-text/80 sm:text-sm">{name}</p>
            {role && role.toUpperCase() === "COACH" && (
              <span className="shrink-0 text-app-muted text-xs font-normal">(Coach)</span>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left name pill with mic status */}
      <div className="absolute bottom-2 left-2 z-10 flex w-fit max-w-[calc(100%-3.25rem)] items-center gap-2 rounded-full border border-white/10 bg-black/60 px-2 py-1.5 pr-3 shadow-sm backdrop-blur-md">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full",
            isMuted ? "bg-red-500/20 text-red-500" : "bg-white/10 text-white/70",
          )}
          aria-label={isMuted ? "Microphone muted" : "Microphone on"}
        >
          {isMuted ? <MicOff className="size-3" /> : <Mic className="size-3" />}
        </span>

        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs font-semibold text-white/90">
          <span className="truncate">
            {isLocal && !isScreenShare
              ? "You"
              : isScreenShare
                ? `${name}'s screen`
                : name}
          </span>
          {role && role.toUpperCase() === "COACH" && !isScreenShare && (
            <span className="hidden shrink-0 font-normal text-white/70 sm:inline">(Coach)</span>
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

    </motion.div>
  );
});
