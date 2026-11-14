import { Component, lazy, Suspense, useRef, useState, type ReactNode } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { useTheme } from '../theme/ThemeProvider'

const ChessScene = lazy(() => import('../scene/ChessScene'))

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!gl
  } catch {
    return false
  }
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function Unavailable() {
  return (
    <div className="absolute inset-0 grid place-items-center text-center">
      <p className="max-w-[16rem] text-sm font-medium text-ink/60">
        The 3D chessboard needs WebGL, which isn’t available in this browser.
      </p>
    </div>
  )
}

/** The floating 3D board: lazy-loaded, paused off-screen, and fades in once the GL context is live. */
export function HeroStage() {
  const { theme } = useTheme()
  const reduce = useReducedMotion() ?? false
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '120px' })
  const [ready, setReady] = useState(false)
  const [webgl] = useState(hasWebGL)

  return (
    <div ref={ref} className="relative mx-auto aspect-square w-full max-w-[520px] sm:max-w-[600px] lg:max-w-none">
      {/* ambient golden light behind the board */}
      <div
        aria-hidden="true"
        className="absolute inset-[6%] rounded-full blur-2xl"
        style={{ background: 'radial-gradient(circle, rgb(var(--stage-glow) / 0.42) 0%, rgb(var(--stage-glow) / 0.12) 45%, transparent 70%)' }}
      />
      {/* slow orbit ring for depth */}
      <svg aria-hidden="true" viewBox="0 0 100 100" className="absolute inset-[2%] h-[96%] w-[96%] animate-orbit text-gold/40">
        <circle cx="50" cy="50" r="48.5" fill="none" stroke="currentColor" strokeWidth="0.25" strokeDasharray="0.6 2.4" />
        <circle cx="50" cy="1.5" r="1" fill="currentColor" />
      </svg>

      {webgl ? (
        <SceneBoundary fallback={<Unavailable />}>
          <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
            <Suspense fallback={null}>
              <ChessScene theme={theme} reducedMotion={reduce} active={inView} onReady={() => setReady(true)} />
            </Suspense>
          </div>
        </SceneBoundary>
      ) : (
        <Unavailable />
      )}
    </div>
  )
}
