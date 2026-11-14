import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { FxEngine } from './fx'
import type { TransitionLayer } from './transition'

/**
 * Fixed, pointer-transparent layer that hosts:
 *  1. the FX canvas (golden ring, ripples, streaks, sparks), and
 *  2. the fallback "veil" used when the View Transitions API is unavailable.
 */
export const ThemeTransitionLayer = forwardRef<TransitionLayer>(function ThemeTransitionLayer(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<FxEngine | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      engineRef.current = new FxEngine(canvas)
    } catch {
      engineRef.current = null
    }
    return () => engineRef.current?.stop()
  }, [])

  useImperativeHandle(ref, () => ({
    play: (opts) => (engineRef.current ? engineRef.current.play(opts) : Promise.resolve()),
    showVeil: (color) => {
      const v = veilRef.current
      if (!v) return
      v.style.background = color
      v.style.display = 'block'
      const mask = 'radial-gradient(circle at 0px 0px, transparent 0px, #000 1px)'
      v.style.maskImage = mask
      v.style.webkitMaskImage = mask
    },
    setVeilHole: (x, y, r) => {
      const v = veilRef.current
      if (!v) return
      const mask = `radial-gradient(circle at ${x}px ${y}px, transparent ${Math.max(0, r - 1)}px, #000 ${r + 1}px)`
      v.style.maskImage = mask
      v.style.webkitMaskImage = mask
    },
    hideVeil: () => {
      const v = veilRef.current
      if (v) v.style.display = 'none'
    },
  }))

  return (
    <>
      <div ref={veilRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[90] hidden" />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="nx-fx pointer-events-none fixed inset-0 z-[100] h-full w-full"
      />
    </>
  )
})
