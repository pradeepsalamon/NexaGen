import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

const LINKS = [
  { href: '#top', label: 'Home' },
  { href: '#features', label: 'Features' },
]

export function Navbar({ onBookDemo }: { onBookDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const { scrollY } = useScroll()
  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 24))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 sm:px-6">
      <motion.nav
        initial={reduce ? false : { y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        aria-label="Primary"
        data-scrolled={scrolled}
        className={[
          'relative mx-auto mt-3 flex max-w-6xl items-center justify-between rounded-full border px-3 py-2 transition-all duration-500 sm:px-4',
          scrolled
            ? 'border-ink/10 bg-surface/75 shadow-card backdrop-blur-xl'
            : 'border-transparent bg-transparent shadow-none',
        ].join(' ')}
      >
        <Logo />

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink/70 transition-colors hover:bg-sand/60 hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onBookDemo}
            className="hidden rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition-colors hover:border-gold hover:bg-sand/60 md:inline-flex"
          >
            Book a Free Demo
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-11 w-11 place-items-center rounded-full border border-ink/10 bg-surface/70 md:hidden"
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <ThemeToggle />
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              id="mobile-menu"
              initial={reduce ? false : { opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-x-0 top-full mt-3 rounded-3xl border border-ink/10 bg-surface/95 p-3 shadow-card backdrop-blur-xl md:hidden"
            >
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-base font-semibold hover:bg-sand/60"
                >
                  {l.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onBookDemo()
                }}
                className="mt-1 w-full rounded-2xl px-4 py-3 text-left text-base font-semibold hover:bg-sand/60"
              >
                Book a Free Demo
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </header>
  )
}
