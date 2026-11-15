import { REVEAL_EASING_CSS, clamp01, revealEase } from './easing'
import type { PlayOptions } from './fx'
import { reveal } from './reveal'
import type { Point, Theme } from './types'

/** Imperative surface of <ThemeTransitionLayer/>. */
export interface TransitionLayer {
  play(opts: PlayOptions): Promise<void>
  showVeil(color: string): void
  setVeilHole(x: number, y: number, r: number): void
  hideVeil(): void
}

interface ViewTransitionLike {
  ready: Promise<void>
  finished: Promise<void>
  skipTransition(): void
}
type VTDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionLike
}

export const TRANSITION_MS = 1100

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

interface RunOptions {
  next: Theme
  origin: Point
  /** Synchronously flips the theme (DOM attribute + React state). */
  commit: (theme: Theme) => void
  layer: TransitionLayer | null
}

/**
 * Cinematic circular theme reveal.
 *
 *  • Enhancement path — View Transitions API: the browser snapshots the old theme,
 *    we flip the theme, and a clip-path circle grows on ::view-transition-new(root)
 *    from the toggle's exact position. A golden ring/ripple/particle canvas rides the
 *    wavefront on its own layer.
 *  • Fallback path — no View Transitions: an opaque veil in the old background colour
 *    is cut by a growing circular hole that reveals the already-switched live page.
 *  • Reduced motion: a short colour cross-fade, no wipe, no particles.
 */
export async function runThemeTransition({ next, origin, commit, layer }: RunOptions): Promise<void> {
  const root = document.documentElement

  if (prefersReducedMotion() || !layer) {
    root.classList.add('nx-fade')
    commit(next)
    window.setTimeout(() => root.classList.remove('nx-fade'), 450)
    return
  }

  const { x, y } = origin
  const maxR = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
  const duration = TRANSITION_MS
  const fromN: 0 | 1 = next === 'dark' ? 0 : 1

  root.dataset.switching = 'true'
  Object.assign(reveal, { active: true, x, y, r: 0, from: fromN, to: next === 'dark' ? 1 : 0 })

  try {
    const doc = document as VTDocument
    if (typeof doc.startViewTransition === 'function') {
      await viaViewTransition(doc, { x, y, maxR, duration, next, commit, layer })
    } else {
      await viaVeil({ x, y, maxR, duration, next, commit, layer })
    }
  } finally {
    reveal.active = false
    delete root.dataset.switching
  }
}

interface PathArgs {
  x: number
  y: number
  maxR: number
  duration: number
  next: Theme
  commit: (theme: Theme) => void
  layer: TransitionLayer
}

async function viaViewTransition(doc: VTDocument, a: PathArgs) {
  const root = document.documentElement
  const vt = doc.startViewTransition!(() => a.commit(a.next))

  try {
    await vt.ready
  } catch {
    // Transition was skipped by the browser (hidden tab, etc.). The theme is committed already.
    await vt.finished.catch(() => undefined)
    return
  }

  const circle = (r: number) => `circle(${r}px at ${a.x}px ${a.y}px)`
  const reveal$ = root.animate(
    { clipPath: [circle(0), circle(a.maxR)] },
    { duration: a.duration, easing: REVEAL_EASING_CSS, fill: 'both', pseudoElement: '::view-transition-new(root)' },
  )
  // Depth cue: the outgoing theme sinks slightly as the new one blooms over it.
  root.animate(
    { filter: ['brightness(1) saturate(1)', 'brightness(0.86) saturate(0.9)'] },
    { duration: a.duration, easing: REVEAL_EASING_CSS, fill: 'both', pseudoElement: '::view-transition-old(root)' },
  )

  await Promise.all([
    a.layer.play({
      x: a.x,
      y: a.y,
      maxR: a.maxR,
      duration: a.duration,
      getProgress: () => revealEase(clamp01(Number(reveal$.currentTime ?? 0) / a.duration)),
    }),
    vt.finished.catch(() => undefined),
  ])
}

async function viaVeil(a: PathArgs) {
  const root = document.documentElement
  const oldBg = getComputedStyle(root).getPropertyValue('--c-bg').trim()
  a.layer.showVeil(`rgb(${oldBg})`)
  a.commit(a.next)
  await nextFrame()

  const start = performance.now()
  await a.layer.play({
    x: a.x,
    y: a.y,
    maxR: a.maxR,
    duration: a.duration,
    getProgress: () => revealEase(clamp01((performance.now() - start) / a.duration)),
    onFrame: (r) => a.layer.setVeilHole(a.x, a.y, r),
  })
  a.layer.hideVeil()
}
