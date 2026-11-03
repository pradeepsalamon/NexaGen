"use client";

import { memo, useMemo, type CSSProperties } from "react";
import { motion } from "framer-motion";
import {
  isTrackReference,
  ParticipantTile,
  useIsMuted,
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
import { TileModerationControls } from "./TileModerationControls";
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
  // Subscribed directly: a memoised tile isn't re-rendered for a mic change.
  const isMuted = useIsMuted({ participant, source: Track.Source.Microphone });
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const trackKey = useMemo(() => getTrackKey(trackRef), [trackRef]);
  const role = useMemo(() => getRole(participant), [participant]);
  const isCoachTile = !!role && role.toUpperCase() === "COACH";
  // Raised hands ride a data channel, not participant attributes — see
  // `lib/handRaise.ts`. Optional: the recorder template renders tiles outside
  // the provider stack.
  const handRaised = !!useOptionalLiveClassState((s) => !!s.raisedHands[participant.identity]);
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
        // Video tile (spec component 10): 16:9, 12px radius; speaking = green ring.
        "group relative flex aspect-video items-center justify-center overflow-hidden rounded-app border bg-brand-900 transition-[border-color] duration-200",
        isSpeaking ? "border-success" : "border-app-border",
      )}
      style={{ containerType: "size", ...style }}
    >
      {/* Inset so the parent's overflow never clips it, and it inherits the tile's radius. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-[3px] ring-inset ring-success transition-opacity duration-200",
          isSpeaking ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Video layer */}
      {hasVideo ? (
        <ParticipantTile
          trackRef={trackRef}
          className={cn(
            "h-full w-full overflow-hidden rounded-app [&_.lk-participant-metadata]:hidden [&_.lk-participant-name]:hidden",
            isScreenShare
              ? "[&_.lk-video-container_video]:object-contain"
              : "[&_.lk-video-container_video]:object-cover",
          )}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-brand-900 p-2 sm:gap-3 [@container(max-height:14rem)]:pb-11">
          {/* Tiles are sized in px by the grid, so the placeholder scales off
              the tile itself (cqmin — the smaller of its width/height) rather
              than off viewport breakpoints, and keeps growing on a large,
              mostly-empty tile instead of maxing out at a small fixed size. */}
          <ParticipantAvatar
            name={name}
            size="lg"
            className="size-[clamp(2.5rem,26cqmin,11rem)] bg-brand-700 text-[clamp(0.75rem,9cqmin,2.5rem)] [@container(max-height:8rem)]:hidden"
          />
          {/* Short tiles: the name pill already shows the name, and this would collide with it. */}
          <p className="max-w-full truncate text-center text-[clamp(0.75rem,3cqmin,1.125rem)] font-medium text-on-scrim/80 [@container(max-height:14rem)]:hidden">
            Camera off
          </p>
        </div>
      )}

      {/* Name on the scrim (fixed navy in both themes), mic state, gold Coach tag. */}
      <div className="absolute bottom-2 left-2 z-10 flex w-fit max-w-[calc(100%-3.25rem)] items-center gap-1.5 rounded-chip bg-scrim/80 py-1 pl-1.5 pr-2">
        <span
          className={cn("flex size-4 shrink-0 items-center justify-center", isMuted ? "text-on-scrim-danger" : "text-on-scrim")}
          role="img"
          aria-label={isMuted ? "Microphone muted" : "Microphone on"}
        >
          {isMuted ? <MicOff className="size-3.5" strokeWidth={2} /> : <Mic className="size-3.5" strokeWidth={2} />}
        </span>
        <span className="truncate text-xs font-semibold text-on-scrim">
          {isLocal && !isScreenShare ? "You" : isScreenShare ? `${name}'s screen` : name}
        </span>
        {isCoachTile && !isScreenShare ? (
          <span className="shrink-0 rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-on-accent">Coach</span>
        ) : null}
      </div>

      {/* Bottom-right connection quality */}
      <div className="absolute bottom-2 right-2 z-10 flex h-6 items-center justify-center rounded-chip bg-scrim/80 px-1.5">
        <NetworkQualityIndicator participant={participant} />
      </div>

      {/* Top-right controls — visible on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2.5">
        <div className="flex gap-2 items-center">
          {handRaised && (
            <span className="flex h-6 items-center gap-1 rounded-chip bg-warning px-1.5 text-xs font-semibold text-on-warning">
              <Hand aria-hidden="true" className="size-3.5" strokeWidth={2} />
              <span className="[@container(max-width:12rem)]:sr-only">Hand raised</span>
            </span>
          )}
        </div>
        <div className="flex-1" />

        {/* Coach quick actions: revealed on hover / keyboard focus where a
            pointer can hover, always shown on touch screens (no hover). */}
        <div className="flex items-center gap-1.5 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <TileModerationControls participant={participant} name={name} screenShare={isScreenShare} />
        </div>

        {onPin && (
          <button
            type="button"
            className="pointer-events-auto ml-1.5 flex size-8 items-center justify-center rounded-control bg-scrim/80 text-on-scrim transition-colors duration-150 hover:bg-scrim focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
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
