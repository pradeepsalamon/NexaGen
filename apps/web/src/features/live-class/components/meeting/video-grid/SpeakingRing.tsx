"use client";

import { memo } from "react";
import { useIsSpeaking } from "@livekit/components-react";
import type { Participant } from "livekit-client";
import { cn } from "@/lib/utils";

/**
 * The green "speaking" ring over a video tile.
 *
 * Its own component so that someone starting or stopping to talk re-renders
 * this one element and not the tile: a tile is a framer-motion `layout` node,
 * and re-rendering one makes framer re-measure every tile in the grid. The
 * tile colours its border from here with `has-[[data-speaking]]:border-success`.
 */
export const SpeakingRing = memo(function SpeakingRing({
  participant,
  className,
}: {
  participant: Participant;
  /** Ring width and fade speed, which differ between the large and compact tiles. */
  className?: string;
}) {
  const isSpeaking = useIsSpeaking(participant);
  return (
    <div
      aria-hidden="true"
      data-speaking={isSpeaking ? "" : undefined}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-inset ring-success transition-opacity",
        className,
        isSpeaking ? "opacity-100" : "opacity-0",
      )}
    />
  );
});
