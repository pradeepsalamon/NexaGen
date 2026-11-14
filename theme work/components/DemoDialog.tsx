import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, X } from 'lucide-react'
import { ActionButton } from './Button'

const field =
  'mt-1.5 w-full rounded-xl border border-ink/15 bg-bg px-4 py-3 text-[0.95rem] text-ink outline-none transition-colors placeholder:text-ink/40 focus:border-gold focus:ring-2 focus:ring-gold/30'

export function DemoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion()
  const [sent, setSent] = useState(false)
  const firstField = useRef<HTMLInputElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => firstField.current?.focus(), 60)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
      setSent(false)
    }
  }, [open, onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setSent(true)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md rounded-[1.75rem] border border-ink/10 bg-surface p-7 shadow-card-hover sm:p-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-ink/60 transition-colors hover:bg-sand/60 hover:text-ink"
            >
              <X size={18} />
            </button>

            {sent ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto text-gold" size={44} strokeWidth={1.6} />
                <h2 id={titleId} className="font-display-soft mt-4 text-2xl font-semibold">
                  You’re on the board!
                </h2>
                <p className="mt-2 text-sm text-ink/70">
                  This is a UI demo, so nothing was sent — in production this would reach a Nexa coach.
                </p>
                <div className="mt-6">
                  <ActionButton variant="primary" onClick={onClose}>
                    Close
                  </ActionButton>
                </div>
              </div>
            ) : (
              <form onSubmit={submit}>
                <h2 id={titleId} className="font-display-soft text-2xl font-semibold">
                  Book a free demo
                </h2>
                <p className="mt-1.5 text-sm text-ink/70">Tell us a little about you and we’ll set up a 30-minute walkthrough.</p>
                <label className="mt-6 block text-sm font-semibold">
                  Name
                  <input ref={firstField} required name="name" autoComplete="name" className={field} placeholder="Your name" />
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Email
                  <input required type="email" name="email" autoComplete="email" className={field} placeholder="you@example.com" />
                </label>
                <label className="mt-4 block text-sm font-semibold">
                  Playing level
                  <select name="level" defaultValue="beginner" className={field}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="mt-7 w-full rounded-full px-7 py-3.5 text-[0.95rem] font-bold text-[#17233D] shadow-glow transition-transform hover:-translate-y-0.5 active:scale-[0.98] [background:linear-gradient(135deg,#F6D98C_0%,#E3B75C_48%,#C99736_100%)]"
                >
                  Request my demo
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
