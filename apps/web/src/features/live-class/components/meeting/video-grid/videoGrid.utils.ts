import { useEffect, useMemo, useState } from "react";
import {
  isTrackReference,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { useParticipantActivity } from "../../../hooks/useParticipantActivity";
import { compareByActivity } from "../../../lib/participantActivity";
import { isHumanParticipant } from "../../../lib/participants";

const GRID_SOURCES = [
  { source: Track.Source.Camera, withPlaceholder: true },
  { source: Track.Source.ScreenShare, withPlaceholder: false },
] as const;

// What a tile renders from the track list. Speaking / connection-quality churn
// is left out: tiles subscribe to those themselves and ordering comes from
// useParticipantActivity, so the trackRefs stay stable while people talk.
const GRID_TRACK_EVENTS: RoomEvent[] = [
  RoomEvent.ParticipantMetadataChanged,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
];

/** Camera (with placeholders) + screen-share tracks of real people. */
export function useGridTracks() {
  const tracks = useTracks([...GRID_SOURCES], {
    onlySubscribed: false,
    updateOnlyOn: GRID_TRACK_EVENTS,
  });
  return useMemo(() => tracks.filter((t) => isHumanParticipant(t.participant)), [tracks]);
}

/**
 * Live content-box size of an element, so layout can follow the real container.
 *
 * Measure an element that does NOT itself scroll — a scrollbar appearing on the
 * observed element toggles its content-box width, which re-drives the layout,
 * which toggles the scrollbar again (a ResizeObserver feedback loop that leaves
 * the grid stuck at a degenerate size).
 */
export function useElementSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ height: 0, width: 0 });
  // A callback ref, not a RefObject: the measured element mounts later than the
  // component (empty state first, tiles once someone joins), and an effect keyed
  // on a stable RefObject would never see it and leave the grid unmeasured.
  const [element, setElement] = useState<T | null>(null);

  useEffect(() => {
    if (!element) return;

    const apply = (width: number, height: number) =>
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { height, width }
      );

    // Synchronous first read so the grid never renders a frame at 0×0.
    const style = getComputedStyle(element);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const rect = element.getBoundingClientRect();
    apply(Math.max(0, rect.width - padX), Math.max(0, rect.height - padY));

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ...size, ref: setElement };
}

export function getTrackKey(trackRef: TrackReferenceOrPlaceholder) {
  return [
    trackRef.participant.identity,
    trackRef.source,
    isTrackReference(trackRef) ? trackRef.publication.trackSid : "placeholder",
  ].join(":");
}

export type GridLayout = {
  cols: number;
  rows: number;
  /** Exact tile width in px; height follows from the 16:9 aspect. */
  tileWidth: number;
};

/** Smallest tile we will shrink to before allowing the grid to scroll. */
const MIN_TILE_WIDTH = 132;

/**
 * Choose the row/column split that makes every tile as large as possible inside
 * the measured container.
 *
 * This replaces a table of hardcoded breakpoint column counts, which could not
 * know the container's actual shape: it stranded orphans (7 tiles on a wide
 * screen laid out 3/3/1) and picked portrait-phone columns that forced a scroll.
 * Driving off the real box means every count lays out correctly on every device,
 * including landscape phones and the ultrawide desktop, with no special cases.
 */
export function computeGridLayout(
  count: number,
  width: number,
  height: number,
  gap: number,
  aspect = 16 / 9
): GridLayout {
  if (count <= 0 || width <= 0 || height <= 0) {
    return { cols: 1, rows: 1, tileWidth: 0 };
  }

  let best: GridLayout = { cols: 1, rows: count, tileWidth: 0 };

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellWidth = (width - (cols - 1) * gap) / cols;
    const cellHeight = (height - (rows - 1) * gap) / rows;

    if (cellWidth <= 0 || cellHeight <= 0) continue;

    // The largest 16:9 tile that fits this cell.
    const tileWidth = Math.min(cellWidth, cellHeight * aspect);

    if (tileWidth > best.tileWidth) {
      best = { cols, rows, tileWidth };
    }
  }

  // Every split overflowed (very small container, many people): fall back to the
  // widest layout that keeps tiles legible and let the grid scroll.
  if (best.tileWidth < MIN_TILE_WIDTH) {
    const cols = Math.max(1, Math.floor((width + gap) / (MIN_TILE_WIDTH + gap)));
    const tileWidth = (width - (cols - 1) * gap) / cols;
    return { cols, rows: Math.ceil(count / cols), tileWidth };
  }

  return best;
}

/**
 * Indent for the final row, in HALF columns, so a partial row sits centred
 * under the full ones instead of hugging the left edge.
 *
 * Half columns because whole ones cannot centre every case: 7 tiles in 4
 * columns leaves 3 orphans needing half a column of indent on each side, which
 * rounds to zero and strands the row on the left. The grid is therefore built
 * with `2 * cols` tracks and each tile spans 2, making every offset an integer.
 */
export function lastRowIndent(count: number, cols: number): number {
  const orphans = count % cols;

  return orphans === 0 ? 0 : cols - orphans;
}

export function getRole(
  participant: TrackReferenceOrPlaceholder["participant"]
): string | null {
  try {
    const meta = participant.metadata ? JSON.parse(participant.metadata) : null;
    if (meta?.role) return meta.role as string;
  } catch {
    // ignore parse errors
  }
  return null;
}

/**
 * Tile order: screen shares, then the coach (students always keep the teacher
 * in view), then everyone else by live activity — speaking, hand raised,
 * spoke recently, camera/mic on (`lib/participantActivity.ts`, the same order
 * the People panel uses). Re-sorts on every active-speaker change.
 */
export function useSortedTracks(tracks: TrackReferenceOrPlaceholder[]) {
  const activity = useParticipantActivity();

  return useMemo(() => {
    const isScreen = (t: TrackReferenceOrPlaceholder) => t.source === Track.Source.ScreenShare;
    const isCoach = (t: TrackReferenceOrPlaceholder) =>
      getRole(t.participant)?.toUpperCase() === "COACH";

    return [...tracks].sort((a, b) => {
      if (isScreen(a) !== isScreen(b)) return isScreen(a) ? -1 : 1;
      if (isCoach(a) !== isCoach(b)) return isCoach(a) ? -1 : 1;
      const byActivity = compareByActivity(a.participant, b.participant, activity);
      if (byActivity !== 0) return byActivity;
      return a.source.localeCompare(b.source);
    });
  }, [activity, tracks]);
}
