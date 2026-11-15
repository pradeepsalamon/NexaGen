import { ChessKnight } from 'lucide-react'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="group flex items-center gap-2.5" aria-label="Nexa Chess LMS — home">
      <span
        className="relative grid h-10 w-10 place-items-center rounded-xl shadow-glow transition-transform duration-500 group-hover:-rotate-6"
        style={{ background: 'linear-gradient(135deg, #F6D98C 0%, #E3B75C 45%, #C99736 100%)' }}
      >
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/40" />
        <ChessKnight className="h-[22px] w-[22px] text-[#17233D]" strokeWidth={2.1} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display-soft text-[1.22rem] font-semibold tracking-tight">Nexa Chess</span>
          <span className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-gold-ink">LMS</span>
        </span>
      )}
    </a>
  )
}
