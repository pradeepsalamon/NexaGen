"use client";

import { useMemo, useState } from "react";
import { isTrackReference, ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useSpotlightTrack } from "../../../hooks/useSpotlightTrack";
import { isHumanParticipant } from "../../../lib/participants";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { CompactVideoTile } from "../video-grid/CompactVideoTile";
import { getRole, getTrackKey, useSortedTracks } from "../video-grid/videoGrid.utils";

/**
 * Video above the classroom tabs: one large spotlight (a student sees the
 * coach unless someone shares a screen; the coach sees the class) plus a
 * filmstrip of everyone else.
 */
export function ClassroomVideo({ isCoach }: { isCoach: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  ).filter((t) => isHumanParticipant(t.participant));
  const sorted = useSortedTracks(tracks);
  const speakerSpotlight = useSpotlightTrack(null);

  const spotlight = useMemo(() => {
    if (isCoach) {
      // Watch the class, not yourself — your own camera only when you're alone.
      if (speakerSpotlight && !speakerSpotlight.participant.isLocal) return speakerSpotlight;
      return (
        tracks.find((t) => t.source === Track.Source.ScreenShare) ??
        tracks.find((t) => !t.participant.isLocal) ??
        speakerSpotlight
      );
    }
    return (
      tracks.find((t) => t.source === Track.Source.ScreenShare) ??
      tracks.find((t) => t.source === Track.Source.Camera && getRole(t.participant)?.toUpperCase() === "COACH") ??
      speakerSpotlight
    );
  }, [isCoach, speakerSpotlight, tracks]);

  const others = sorted.filter((t) => !spotlight || getTrackKey(t) !== getTrackKey(spotlight));
  const name = spotlight ? spotlight.participant.name || spotlight.participant.identity : "";
  const hasVideo = !!spotlight && isTrackReference(spotlight) && !spotlight.publication.isMuted;
  const isScreen = spotlight?.source === Track.Source.ScreenShare;

  return (
    <div className="shrink-0 border-b border-app-border/60">
      <div className="flex h-10 items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-app-muted">
          Video
          <span className="rounded-full bg-app-soft px-1.5 py-0.5 text-[10px] tabular-nums">{tracks.length}</span>
        </span>
        <SimpleTooltip label={collapsed ? "Show video" : "Hide video"}>
          <button
            type="button"
            aria-label={collapsed ? "Show video" : "Hide video"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            className="flex size-7 items-center justify-center rounded-full text-app-muted transition hover:bg-app-soft hover:text-app-text"
          >
            {collapsed ? <ChevronDown className="size-4" strokeWidth={2.5} /> : <ChevronUp className="size-4" strokeWidth={2.5} />}
          </button>
        </SimpleTooltip>
      </div>

      {!collapsed && spotlight ? (
        <div className="space-y-2 px-3 pb-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-control border border-app-border bg-app-soft"
          >
            {hasVideo ? (
              <ParticipantTile
                trackRef={spotlight}
                className={
                  isScreen
                    ? "pointer-events-none h-full w-full [&_.lk-participant-metadata]:hidden [&_.lk-video-container_video]:object-contain"
                    : "pointer-events-none h-full w-full [&_.lk-participant-metadata]:hidden [&_.lk-video-container_video]:object-cover"
                }
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ParticipantAvatar name={name} size="sm" />
              </div>
            )}
            <span className="absolute bottom-1.5 left-1.5 max-w-[80%] truncate rounded-control bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white/90">
              {isScreen ? `${name} · screen` : name}
            </span>
          </div>

          {others.length > 0 ? (
            <div className="custom-scrollbar flex gap-2 overflow-x-auto pb-1">
              {others.map((trackRef) => (
                <CompactVideoTile key={getTrackKey(trackRef)} trackRef={trackRef} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
