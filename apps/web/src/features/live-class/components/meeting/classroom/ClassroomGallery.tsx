"use client";

import { useMemo, type CSSProperties } from "react";
import type { TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { CompactVideoTile } from "../video-grid/CompactVideoTile";
import {
  balancedGridColumns,
  computeGridLayout,
  getTrackKey,
  lastRowIndent,
  useElementSize,
  useStableTracks
} from "../video-grid/videoGrid.utils";

/** Matches `gap-2`; the layout maths needs it as a number. */
const GAP = 8;
/** A panel tile narrower than this stops being recognisable. */
const MIN_TILE = 120;
/** `scrollbar-gutter: stable` keeps room for the thin scrollbar either way. */
const SCROLLBAR_GUTTER = 10;
const SPAN_TWO: CSSProperties = { gridColumn: "span 2" };

/**
 * Gallery view of the class panel's video: every participant — coach,
 * students, screen shares — in one tile of exactly the same size.
 *
 * The split comes from the measured box, not breakpoints. With `fill` (lg+,
 * the panel's resizer set a height) it picks the rows × columns that make the
 * tiles largest inside that box (`computeGridLayout`, shared with the stage
 * grid); otherwise the box grows with its rows, as square as the count
 * allows. Too many people for the space scrolls instead of shrinking tiles
 * past legibility. Order is fixed (`useStableTracks`): the speaker gets a
 * green ring, never a bigger or different tile.
 */
export function ClassroomGallery({
  tracks,
  fill
}: {
  tracks: TrackReferenceOrPlaceholder[];
  fill: boolean;
}) {
  const ordered = useStableTracks(tracks);
  // `fill` only takes effect at lg — below that the box has no height of its
  // own to divide, and measuring one that grows with its content would loop.
  const isLg = useMediaQuery("(min-width: 1024px)");
  const filled = fill && isLg;
  const size = useElementSize<HTMLDivElement>();
  const { height, ref } = size;
  const width = Math.max(0, size.width - SCROLLBAR_GUTTER);
  const count = ordered.length;

  const { cols, tileWidth } = useMemo(() => {
    if (filled) {
      const layout = computeGridLayout(count, width, height, GAP);
      return { cols: layout.cols, tileWidth: layout.tileWidth };
    }
    const columns = balancedGridColumns(count, width, GAP, MIN_TILE);
    return { cols: columns, tileWidth: (width - (columns - 1) * GAP) / columns };
  }, [count, filled, height, width]);

  // Half-width tracks with every tile spanning two, so a partial last row
  // centres by half a column (see lastRowIndent) at the same tile size.
  const halfTrack = Math.max(0, (tileWidth - GAP) / 2);
  const measured = width > 0 && halfTrack > 0 && (!filled || height > 0);
  const indent = lastRowIndent(count, cols);
  const lastRowStart = cols * (Math.ceil(count / cols) - 1);

  return (
    <div
      // Measured, never scrolled: a scrollbar on the measured box would
      // change its width and re-drive the layout.
      ref={ref}
      className={cn("relative w-full min-w-0", filled && "min-h-0 flex-1")}
    >
      <div
        className={cn(
          "custom-scrollbar overflow-y-auto overscroll-contain [scrollbar-gutter:stable]",
          filled ? "absolute inset-0 grid [align-content:safe_center]" : "max-h-[min(45vh,30rem)]"
        )}
      >
        <div
          role="list"
          aria-label="Participants' video"
          className="grid gap-2"
          style={
            measured
              ? { gridTemplateColumns: `repeat(${cols * 2}, ${halfTrack}px)`, justifyContent: "center" }
              : { gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 7.5rem), 1fr))" }
          }
        >
          {ordered.map((trackRef, index) => (
            <div
              key={getTrackKey(trackRef)}
              role="listitem"
              className="min-w-0"
              style={
                !measured
                  ? undefined
                  : indent > 0 && index === lastRowStart
                    ? { gridColumn: `${indent + 1} / span 2` }
                    : SPAN_TWO
              }
            >
              <CompactVideoTile trackRef={trackRef} variant="grid" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
