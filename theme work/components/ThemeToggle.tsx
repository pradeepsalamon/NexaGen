import { useId, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../theme/ThemeProvider'

const RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
const SPRING = { type: 'spring', stiffness: 150, damping: 17, mass: 0.9 } as const

/**
 * Sun ⇄ crescent morph.
 * The core circle grows from sun (r=4.6) to moon body (r=8.4) while a cut-out circle
 * slides in through an SVG mask to carve the crescent. The rays rotate and retract,
 * and the whole glyph spins — all driven by one `isDark` boolean.
 */
export function ThemeToggle() {
  const { theme, toggle, hasToggled } = useTheme()
  const reduce = useReducedMotion()
  const isDark = theme === 'dark'
  const btnRef = useRef<HTMLButtonElement>(null)
  const maskId = useId()
  const transition = reduce ? { duration: 0 } : SPRING

  const onClick = () => {
    const r = btnRef.current?.getBoundingClientRect()
    toggle(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined)
  }

  return (
    <div className="relative">
      {!hasToggled && !reduce && (
        <>
          <span className="pointer-events-none absolute inset-0 rounded-full border border-gold animate-hint" />
          <span
            className="pointer-events-none absolute right-0 top-full mt-3 hidden whitespace-nowrap rounded-full border border-gold/40 bg-surface/90 px-3 py-1 text-xs font-semibold text-gold-ink shadow-card backdrop-blur sm:block"
            aria-hidden="true"
          >
            ↑ Try the theme switch
          </span>
        </>
      )}
      <motion.button
        ref={btnRef}
        type="button"
        onClick={onClick}
        whileTap={reduce ? undefined : { scale: 0.9 }}
        whileHover={reduce ? undefined : { scale: 1.06 }}
        aria-pressed={isDark}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-full border border-ink/10 bg-surface text-gold shadow-card transition-shadow duration-300 hover:shadow-glow"
      >
        <motion.svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          fill="none"
          initial={false}
          animate={{ rotate: isDark ? 360 : 0 }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 14 }}
          aria-hidden="true"
        >
          <defs>
            <mask id={maskId}>
              <rect x="-4" y="-4" width="32" height="32" fill="white" />
              <motion.circle
                r="7.2"
                cy="7.2"
                fill="black"
                initial={false}
                animate={{ cx: isDark ? 16.4 : 34, cy: isDark ? 7.4 : -8 }}
                transition={transition}
              />
            </mask>
          </defs>
          <motion.g
            initial={false}
            animate={{ rotate: isDark ? -100 : 0, scale: isDark ? 0.25 : 1, opacity: isDark ? 0 : 1 }}
            transition={transition}
            style={{ transformOrigin: '12px 12px' }}
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          >
            {RAY_ANGLES.map((a) => (
              <line key={a} x1="12" y1="2.2" x2="12" y2="4.4" transform={`rotate(${a} 12 12)`} />
            ))}
          </motion.g>
          <motion.circle
            cx="12"
            cy="12"
            fill="currentColor"
            mask={`url(#${maskId})`}
            initial={false}
            animate={{ r: isDark ? 8.4 : 4.7 }}
            transition={transition}
          />
        </motion.svg>
      </motion.button>
    </div>
  )
}
