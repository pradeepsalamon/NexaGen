"use client";

import { useEffect, useMemo, useState } from "react";
import { isTrackReference, ParticipantTile } from "@livekit/components-react";
import { Track } from "livekit-client";
import { ChevronDown, ChevronUp, Hand, LayoutGrid, Maximize2, UserSquare2 } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useSpotlightTrack } from "../../../hooks/useSpotlightTrack";
import { useOptionalLiveClassState } from "../../../providers/LiveClassProvider";
import { ParticipantAvatar } from "../ParticipantAvatar";
import { CompactVideoTile } from "../video-grid/CompactVideoTile";
import { ClassroomGallery } from "./ClassroomGallery";
import { TileModerationControls } from "../video-grid/TileModerationControls";
import { getRole, getTrackKey, useGridTracks, useSortedTracks } from "../video-grid/videoGrid.utils";

type PanelVideoLayout = "gallery" | "speaker";
const LAYOUT_KEY = "nexa-live-class-panel-video-layout";
const LAYOUTS: { value: PanelVideoLayout; label: string; hint: string; Icon: typeof LayoutGrid }[] = [
  { value: "gallery", label: "Gallery", hint: "Gallery — everyone the same size", Icon: LayoutGrid },
  { value: "speaker", label: "Speaker", hint: "Speaker — one large video plus a strip", Icon: UserSquare2 }
];

/** Gallery or speaker layout for the panel video, remembered per browser. */
function usePanelVideoLayout() {
  const [layout, setLayout] = useState<PanelVideoLayout>("gallery");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(LAYOUT_KEY) === "speaker") setLayout("speaker");
    } catch {
      // per-browser convenience only
    }
  }, []);
  const choose = (next: PanelVideoLayout) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // per-browser convenience only
    }
  };
  return [layout, choose] as const;
}

/**
 * Video above the classroom tabs, in one of two layouts:
 * - **Gallery** (default): every participant in an equal tile
 *   (`ClassroomGallery`); the speaker only gets a green ring.
 * - **Speaker**: one large spotlight (a student sees the coach unless someone
 *   shares a screen; the coach sees the class) plus a filmstrip of the rest.
 * `fill` (side by side) fits either to the height the panel's resizer set.
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
  const [layout, setLayout] = usePanelVideoLayout();
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
    <div className={cn("shrink-0 border-b border-app-border/60", fill && "room:flex room:h-full room:flex-col")}>
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="flex items-center gap-1.5 text-xs font-bold text-app-muted">
          Video
          <span className="rounded-full bg-app-soft px-1.5 py-0.5 text-[10px] tabular-nums">{tracks.length}</span>
        </span>
        <div className="flex items-center gap-1">
          <div role="group" aria-label="Video layout" className="flex items-center rounded-full bg-app-soft p-0.5">
            {LAYOUTS.map(({ value, label, hint, Icon }) => (
              <SimpleTooltip key={value} label={hint}>
                <button
                  type="button"
                  aria-label={`${label} layout`}
                  aria-pressed={layout === value}
                  onClick={() => {
                    setLayout(value);
                    if (collapsed) onCollapsedChange(false);
                  }}
                  className={cn(
                    "flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold transition-colors",
                    layout === value
                      ? "bg-app-surface text-primary-ink shadow-soft"
                      : "text-app-muted hover:text-app-text"
                  )}
                >
                  <Icon className="size-3.5" strokeWidth={2.5} />
                  <span className="hidden lg:inline">{label}</span>
                </button>
              </SimpleTooltip>
            ))}
          </div>
          {onOpenGallery ? (
            <SimpleTooltip label="Show everyone on the main stage">
              <button
                type="button"
                aria-label="Show everyone on the main stage"
                onClick={onOpenGallery}
                className="flex size-7 items-center justify-center rounded-full text-app-muted transition hover:bg-app-soft hover:text-app-text"
              >
                <Maximize2 className="size-3.5" strokeWidth={2.5} />
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

      {!collapsed && layout === "gallery" && tracks.length > 0 ? (
        <div className={cn("px-3 pb-3", fill && "room:flex room:min-h-0 room:flex-1 room:flex-col")}>
          <ClassroomGallery tracks={tracks} fill={fill} />
        </div>
      ) : null}

      {!collapsed && layout === "speaker" && spotlight ? (
        <div className={cn("space-y-2 px-3 pb-3", fill && "room:flex room:min-h-0 room:flex-1 room:flex-col room:gap-2 room:space-y-0")}>
          <div
            className={cn(
              "group relative aspect-video w-full overflow-hidden rounded-control border border-app-border bg-app-soft",
              fill && "room:aspect-auto room:min-h-0 room:flex-1"
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
                className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-warning text-white shadow-card"
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
