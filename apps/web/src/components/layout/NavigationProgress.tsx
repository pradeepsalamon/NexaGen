"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Phase = "idle" | "start" | "loading" | "done";

/** Gives up on a navigation that never lands (e.g. a redirect back to the same page). */
const SAFETY_TIMEOUT_MS = 20_000;
const FINISH_MS = 320;

/** The path an internal link click will navigate to, or `null` when the click isn't a navigation. */
function navigationTarget(event: MouseEvent): string | null {
  // `defaultPrevented` says nothing here: next/link always prevents the default to navigate itself.
  if (event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null;
  return url.pathname;
}

/**
 * A thin gold bar at the top of the window that starts the moment an internal link is clicked and
 * finishes when the new page is on screen, so a slow connection never looks like a dead click.
 * Mounted once in `AppProviders`. Navigation started in code (`router.push`) isn't covered.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");
  const timers = useRef<number[]>([]);

  const set = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const finish = () => {
    clearTimers();
    set("done");
    timers.current.push(window.setTimeout(() => set("idle"), FINISH_MS));
  };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!navigationTarget(event)) return;
      clearTimers();
      set("start");
      // Two frames: the bar must paint at zero width before it starts to grow.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (phaseRef.current === "start") set("loading");
        })
      );
      timers.current.push(window.setTimeout(finish, SAFETY_TIMEOUT_MS));
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phaseRef.current === "start" || phaseRef.current === "loading") finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (phase === "idle") return null;

  const scale = phase === "start" ? 0 : phase === "loading" ? 0.9 : 1;
  const transition =
    phase === "loading"
      ? // Fast at first, then creeping: it never reaches the end while still waiting.
        "transform 12s cubic-bezier(0.05, 0.6, 0.1, 1)"
      : phase === "done"
        ? "transform 160ms ease-out, opacity 160ms ease-out 160ms"
        : "none";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      data-testid="navigation-progress"
    >
      <div
        className="h-full origin-left bg-accent"
        style={{ opacity: phase === "done" ? 0 : 1, transform: `scaleX(${scale})`, transition }}
      />
    </div>
  );
}
