"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

interface IndicatorBox {
  height: number;
  /** The first box after none: placed without a transition, so it never slides in from the corner. */
  instant: boolean;
  width: number;
  x: number;
  y: number;
}

export interface SlidingIndicator {
  /** True once the active tab is measured; until then the tab keeps its own selected fill. */
  ready: boolean;
  /** Skip the transition for this placement (first paint, or the track was hidden). */
  instant: boolean;
  style: CSSProperties | undefined;
}

/**
 * Positions one highlight behind the selected tab of a tab track so it slides
 * between tabs instead of jumping. The track must be `relative` (it is the
 * offset parent) and its tabs `role="tab"`; `activeSelector` picks the selected
 * one. Re-measures when the selection, the tabs or their sizes change.
 */
export function useSlidingIndicator(
  trackRef: RefObject<HTMLElement | null>,
  activeSelector: string
): SlidingIndicator {
  const [box, setBox] = useState<IndicatorBox | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const measure = () => {
      const active = track.querySelector<HTMLElement>(activeSelector);
      if (!active || active.offsetWidth === 0) {
        setBox(null);
        return;
      }
      const x = active.offsetLeft;
      const y = active.offsetTop;
      const width = active.offsetWidth;
      const height = active.offsetHeight;
      setBox((previous) => {
        if (previous && previous.x === x && previous.y === y && previous.width === width && previous.height === height) {
          return previous.instant ? { ...previous, instant: false } : previous;
        }
        return { height, instant: previous === null, width, x, y };
      });
    };

    const resize = new ResizeObserver(measure);
    const observeTabs = () => {
      resize.disconnect();
      resize.observe(track);
      track.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => resize.observe(tab));
    };
    const mutation = new MutationObserver(() => {
      observeTabs();
      measure();
    });

    measure();
    observeTabs();
    mutation.observe(track, {
      attributeFilter: ["aria-selected", "data-state"],
      attributes: true,
      childList: true,
      subtree: true
    });
    return () => {
      mutation.disconnect();
      resize.disconnect();
    };
  }, [activeSelector, trackRef]);

  if (!box) return { instant: true, ready: false, style: undefined };
  return {
    instant: box.instant,
    ready: true,
    style: { height: box.height, transform: `translate(${box.x}px, ${box.y}px)`, width: box.width }
  };
}
