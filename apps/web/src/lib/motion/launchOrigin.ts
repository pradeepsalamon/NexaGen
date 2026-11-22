/**
 * "Open from where you tapped": a dialog grows out of the control that opened it and shrinks back
 * into it when it closes, like an app opening from its icon on a phone.
 *
 * Remembers the control behind the last press (or Enter / Space on a focused control). A dialog
 * calls `launchFrom(node)` as it mounts: the panel's `transform-origin` goes to that control's
 * centre and `--launch-scale` to the size that makes the panel start about as wide as the control,
 * and `--launch-dx` / `--launch-dy` to the shift that puts the first frame right on the control.
 * The `dialog-in` / `dialog-out` keyframes (tailwind.config.ts) animate the standalone `scale` and
 * `translate` properties and opacity, never `transform`. A press older than `FRESH_MS` (a dialog
 * opened by a timer or a route) grows gently from the centre.
 *
 * Some dialogs are unmounted outright when they close (`{editing ? <XDialog open /> : null}`), so
 * Radix never plays their exit. `useLaunchRef` notices that and plays the exit on a copy.
 *
 * Menus and popovers don't need this: Radix gives them the trigger side as
 * `--radix-*-content-transform-origin`.
 */

import { useCallback, useRef, type ForwardedRef } from "react";
import { trackDialogScrollbar, untrackDialogScrollbar } from "@/lib/dialogScrollbar";

type LaunchSource = { at: number; height: number; width: number; x: number; y: number };

const FRESH_MS = 1500;
const MIN_SCALE = 0.06;
const MAX_SCALE = 0.6;
const FROM_CENTRE_SCALE = "0.9";
/** Longest exit (dialog-out) plus slack, in case `animationend` never comes. */
const GHOST_MAX_MS = 600;

const TRIGGER_SELECTOR =
  'button, a[href], summary, label, input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="tab"], [role="switch"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';

let last: LaunchSource | null = null;

function rememberRect(rect: DOMRect) {
  last = {
    at: performance.now(),
    height: rect.height,
    width: rect.width,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest(TRIGGER_SELECTOR) : null;
      const rect = target?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) rememberRect(rect);
      else last = { at: performance.now(), height: 0, width: 0, x: event.clientX, y: event.clientY };
    },
    { capture: true, passive: true }
  );
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = document.activeElement;
      if (!(target instanceof HTMLElement) || target === document.body) return;
      rememberRect(target.getBoundingClientRect());
    },
    { capture: true, passive: true }
  );
}

/**
 * Points `node`'s transform-origin at the last pressed control, in the node's own (untransformed)
 * box. Works whatever transform centres the panel: a scale about that origin shrinks every point of
 * the box onto it, the centring transform included.
 */
export function launchFrom(node: HTMLElement) {
  const source = last !== null && performance.now() - last.at <= FRESH_MS ? last : null;
  const x = source ? source.x : window.innerWidth / 2;
  const y = source ? source.y : window.innerHeight / 2;

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

  // Start (and end) about the control's size: as wide as it or as tall as it, whichever is more.
  let scale = FROM_CENTRE_SCALE;
  if (source && rect.width > 0 && rect.height > 0) {
    const fit = Math.max(source.width / rect.width, source.height / rect.height);
    scale = String(Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit)));
  }

  node.style.transformOrigin = `${x - left}px ${y - top}px`;
  node.style.setProperty("--launch-scale", scale);
  // Scaled about a point outside it, a panel only gets part of the way there: at scale s its centre
  // sits at P + s·(C − P). Shifting the first frame by s·(P − C) puts it right on the control, and
  // easing that shift and the scale together moves the centre in a straight line from P to C.
  const s0 = Number(scale);
  const centreX = rect.left + rect.width / 2;
  const centreY = rect.top + rect.height / 2;
  node.style.setProperty("--launch-dx", `${s0 * (x - centreX)}px`);
  node.style.setProperty("--launch-dy", `${s0 * (y - centreY)}px`);
}

/**
 * Plays the exit of a dialog that was unmounted while still open: a copy of the panel (and its
 * overlay) is put back where it was, marked closed so the usual `dialog-out` / `overlay-out`
 * classes run, then removed. The copy is inert and ignores the pointer.
 */
function playExitOnCopy(node: HTMLElement, overlay: Element | null) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const copies = [overlay, node]
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    .map((el) => {
      const copy = el.cloneNode(true) as HTMLElement;
      copy.removeAttribute("id");
      copy.setAttribute("aria-hidden", "true");
      copy.setAttribute("data-state", "closed");
      copy.inert = true;
      copy.style.pointerEvents = "none";
      document.body.appendChild(copy);
      return copy;
    });
  const panel = copies[copies.length - 1];
  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    copies.forEach((copy) => copy.remove());
  };
  panel?.addEventListener("animationend", remove, { once: true });
  window.setTimeout(remove, GHOST_MAX_MS);
}

/** Panels already pointed: a re-render (which hands React a new ref) must not move the origin. */
const launched = new WeakSet<HTMLElement>();

/**
 * A ref for a dialog panel, merged with the caller's own: points the panel at its control once on
 * mount, plays the exit on a copy if the panel is unmounted without Radix closing it first, and
 * keeps a scrolling panel's fields centred (`trackDialogScrollbar`).
 */
export function useLaunchRef<T extends HTMLElement>(forwarded: ForwardedRef<T>) {
  const mounted = useRef<{ node: T; overlay: Element | null } | null>(null);
  return useCallback(
    (node: T | null) => {
      if (node) {
        if (!launched.has(node)) {
          launched.add(node);
          launchFrom(node);
        }
        trackDialogScrollbar(node);
        const prev = node.previousElementSibling;
        mounted.current = {
          node,
          overlay: prev?.getAttribute("data-state") !== null && prev?.getAttribute("role") === null ? prev : null
        };
      } else if (mounted.current) {
        const { node: gone, overlay } = mounted.current;
        mounted.current = null;
        // Radix's own close leaves the panel marked closed after its exit ran. Still "open" here
        // means the dialog was unmounted as a whole. A check after this commit tells that apart
        // from React re-attaching the ref (Strict Mode, a new ref function): then it is still in
        // the page and keeps everything. The copy is taken before the padding trim is undone.
        const wasOpen = gone.getAttribute("data-state") === "open";
        const overlayState = overlay?.getAttribute("data-state");
        queueMicrotask(() => {
          if (gone.isConnected) return;
          if (wasOpen) playExitOnCopy(gone, overlayState === "open" ? overlay : null);
          untrackDialogScrollbar(gone);
        });
      }
      if (typeof forwarded === "function") forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded]
  );
}
