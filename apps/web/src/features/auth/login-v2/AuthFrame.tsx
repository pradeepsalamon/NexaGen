"use client";

import "./login-v2.css";
import { MotionConfig, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { declareFontVariables } from "@/app/fonts";
import { ACADEMY_FONT_FACES } from "@/features/academy/fonts.generated";
import { cn } from "@/lib/utils";
import { LoginHeroBottom, LoginHeroTop, SIGN_IN_HERO } from "./LoginHero";

// Playfair for the headings, loaded only on the auth pages (as on the academy page).
const loginFontVariablesCss = declareFontVariables(".login-v2", ACADEMY_FONT_FACES);

/**
 * Desktop background of the hero: the panel with its curved right edge (clip-path), the
 * gold-knight scene along its foot and the gold line that traces the curve. The panel
 * follows the theme: navy with the knight-and-board picture in dark, champagne with the
 * knight in its rings over a checkerboard floor in light.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 hidden w-[var(--auth-hero-w)] lg:block">
      <div className="login-v2-hero-shape login-v2-hero-glow absolute inset-0 overflow-hidden">
        <span className="login-v2-ring absolute -left-[18%] -top-[30%] aspect-square w-[78%]" />
        <span className="login-v2-ring absolute -left-[8%] -top-[22%] aspect-square w-[62%]" />
        <span className="login-v2-ring absolute left-[52%] top-[6%] aspect-square w-[70%]" />
        <div className="absolute inset-x-0 bottom-0 aspect-[2400/1418] dark:hidden">
          <div className="login-v2-floor absolute -inset-x-[10%] bottom-0 h-[42%]" />
          <span className="login-v2-knight-glow absolute left-[9%] top-[24%] aspect-square w-[42%]" />
          <span className="login-v2-knight-ring absolute left-[12%] top-[29%] aspect-square w-[36%]" />
          <span className="login-v2-knight-ring absolute left-[15%] top-[34.5%] aspect-square w-[30%] opacity-70" />
          <div className="absolute left-[21%] top-[33%] aspect-[707/1100] h-[52%]">
            <Image alt="" className="object-contain" fill priority sizes="17vw" src="/auth/v2/hero-knight-light.webp" />
          </div>
        </div>
        <div className="login-v2-art-fade absolute inset-x-0 bottom-0 hidden aspect-[2400/1418] dark:block">
          <Image alt="" className="object-cover object-left-bottom" fill priority sizes="58vw" src="/auth/v2/hero-scene.webp" />
        </div>
        <div className="absolute inset-x-0 bottom-0 aspect-[2400/1418]">
          <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-login-hero via-login-hero/60 to-transparent" />
        </div>
      </div>
      <svg
        className="absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient id="login-v2-edge" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" style={{ stopColor: "rgb(var(--rgb-login-gold-light))", stopOpacity: 0.25 }} />
            <stop offset="45%" style={{ stopColor: "rgb(var(--rgb-login-gold))", stopOpacity: 0.95 }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--rgb-login-gold-deep))", stopOpacity: 0.9 }} />
          </linearGradient>
        </defs>
        {/* Wide soft sweep on the ivory side, then the crisp edge line. */}
        <path
          d="M101 0 C101 42 97 74 81 100"
          fill="none"
          style={{ stroke: "rgb(var(--rgb-login-gold))", strokeOpacity: 0.18 }}
          strokeWidth="22"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M100 0 C100 42 96 74 80 100"
          fill="none"
          stroke="url(#login-v2-edge)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/**
 * The form side's background. Desktop: the ivory knight, rook and board picture, or the
 * navy knight and dark board in the dark theme. Below `lg`: a soft champagne light and a
 * faint checkerboard.
 */
function FormSideDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="login-v2-sweep absolute inset-0" />
      <div className="login-v2-checker absolute bottom-0 right-0 h-2/5 w-3/4" />
      <div className="absolute inset-0 hidden lg:block">
        <div className="absolute inset-0 bg-login-page dark:hidden">
          <Image alt="" className="object-cover object-right" fill sizes="42vw" src="/auth/v2/form-bg-light.webp" />
        </div>
        <div className="absolute inset-0 hidden bg-login-page dark:block">
          <Image alt="" className="object-cover object-right" fill sizes="42vw" src="/auth/v2/form-bg-dark.webp" />
        </div>
      </div>
    </div>
  );
}

