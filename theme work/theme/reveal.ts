/**
 * Shared, mutable description of the running theme reveal.
 * Written by the FX loop every frame, read by the 3D scene so the lighting
 * washes from one theme to the other in sync with the circular wipe.
 * (A plain object on purpose: no React re-renders at 60fps.)
 */
export const reveal = {
  active: false,
  x: 0,
  y: 0,
  /** Current wavefront radius in CSS px. */
  r: 0,
  /** 0 = light, 1 = dark */
  from: 0 as 0 | 1,
  to: 1 as 0 | 1,
}

if (import.meta.env.DEV) (window as unknown as { __nexaReveal: typeof reveal }).__nexaReveal = reveal
