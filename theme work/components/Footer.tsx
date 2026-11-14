import { ArrowUp } from 'lucide-react'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="border-t border-ink/10 px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
        <Logo />
        <p className="text-center text-sm text-ink/60">
          © 2026 Nexa Chess LMS. Every move begins with a vision.
        </p>
        <a
          href="#top"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition-colors hover:border-gold hover:bg-sand/60"
        >
          <ArrowUp size={16} /> Back to top
        </a>
      </div>
    </footer>
  )
}
