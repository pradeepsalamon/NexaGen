import { useRef, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { BookOpenCheck, BrainCircuit, Video, type LucideIcon } from 'lucide-react'

interface Feature {
  icon: LucideIcon
  title: string
  body: string
  tags: string[]
}

const FEATURES: Feature[] = [
  {
    icon: BookOpenCheck,
    title: 'Interactive Chess Lessons',
    body: 'Step-by-step lessons on a live board. Drill openings, tactics and endgames with instant, friendly feedback.',
    tags: ['Openings', 'Tactics', 'Endgames'],
  },
  {
    icon: BrainCircuit,
    title: 'AI-Powered Chess Analysis',
    body: 'Review every game with an engine that explains the “why” behind each move, not just the evaluation.',
    tags: ['Game review', 'Mistake finder'],
  },
  {
    icon: Video,
    title: 'Live Coaching Sessions',
    body: 'Learn side by side with expert coaches in live classes and one-to-one sessions built around your goals.',
    tags: ['Group classes', '1-to-1'],
  },
]

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const reduce = useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const Icon = feature.icon

  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <motion.article
      ref={ref}
      onPointerMove={onMove}
      initial={reduce ? false : { opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduce ? undefined : { y: -8 }}
      className="nx-card-glow group relative flex flex-col rounded-[1.75rem] border border-ink/10 bg-surface p-7 shadow-card transition-[box-shadow,border-color] duration-500 hover:border-gold/60 hover:shadow-card-hover sm:p-8"
    >
      <div className="flex items-start justify-between">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sand/70 text-gold-ink ring-1 ring-inset ring-gold/30 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-105">
          <Icon size={26} strokeWidth={1.8} />
        </span>
        <span className="font-display-soft text-4xl font-semibold text-ink/10">0{index + 1}</span>
      </div>
      <h3 className="font-display-soft mt-7 text-2xl font-semibold leading-tight tracking-tight">{feature.title}</h3>
      <p className="mt-3 flex-1 text-[0.97rem] leading-relaxed text-ink/70">{feature.body}</p>
      <ul className="mt-6 flex flex-wrap gap-2">
        {feature.tags.map((t) => (
          <li key={t} className="rounded-full bg-sand/70 px-3 py-1 text-xs font-semibold text-ink/70">
            {t}
          </li>
        ))}
      </ul>
    </motion.article>
  )
}

export function FeatureCards() {
  return (
    <section id="features" className="relative px-5 pb-24 sm:px-8 lg:pb-32">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold-ink">Why Nexa</p>
          <h2 className="font-display-soft mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            One platform. Every move covered.
          </h2>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
