"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

/** Thumb never shorter than this (px), so a very long page still has something to grab. */
const MIN_THUMB_PX = 40;
/** Space kept clear below the track's top and above the window's bottom (px). */
const INSET_PX = 4;

/**
 * The page's scrollbar on signed-in pages (`html[data-nav]`, owner 2026-11-22): just a slim navy
 * thumb that runs from below the header to the bottom of the window, with no track behind it.
 *
 * The browser's own page bar always starts at the very top (beside the header) and takes room
 * at the side; globals.css hides it on `html[data-nav]`, and this draws the thumb instead.
 * Nothing reserves width, so the header spans the window and the page never shifts when it
 * grows past the screen or a menu/dialog locks scrolling. Decorative for assistive tech: the page
 * still scrolls natively (wheel, keys, touch); the thumb can also be dragged. Scroll areas inside
 * the page keep their own (styled) bars.
 */
export function PageScrollbar({ headerRem }: { headerRem: number }) {
  const [top, setTop] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [geometry, setGeometry] = useState<{ size: number; offset: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startScroll: number; ratio: number } | null>(null);
  const frame = useRef(0);

  // Only where the native bar is hidden (signed in); follows sign-in and sign-out.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setEnabled(root.dataset.nav !== undefined);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributeFilter: ["data-nav"], attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;

    const measure = () => {
      frame.current = 0;
      // The header is sized in rem, which follows the user's text size.
      const rootFont = parseFloat(getComputedStyle(root).fontSize) || 16;
      const headerPx = headerRem * rootFont;
      setTop((prev) => (prev === headerPx ? prev : headerPx));
      const top = headerPx;
      const viewport = window.innerHeight;
      const content = root.scrollHeight;
      const track = viewport - top - INSET_PX * 2;
      if (content <= viewport + 1 || track <= MIN_THUMB_PX) {
        setGeometry(null);
        return;
      }
      const size = Math.max(MIN_THUMB_PX, Math.round((track * viewport) / content));
      const maxScroll = content - viewport;
      const offset = Math.round((Math.min(window.scrollY, maxScroll) / maxScroll) * (track - size));
      setGeometry((prev) => (prev && prev.size === size && prev.offset === offset ? prev : { offset, size }));
    };
    const schedule = () => {
      if (!frame.current) frame.current = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Content that grows or shrinks (data arriving, a tab switch) changes the thumb's size.
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [enabled, headerRem]);

  if (!enabled || !geometry) return null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const root = document.documentElement;
    const track = window.innerHeight - top - INSET_PX * 2;
    const maxScroll = root.scrollHeight - window.innerHeight;
    drag.current = {
      ratio: maxScroll / Math.max(1, track - geometry.size),
      startScroll: window.scrollY,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    window.scrollTo({ behavior: "instant", top: state.startScroll + (event.clientY - state.startY) * state.ratio });
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-0 right-0 z-30 w-3"
      style={{ top: top + INSET_PX }}
    >
      <div
        className={cn(
          "group pointer-events-auto absolute right-0 flex w-3 cursor-default touch-none justify-center",
          // Hidden from touch screens' fingers: they scroll the page directly.
          "[@media(pointer:coarse)]:pointer-events-none"
        )}
        onLostPointerCapture={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ height: geometry.size, transform: `translateY(${geometry.offset}px)` }}
      >
        <span
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-150",
            dragging
              ? "w-2 bg-[var(--color-scroll-thumb-hover)]"
              : "w-1.5 bg-[var(--color-scroll-thumb)] group-hover:w-2 group-hover:bg-[var(--color-scroll-thumb-hover)]"
          )}
        />
      </div>
    </div>
  );
}
