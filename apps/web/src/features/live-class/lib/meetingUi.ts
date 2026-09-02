/**
 * Shared UI constants for the Live Class experience.
 *
 * The classroom stacks several fixed / absolute layers (top bar, floating
 * toolbar, docked side panel, full-screen overlays). Keeping the z-index values
 * in one place stops them drifting apart — every layer below was previously an
 * ad-hoc `z-40` / `z-50` literal.
 */
export const Z = {
  /** Video stage / grid — the base layer. */
  stage: "z-0",
  /** Docked side panel on desktop. */
  panel: "z-20",
  /** Fixed classroom top bar. */
  topbar: "z-30",
  /** Floating meeting control bar. */
  toolbar: "z-30",
  /** Reconnecting / status banner under the top bar. */
  banner: "z-[35]",
  /** Full-screen overlays: focus view, board fullscreen, mobile side panel. */
  overlay: "z-50",
} as const;

/** Bottom padding the video stage reserves so the floating toolbar never
 *  overlaps the last row of tiles. Matches the toolbar height + gap. */
export const STAGE_BOTTOM_PAD = "pb-24 sm:pb-28";

export { useReducedMotion } from "framer-motion";
