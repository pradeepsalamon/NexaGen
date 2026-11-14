import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary'

const base =
  'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full px-7 py-3.5 text-[0.95rem] font-bold tracking-tight transition-all duration-300 will-change-transform hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]'

const variants: Record<Variant, string> = {
  primary:
    'text-[#17233D] shadow-glow hover:shadow-[0_16px_40px_-8px_rgb(var(--c-gold)/0.75)] [background:linear-gradient(135deg,#F6D98C_0%,#E3B75C_48%,#C99736_100%)]',
  secondary:
    'border border-ink/15 bg-surface/60 text-ink backdrop-blur hover:border-gold hover:bg-surface hover:shadow-card',
}

const shine =
  'before:pointer-events-none before:absolute before:inset-y-0 before:-left-1/2 before:w-1/3 before:-skew-x-[20deg] before:bg-white/45 before:opacity-0 before:blur-[2px] before:transition-all before:duration-700 hover:before:left-[130%] hover:before:opacity-100'

export function LinkButton({
  variant = 'primary',
  children,
  ...rest
}: { variant?: Variant; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={`${base} ${variants[variant]} ${variant === 'primary' ? shine : ''}`}>
      {children}
    </a>
  )
}

export function ActionButton({
  variant = 'secondary',
  children,
  ...rest
}: { variant?: Variant; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`${base} ${variants[variant]} ${variant === 'primary' ? shine : ''}`}>
      {children}
    </button>
  )
}
