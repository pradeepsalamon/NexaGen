import { useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { MathUtils } from 'three'
import { reveal } from '../theme/reveal'
import { smoothstep } from '../theme/easing'
import type { Theme } from '../theme/types'

export interface Mood {
  /** 0 = light theme, 1 = dark theme (continuous) */
  mix: number
}

/**
 * Drives a continuous light↔dark "mix" for the scene.
 *  • During the circular reveal it follows the wavefront, finishing as the ring reaches the
 *    canvas edge — so by the time the new theme is revealed over the board, the board is already new.
 *  • Otherwise (reduced motion, first load) it eases toward the target.
 */
export function useMood(theme: Theme): MutableRefObject<Mood> {
  const mood = useRef<Mood>({ mix: theme === 'dark' ? 1 : 0 })
  const dom = useThree((s) => s.gl.domElement)

  useFrame((_, dt) => {
    const m = mood.current
    if (reveal.active) {
      const rect = dom.getBoundingClientRect()
      const nx = MathUtils.clamp(reveal.x, rect.left, rect.right)
      const ny = MathUtils.clamp(reveal.y, rect.top, rect.bottom)
      const dNear = Math.hypot(reveal.x - nx, reveal.y - ny)
      const p = smoothstep(0, Math.max(160, dNear + 60), reveal.r)
      m.mix = reveal.from + (reveal.to - reveal.from) * p
    } else {
      m.mix = MathUtils.damp(m.mix, theme === 'dark' ? 1 : 0, 6, dt)
      if (Math.abs(m.mix - (theme === 'dark' ? 1 : 0)) < 0.001) m.mix = theme === 'dark' ? 1 : 0
    }
  }, -2)

  if (import.meta.env.DEV) (window as unknown as { __nexaMood: Mood }).__nexaMood = mood.current
  return mood
}
