"use client";

import { useEffect, useState, type RefObject } from "react";
import { ArrowUp } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";

/** Pixels from an edge that still count as "at" it (sub-pixel zoom, rubber-banding). */
const EDGE_TOLERANCE = 8;

export type ScrollPosition = "none" | "top" | "middle" | "bottom";

/**
 * Where a scroll container is: `none` when it doesn't overflow at all.
 * Re-read on scroll and whenever the box or its content changes size, so rows
 * joining or leaving update it without a scroll.
 */
export function useScrollPosition(ref: RefObject<HTMLElement | null>): ScrollPosition {
  const [position, setPosition] = useState<ScrollPosition>("none");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const read = () => {
      const { scrollTop, clientHeight, scrollHeight } = el;
      const next: ScrollPosition =
        scrollHeight - clientHeight <= EDGE_TOLERANCE
          ? "none"
          : scrollTop <= EDGE_TOLERANCE
            ? "top"
            : scrollTop + clientHeight >= scrollHeight - EDGE_TOLERANCE
              ? "bottom"
              : "middle";
      setPosition((previous) => (previous === next ? previous : next));
    };

    read();
    el.addEventListener("scroll", read, { passive: true });

    // The box resizing (panel drag, window) and its rows changing both move
    // the edges; observing every direct child catches rows added or removed.
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(read) : null;
    const observeChildren = () => {
      if (!resize) return;
      resize.disconnect();
      resize.observe(el);
      for (const child of Array.from(el.children)) resize.observe(child);
    };
    observeChildren();
    const mutations =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            observeChildren();
            read();
          })
        : null;
    mutations?.observe(el, { childList: true });

    return () => {
      el.removeEventListener("scroll", read);
      resize?.disconnect();
      mutations?.disconnect();
    };
  }, [ref]);

  return position;
}

/**
 * Back-to-top control on the right edge of a scrolling list. Out of the way
 * until it is useful: hidden at the top (and when nothing overflows), a small
 * round button mid-list, and a tall blue pill once the reader reaches the
 * bottom. The list keeps a right gutter (`SCROLL_RAIL_GUTTER`) while it
 * overflows, so the button never covers a row's name or actions.
 */
export function ScrollToTopRail({
  targetRef,
  position,
  label = "Scroll to top",
}: {
  targetRef: RefObject<HTMLElement | null>;
  position: ScrollPosition;
  label?: string;
}) {
  const hidden = position === "none" || position === "top";
  const prominent = position === "bottom";

  const scrollUp = () => {
    const el = targetRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-3 right-1 z-10 transition-opacity duration-200",
        hidden ? "opacity-0" : "opacity-100",
      )}
      aria-hidden={hidden || undefined}
    >
      <SimpleTooltip label={label}>
        <button
          type="button"
          aria-label={label}
          tabIndex={hidden ? -1 : 0}
          onClick={scrollUp}
          className={cn(
            "flex items-center justify-center rounded-full transition-all duration-200 ease-out",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface",
            hidden ? "pointer-events-none" : "pointer-events-auto",
            prominent
              ? "h-24 w-8 bg-primary text-white shadow-card hover:bg-primary/90"
              : "size-7 border border-app-border bg-app-surface/90 text-app-muted shadow-soft backdrop-blur-sm hover:bg-app-soft hover:text-app-text",
          )}
        >
          <ArrowUp className={prominent ? "size-5" : "size-3.5"} strokeWidth={2.5} />
        </button>
      </SimpleTooltip>
    </div>
  );
}

/** Right padding a list keeps for the rail while it overflows. */
export const SCROLL_RAIL_GUTTER = "pr-10";
