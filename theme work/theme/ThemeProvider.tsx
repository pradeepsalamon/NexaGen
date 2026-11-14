import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ThemeTransitionLayer } from './ThemeTransitionLayer'
import { runThemeTransition, type TransitionLayer } from './transition'
import type { Point, Theme } from './types'

interface ThemeContextValue {
  theme: Theme
  /** True once the visitor has used the toggle (drives the first-visit hint). */
  hasToggled: boolean
  /** Toggle with a cinematic reveal expanding from `origin` (viewport px). */
  toggle: (origin?: Point) => void
}

const STORAGE_KEY = 'nexa-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function readInitialTheme(): Theme {
  const attr = document.documentElement.dataset.theme
  return attr === 'dark' ? 'dark' : 'light'
}

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#10131D' : '#FAF8F2')
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* private mode — the theme still works, it just won't persist */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)
  const [hasToggled, setHasToggled] = useState(false)
  const themeRef = useRef(theme)
  const busyRef = useRef(false)
  const layerRef = useRef<TransitionLayer>(null)

  const toggle = useCallback((origin?: Point) => {
    if (busyRef.current) return
    busyRef.current = true
    setHasToggled(true)
    const next: Theme = themeRef.current === 'dark' ? 'light' : 'dark'
    const point = origin ?? { x: window.innerWidth - 48, y: 40 }

    void runThemeTransition({
      next,
      origin: point,
      layer: layerRef.current,
      commit: (t) => {
        themeRef.current = t
        applyThemeToDom(t)
        flushSync(() => setTheme(t))
      },
    }).finally(() => {
      busyRef.current = false
    })
  }, [])

  const value = useMemo(() => ({ theme, hasToggled, toggle }), [theme, hasToggled, toggle])

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <ThemeTransitionLayer ref={layerRef} />
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
