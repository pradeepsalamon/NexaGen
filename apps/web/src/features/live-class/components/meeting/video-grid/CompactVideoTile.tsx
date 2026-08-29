"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  isTrackReference,
  ParticipantTile,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Mic, MicOff } from "lucide-react";
import { Track } from "livekit-client";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

export const CompactVideoTile = memo(function CompactVideoTile({
  trackRef,
}: {
  trackRef: TrackReferenceOrPlaceholder;
}) {
  const user = useAuthStore((state) => state.user);
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
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
