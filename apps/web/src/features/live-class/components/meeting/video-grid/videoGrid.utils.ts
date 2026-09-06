import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { isTrackReference, type TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";

/** Live content-box size of an element, so layout can follow the real container. */
export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize((previous) =>
        previous.width === box.width && previous.height === box.height
          ? previous
          : { height: box.height, width: box.width }
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
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

export function useSortedTracks(tracks: TrackReferenceOrPlaceholder[]) {
  const speakerOrderRef = useRef<Map<string, number>>(new Map());

  return useMemo(() => {
    const now = Date.now();
    tracks.forEach((t) => {
      if (t.participant.isSpeaking) {
        speakerOrderRef.current.set(t.participant.identity, now);
      }
    });

    // Cleanup entries older than 10s
    for (const [key, time] of speakerOrderRef.current) {
      if (now - time > 10000) {
        speakerOrderRef.current.delete(key);
      }
    }

    const sorted = [...tracks].sort((a, b) => {
      const aIsScreen = a.source === Track.Source.ScreenShare;
      const bIsScreen = b.source === Track.Source.ScreenShare;
      if (aIsScreen !== bIsScreen) return aIsScreen ? -1 : 1;

      const aIsCoach = getRole(a.participant)?.toUpperCase() === "COACH";
      const bIsCoach = getRole(b.participant)?.toUpperCase() === "COACH";
      if (aIsCoach !== bIsCoach) return aIsCoach ? -1 : 1;

      const aIsSpeaking = a.participant.isSpeaking;
      const bIsSpeaking = b.participant.isSpeaking;
      if (aIsSpeaking !== bIsSpeaking) return aIsSpeaking ? -1 : 1;

      const aLastSpoke = speakerOrderRef.current.get(a.participant.identity) ?? 0;
      const bLastSpoke = speakerOrderRef.current.get(b.participant.identity) ?? 0;
      if (aLastSpoke !== bLastSpoke) return bLastSpoke - aLastSpoke;

      if (a.participant.isLocal !== b.participant.isLocal) {
        return a.participant.isLocal ? -1 : 1;
      }

      return a.participant.identity.localeCompare(b.participant.identity);
    });

    return sorted;
  }, [tracks]);
}
