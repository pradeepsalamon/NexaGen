"use client";

import { useMemo, memo } from "react";
import { motion } from "framer-motion";
import {
  isTrackReference,
  ParticipantTile,
  useIsSpeaking,
  useConnectionQualityIndicator,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Mic, MicOff, Maximize2 } from "lucide-react";
import { Track, ConnectionQuality } from "livekit-client";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { cn } from "@/lib/utils";

interface ParticipantCardProps {
  trackRef: TrackReferenceOrPlaceholder;
  onPin?: (key: string) => void;
}

function getTrackKey(trackRef: TrackReferenceOrPlaceholder) {
  return [
    trackRef.participant.identity,
    trackRef.source,
    isTrackReference(trackRef) ? trackRef.publication.trackSid : "placeholder",
  ].join(":");
}

function getRole(participant: TrackReferenceOrPlaceholder["participant"]): string | null {
  // LiveKit metadata can carry role info
  try {
    const meta = participant.metadata ? JSON.parse(participant.metadata) : null;
    if (meta?.role) return meta.role;
  } catch {
    // ignore parse errors
  }
  return null;
}

function ConnectionIndicator({
  participant,
}: {
  participant: TrackReferenceOrPlaceholder["participant"];
}) {
  const { quality } = useConnectionQualityIndicator({ participant: participant as any });

  const isUnknown = quality === ConnectionQuality.Unknown;

  const bars = isUnknown
    ? 0
    : quality === ConnectionQuality.Excellent
      ? 3
      : quality === ConnectionQuality.Good
        ? 2
        : 1;
  const color = isUnknown
    ? "bg-white/30"
    : quality === ConnectionQuality.Poor
      ? "bg-red-500"
      : quality === ConnectionQuality.Good
        ? "bg-white/70"
        : "bg-white";

  return (
    <div className="absolute bottom-2 right-2 flex items-center justify-center rounded-full bg-black/60 p-1.5 px-2 backdrop-blur-md shadow-sm border border-white/10 z-10">
      <div className="flex items-end gap-px" title={`Connection: ${isUnknown ? "Calculating..." : quality}`}>
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={cn(
              "w-[3px] rounded-full transition-colors",
              level <= bars ? color : "bg-white/10",
              level === 1 ? "h-1.5" : level === 2 ? "h-2.5" : "h-3.5"
            )}
          />
        ))}
      </div>
    </div>
  );
}

const ParticipantCardInner = memo(function ParticipantCardInner({
  trackRef,
  onPin,
}: ParticipantCardProps) {
  const participant = trackRef.participant;
  const isSpeaking = useIsSpeaking(participant);
  const isMuted = !participant.isMicrophoneEnabled;
  const name = participant.name || participant.identity || "Unknown";
  const isScreenShare = trackRef.source === Track.Source.ScreenShare;
  const hasVideo = isTrackReference(trackRef) && !trackRef.publication.isMuted;
  const trackKey = useMemo(() => getTrackKey(trackRef), [trackRef]);
  const role = useMemo(() => getRole(participant), [participant]);
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
          : "border-app-border hover:border-app-border/80"
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
              : "[&_.lk-video-container_video]:object-cover"
          )}
        />
      ) : (
        /* Camera OFF — avatar + name + role */
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-app-soft">
          <ParticipantAvatar name={name} size="lg" />
          <div className="text-center">
            <p className="text-sm font-medium text-white/80">{name}</p>
            {role && (
              <span className="mt-0.5 inline-block rounded-full bg-[#2563EB]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2563EB]">
                {role}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left floating pill — name + mic status */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded-full bg-black/60 px-2 py-1.5 pr-3 backdrop-blur-md shadow-sm border border-white/10 z-10">
        {/* Mic indicator */}
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full",
            isMuted
              ? "bg-[#EF4444]/20 text-[#EF4444]"
              : "bg-white/10 text-white/70"
          )}
        >
          {isMuted ? (
            <MicOff className="size-3" />
          ) : (
            <Mic className="size-3" />
          )}
        </span>

        {/* Name */}
        <span className="max-w-[120px] truncate text-xs font-semibold text-white/90">
          {isLocal && !isScreenShare ? "You" : (isScreenShare ? `${name}'s screen` : name)}
        </span>
      </div>

      {/* Bottom-right connection quality */}
      <ConnectionIndicator participant={participant} />

      {/* Top-right controls — visible on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2.5">
        {/* Role badge (when video is on) */}
        {hasVideo && role && (
          <span className="rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#2563EB] backdrop-blur-sm">
            {role}
          </span>
        )}
        <div className="flex-1" />

        {/* Pin / fullscreen button */}
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
              "inset 0 0 0 2px rgba(37,99,235,0.4)",
              "inset 0 0 0 2px rgba(37,99,235,0.7)",
              "inset 0 0 0 2px rgba(37,99,235,0.4)",
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </motion.div>
  );
});

export function ParticipantCard(props: ParticipantCardProps) {
  return <ParticipantCardInner {...props} />;
}
