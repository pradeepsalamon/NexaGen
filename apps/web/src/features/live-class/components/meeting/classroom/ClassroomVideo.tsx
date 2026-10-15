"use client";

import { useMemo } from "react";
import { isTrackReference, ParticipantTile } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ChevronDown, ChevronUp, Grid2x2, Hand } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useSpotlightTrack } from "../../../hooks/useSpotlightTrack";
import { useOptionalLiveClassState } from "../../../providers/LiveClassProvider";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { CompactVideoTile } from "../video-grid/CompactVideoTile";
import { TileModerationControls } from "../video-grid/TileModerationControls";
import { getRole, getTrackKey, useGridTracks, useSortedTracks } from "../video-grid/videoGrid.utils";

/**
 * Video above the classroom tabs: one large spotlight (a student sees the
 * coach unless someone shares a screen; the coach sees the class) plus a
 * filmstrip of everyone else. `fill` (lg+) stretches the spotlight to a
 * height the panel's resizer set, instead of 16:9.
 */
export function ClassroomVideo({
  isCoach,
  collapsed,
  onCollapsedChange,
  fill = false,
  onOpenGallery
}: {
  isCoach: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  fill?: boolean;
  /** Show every participant in a grid on the main stage (Gallery view). */
  onOpenGallery?: () => void;
}) {
  const tracks = useGridTracks();
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
  const spotlightIdentity = spotlight?.participant.identity;
  const spotlightHand = !!useOptionalLiveClassState((s) => !!spotlightIdentity && !!s.raisedHands[spotlightIdentity]);

  return (
    <div className={cn("shrink-0 border-b border-app-border/60", fill && "lg:flex lg:h-full lg:flex-col")}>
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-app-muted">
          Video
          <span className="rounded-full bg-app-soft px-1.5 py-0.5 text-[10px] tabular-nums">{tracks.length}</span>
        </span>
        <div className="flex items-center gap-1">
          {onOpenGallery ? (
            <SimpleTooltip label="Gallery view — everyone in a grid">
              <button
                type="button"
                aria-label="Gallery view"
                onClick={onOpenGallery}
                className="flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-app-muted transition hover:bg-app-soft hover:text-app-text"
              >
                <Grid2x2 className="size-3.5" strokeWidth={2.5} />
                Gallery
              </button>
            </SimpleTooltip>
          ) : null}
          <SimpleTooltip label={collapsed ? "Show video" : "Hide video"}>
            <button
              type="button"
              aria-label={collapsed ? "Show video" : "Hide video"}
              aria-expanded={!collapsed}
              onClick={() => onCollapsedChange(!collapsed)}
              className="flex size-7 items-center justify-center rounded-full text-app-muted transition hover:bg-app-soft hover:text-app-text"
            >
              {collapsed ? <ChevronDown className="size-4" strokeWidth={2.5} /> : <ChevronUp className="size-4" strokeWidth={2.5} />}
            </button>
          </SimpleTooltip>
        </div>
      </div>

      {!collapsed && spotlight ? (
        <div className={cn("space-y-2 px-3 pb-3", fill && "lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-2 lg:space-y-0")}>
          <div
            className={cn(
              "group relative aspect-video w-full overflow-hidden rounded-control border border-app-border bg-app-soft",
              fill && "lg:aspect-auto lg:min-h-0 lg:flex-1"
            )}
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
            {spotlightHand && !isScreen ? (
              <span
                className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-card"
                aria-label="Hand raised"
              >
                <Hand className="size-3.5" strokeWidth={2.5} />
              </span>
            ) : null}
            {spotlight && !spotlight.participant.isLocal ? (
              <div className="absolute right-1.5 top-1.5 z-10 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
                <TileModerationControls participant={spotlight.participant} name={name} screenShare={isScreen} size="sm" />
              </div>
            ) : null}
            <span className="absolute bottom-1.5 left-1.5 max-w-[80%] truncate rounded-control bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white/90">
              {isScreen ? `${name} · screen` : name}
            </span>
          </div>

          {others.length > 0 ? (
            <div className="custom-scrollbar flex shrink-0 gap-2 overflow-x-auto pb-1">
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
