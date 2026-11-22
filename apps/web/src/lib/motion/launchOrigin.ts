/**
 * "Open from where you tapped": a dialog grows out of the control that opened it and shrinks back
 * into that spot when it closes, like an app opening from its icon on a phone.
 *
 * Remembers where the last press (or Enter / Space on a focused control) happened. A dialog calls
 * `launchFrom(node)` as it mounts, which points the panel's `transform-origin` at that spot; the
 * `dialog-in` / `dialog-out` keyframes (tailwind.config.ts) then only animate `scale` and opacity.
 * A press older than `FRESH_MS` (a dialog opened by a timer or a route) grows from the centre,
 * with a smaller zoom (`--launch-scale`).
 *
 * Menus and popovers don't need this: Radix gives them the trigger side as
 * `--radix-*-content-transform-origin`.
 */

import { useCallback, type ForwardedRef } from "react";

type LaunchPoint = { at: number; x: number; y: number };

const FRESH_MS = 1500;
/** Starting size when growing out of a control, and when there is no control to grow from. */
const FROM_POINT_SCALE = "0.12";
const FROM_CENTRE_SCALE = "0.9";

let last: LaunchPoint | null = null;

function remember(x: number, y: number) {
  last = { at: performance.now(), x, y };
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (event) => remember(event.clientX, event.clientY),
    { capture: true, passive: true }
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = document.activeElement;
      if (!(target instanceof HTMLElement) || target === document.body) return;
      const rect = target.getBoundingClientRect();
      remember(rect.left + rect.width / 2, rect.top + rect.height / 2);
    },
    { capture: true, passive: true }
  );
}

/**
 * Points `node`'s transform-origin at the last press, in the node's own (untransformed) box.
 * Works whatever transform centres the panel: a scale about that origin shrinks every point
 * of the box onto it, the centring transform included.
 */
export function launchFrom(node: HTMLElement) {
  const fresh = last !== null && performance.now() - last.at <= FRESH_MS;
  const x = fresh && last ? last.x : window.innerWidth / 2;
  const y = fresh && last ? last.y : window.innerHeight / 2;

  // The layout box: the panel's rect at full size, less its own translate (e.g. -50% centring).
  // The entry animation is held for this one read so its first frame's scale isn't measured;
  // nothing paints in between.
  const animation = node.style.animation;
  node.style.animation = "none";
  const rect = node.getBoundingClientRect();
  const transform = getComputedStyle(node).transform;
  node.style.animation = animation;
  const matrix = transform && transform !== "none" ? new DOMMatrixReadOnly(transform) : null;
  const left = rect.left - (matrix?.e ?? 0);
  const top = rect.top - (matrix?.f ?? 0);

  node.style.transformOrigin = `${x - left}px ${y - top}px`;
  node.style.setProperty("--launch-scale", fresh ? FROM_POINT_SCALE : FROM_CENTRE_SCALE);
}

/** Panels already pointed: a re-render (which hands React a new ref) must not move the origin. */
const launched = new WeakSet<HTMLElement>();

/** A ref that calls `launchFrom` once when the panel mounts, merged with the caller's own ref. */
export function useLaunchRef<T extends HTMLElement>(forwarded: ForwardedRef<T>) {
  return useCallback(
    (node: T | null) => {
      if (node && !launched.has(node)) {
        launched.add(node);
        launchFrom(node);
      }
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded]
  );
}
