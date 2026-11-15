import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarCheck } from 'lucide-react'
import { ActionButton, LinkButton } from './Button'
import { HeroStage } from './HeroStage'

const EASE = [0.22, 1, 0.36, 1] as const

export function Hero({ onBookDemo }: { onBookDemo: () => void }) {
  const reduce = useReducedMotion()
  const item = (i: number) => ({
    initial: reduce ? false : { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay: 0.15 + i * 0.11, ease: EASE },
  })

  return (
    <section className="relative px-5 pb-16 pt-28 sm:px-8 sm:pt-32 lg:pb-24 lg:pt-36">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-[1.02fr_1fr] lg:gap-6">
        <div className="relative z-10 text-center lg:text-left">
          <motion.p
            {...item(0)}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-gold/40 bg-surface/70 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-gold-ink backdrop-blur lg:mx-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Nexa Chess LMS
          </motion.p>

          <motion.h1
            {...item(1)}
            className="font-display-soft mt-6 text-balance text-[clamp(2.7rem,6.6vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.025em]"
          >
            Every Move Begins With a{' '}
            <span className="text-gold-gradient animate-sheen">Vision.</span>
          </motion.h1>

          <motion.p {...item(2)} className="mx-auto mt-6 max-w-xl text-lg text-ink/70 sm:text-xl lg:mx-0">
            Learn. Practice. Compete. Become a Master.
          </motion.p>

          <motion.div {...item(3)} className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
            <LinkButton href="#features" variant="primary">
              Explore Nexa Chess
              <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
            </LinkButton>
            <ActionButton variant="secondary" onClick={onBookDemo}>
              <CalendarCheck size={18} className="text-gold-ink" />
              Book a Free Demo
            </ActionButton>
          </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.25, ease: EASE }}
          className="relative lg:-mr-6"
        >
          <HeroStage />
        </motion.div>
      </div>
    </section>
  )
}