function FooterLinks() {
  const links = [
    { href: "/privacy", label: "Privacy" },
    { href: "/terms", label: "Terms" },
    // /help needs a session; signed-out visitors reach the team from the academy page.
    { href: "/#contact", label: "Help" }
  ];

  return (
    <footer className="flex justify-center text-sm text-app-muted">
      <nav aria-label="Legal and help">
        <ul className="flex items-center">
          {links.map((link, index) => (
            <li className={index > 0 ? "ml-4 border-l border-app-border pl-4" : undefined} key={link.href}>
              <Link className="font-medium text-app-muted transition-colors hover:text-app-text hover:underline" href={link.href}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}

/** The hero text, the same on every auth page: only the card changes between them. */
const HERO_COPY = SIGN_IN_HERO;

/**
 * Every auth page (`/login`, `/register`, password reset, email verification, unsubscribe):
 * a hero (headline, feature chips, the gold-knight scene) beside the page's card, champagne
 * and ivory in light, navy in dark. Below `lg` the hero's top stacks over the card and the
 * trust row follows it, so the form stays first on a phone. Every academy's address gets
 * this same frame (its own logo and name, Nexa's gold).
 *
 * The `(auth)` route group renders it once in its layout, so moving between those pages
 * keeps the frame still and swaps only the `AuthCard` inside it. Pages outside the group
 * (unsubscribe) use `AuthSplitShell`, which is this frame around one card.
 */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="login-v2 relative min-h-dvh bg-login-page text-login-text">
        <style dangerouslySetInnerHTML={{ __html: loginFontVariablesCss }} />
        <HeroBackdrop />

        <div className="relative flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,var(--auth-hero-w))_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
          <LoginHeroTop
            className="login-v2-hero-mobile relative z-10 px-4 pb-10 pt-4 sm:px-8 sm:pt-6 lg:col-start-1 lg:row-start-1 lg:px-12 lg:pb-0 lg:pr-[7%] lg:pt-10 xl:px-16"
            copy={HERO_COPY}
          />

          <div className="login-v2-form-side relative flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <FormSideDecor />
            {/* The page's card, centred: the space around it is even on opposite sides and at
                least --auth-gap. The Privacy/Terms/Help links sit under it, outside the card:
                from `lg` pinned to the foot of the form side, so they don't push the card off
                centre. */}
            <div className="relative z-10 flex flex-1 flex-col p-[var(--auth-gap)]">
              <div className="flex flex-1 items-center justify-center lg:py-6">{children}</div>
              <div className="pt-[var(--auth-gap)] lg:absolute lg:inset-x-0 lg:bottom-[var(--auth-gap)] lg:pt-0">
                <FooterLinks />
              </div>
            </div>
          </div>

          {/* `login-v2-trust`: hidden where the desktop hero has no room for it (login-v2.css). */}
          <LoginHeroBottom className="login-v2-hero-mobile-bottom login-v2-trust relative z-10 px-4 pb-8 pt-10 sm:px-8 lg:col-start-1 lg:row-start-2 lg:px-12 lg:pb-8 lg:pr-[14%] lg:pt-12 xl:px-16" />
        </div>
      </div>
    </MotionConfig>
  );
}

/**
 * A page's card inside `AuthFrame`, sized to its form, in the app's own look (surface,
 * fields, blue primary button); the Privacy/Terms/Help links sit under it. The padding
 * is the same on all four sides (`--auth-card-pad`). It fades in when a page opens; the
 * frame around it stays still. `wide`: the two-column registration form.
 */
export function AuthCard({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("w-full", wide ? "max-w-2xl" : "max-w-md")}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Card className="p-[var(--auth-card-pad)]">{children}</Card>
    </motion.div>
  );
}
