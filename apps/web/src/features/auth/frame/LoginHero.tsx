"use client";

import { motion } from "framer-motion";
import { BarChart3, Crown, ShieldCheck, TrendingUp, Trophy, Users, type LucideIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { cn } from "@/lib/utils";

type Highlight = { Icon: LucideIcon; lines: [string, string] };

/** One auth page's hero text: the headline (its `emphasis` in gold italic), tagline and chips. */
export type AuthHeroCopy = {
  emphasis: string;
  features: Highlight[];
  lead: string;
  subtitle: string;
};

/** Login, password reset and the other account pages. */
export const SIGN_IN_HERO: AuthHeroCopy = {
  emphasis: "expert coaches.",
  features: [
    { Icon: TrendingUp, lines: ["Progress", "you can see"] },
    { Icon: Users, lines: ["Practice between", "classes"] },
    { Icon: Trophy, lines: ["Learn from", "expert coaches"] }
  ],
  lead: "Master the board with",
  subtitle: "Premium chess learning for focused students, ambitious juniors and supportive families."
};

const TRUST: Highlight[] = [
  { Icon: ShieldCheck, lines: ["Your data is secure", "and protected"] },
  { Icon: BarChart3, lines: ["Learn smarter", "play better"] },
  { Icon: Trophy, lines: ["Achieve more", ""] }
];

const rise = {
  animate: { opacity: 1, y: 0 },
  initial: { opacity: 0, y: 14 }
};

/** "Live chess coaching academy" pill. */
function AcademyBadge() {
  return (
    <p className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-login-gold/45 bg-login-hero-2/40 px-3 py-1 text-xs font-medium text-login-gold-ink">
      <Crown aria-hidden="true" className="size-4 text-login-hero-gold" strokeWidth={2.25} />
      Live chess coaching academy
    </p>
  );
}

/**
 * Top of the hero: logo, badge, theme switch, the headline and the three feature chips.
 * The panel tagline is a `<p>`: the auth card holds the page's only `h1`.
 */
export function LoginHeroTop({ className, copy }: { className?: string; copy: AuthHeroCopy }) {
  const brandName = useBrandName();

  return (
    <div className={cn("text-login-on-hero", className)}>
      {/* Phones and tablets: the gold knight, kept to the right behind a fade of the hero colour
          (the knight-and-board picture in dark, the knight in its rings in light). */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] lg:hidden">
        <div className="absolute inset-0 hidden dark:block">
          <Image alt="" className="object-cover object-[right_bottom]" fill priority sizes="(min-width: 1024px) 1px, 100vw" src="/auth/hero-mobile.webp" />
        </div>
        <div className="absolute bottom-[6%] right-[2%] aspect-square h-[62%] dark:hidden">
          <span className="auth-knight-glow absolute inset-0" />
          <span className="auth-knight-ring absolute inset-[12%]" />
          <span className="auth-knight-ring absolute inset-[20%] opacity-70" />
          <div className="absolute inset-y-[14%] left-1/2 aspect-[707/1100] -translate-x-1/2">
            <Image alt="" className="object-contain" fill sizes="(min-width: 1024px) 1px, 40vw" src="/auth/hero-knight-light.webp" />
          </div>
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-login-hero from-40% via-login-hero/85 via-65% to-login-hero/20" />
      </div>
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-6 xl:gap-12">
          {/* From `lg` the hero shows the logo large instead (AuthFrame's HeroLogo). */}
          <Link
            aria-label={`${brandName} home`}
            className="shrink-0 rounded-control transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-login-gold lg:hidden"
            href="/"
          >
            <Logo mobileSize={36} size={48} />
          </Link>
          <div className="auth-badge hidden md:block">
            <AcademyBadge />
          </div>
        </div>
        <div className="shrink-0">
          <ThemeToggle knob="accent" />
        </div>
      </div>

      <motion.div
        animate="animate"
        className="relative mt-7 lg:mt-10"
        initial="initial"
        transition={{ duration: 0.6, ease: "easeOut" }}
        variants={rise}
      >
        <div className="mb-4 md:hidden">
          <AcademyBadge />
        </div>
        <p
          className={cn(
            // Balanced lines: never "with" alone on a line beside the narrower desktop hero.
            "auth-serif text-balance text-[2.125rem] font-semibold leading-[1.08] tracking-[-0.01em] sm:text-5xl",
            "lg:text-[2.375rem] xl:text-[2.75rem] min-[1440px]:text-[3.25rem] 2xl:text-[3.5rem]"
          )}
        >
          {copy.lead}{" "}
          <span className="relative inline-block pb-2">
            <em className="auth-gold-text pr-1 font-bold italic">{copy.emphasis}</em>
            <span aria-hidden="true" className="auth-swash absolute -left-2 bottom-0 right-[8%]" />
          </span>
        </p>
        <p
          className={cn(
            "mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-login-on-hero-muted sm:text-lg",
            "lg:mt-5 xl:text-xl"
          )}
        >
          {copy.subtitle}
        </p>
      </motion.div>

      <motion.ul
        animate="animate"
        aria-label="Highlights"
        className={cn(
          "relative mt-6 hidden flex-wrap gap-3 sm:flex lg:mt-8"
        )}
        initial="initial"
        transition={{ delay: 0.15, duration: 0.6, ease: "easeOut" }}
        variants={rise}
      >
        {copy.features.map(({ Icon, lines }) => (
          <li
            className="auth-glass flex items-center gap-3 rounded-control py-2 pl-2 pr-4 shadow-card transition-[transform,box-shadow] motion-safe:hover:-translate-y-0.5 hover:shadow-lift"
            key={lines.join(" ")}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-login-gold/10 text-login-hero-gold">
              <Icon aria-hidden="true" className="size-4" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold leading-tight text-login-on-hero">
              {lines[0]}
              <br />
              {lines[1]}
            </span>
          </li>
        ))}
      </motion.ul>
    </div>
  );
}

/** Bottom of the hero: the trust row, at the foot of the knight scene. */
export function LoginHeroBottom({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col text-login-on-hero", className)}>
      <ul aria-label="What you get" className="flex flex-wrap items-center gap-y-4 lg:mt-auto lg:pt-10">
        {TRUST.map(({ Icon, lines }, index) => (
          <li
            className={cn(
              // Tighter from `lg` so the row stays one line inside the hero's curve.
              "flex w-1/2 items-center gap-3 pr-4 sm:w-auto sm:pr-5 lg:gap-2 lg:pr-3 2xl:gap-3 2xl:pr-5",
              index > 0 && "sm:border-l sm:border-login-on-hero/20 sm:pl-5 lg:pl-3 2xl:pl-5"
            )}
            key={lines.join(" ")}
          >
            <Icon aria-hidden="true" className="size-6 shrink-0 text-login-hero-gold lg:size-5 2xl:size-6" strokeWidth={2.25} />
            <span className="text-[0.8125rem] leading-snug text-login-on-hero-muted">
              {lines[0]}
              {lines[1] ? (
                <>
                  <br />
                  {lines[1]}
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
