"use client";

import "./auth-frame.css";
import { MotionConfig, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { declareFontVariables } from "@/app/fonts";
import { ACADEMY_FONT_FACES } from "@/features/academy/fonts.generated";
import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { cn } from "@/lib/utils";
import { LoginHeroBottom, LoginHeroTop, SIGN_IN_HERO } from "./LoginHero";

// Playfair for the headings, loaded only on the auth pages (as on the academy page).
const loginFontVariablesCss = declareFontVariables(".auth-frame", ACADEMY_FONT_FACES);

/**
 * Desktop background of the hero: the panel with its curved right edge (clip-path) and
 * the gold line that traces the curve. The panel follows the theme: navy in dark, champagne in light. It is
 * painted over `PageBoard`, so its curve (and the band beside it) is where the board ends.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 hidden w-[var(--auth-hero-w)] lg:block">
      <div className="auth-hero-shape auth-hero-glow absolute inset-0 overflow-hidden">
        <span className="auth-ring absolute -left-[18%] -top-[30%] aspect-square w-[78%]" />
        <span className="auth-ring absolute -left-[8%] -top-[22%] aspect-square w-[62%]" />
        <span className="auth-ring absolute left-[52%] top-[6%] aspect-square w-[70%]" />
      </div>
      <svg
        className="absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient id="auth-edge" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" style={{ stopColor: "rgb(var(--rgb-login-gold-light))", stopOpacity: 0.25 }} />
            <stop offset="45%" style={{ stopColor: "rgb(var(--rgb-login-gold))", stopOpacity: 0.95 }} />
            <stop offset="100%" style={{ stopColor: "rgb(var(--rgb-login-gold-deep))", stopOpacity: 0.9 }} />
          </linearGradient>
        </defs>
        {/* Wide soft sweep on the form side, then the crisp edge line. The sweep is laid on
            a solid band of the page colour, so the board under it doesn't show through. */}
        <path
          d="M101 0 C101 42 97 74 81 100"
          fill="none"
          style={{ stroke: "rgb(var(--rgb-login-page))" }}
          strokeWidth="22"
          vectorEffect="non-scaling-stroke"
        />
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
          stroke="url(#auth-edge)"
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/**
 * The academy's own logo, large, in a soft gold glow; it links home (the header's small
 * logo is phones and tablets only). It fills the hero's second grid row, the space left
 * under the hero text, and sits centred in it (above the trust row where that shows).
 * Its size follows the hero's width and the screen's height (`auth-hero-logo`).
 */
function HeroLogo() {
  const brandName = useBrandName();

  return (
    <div className="auth-hero-logo-cell pointer-events-none relative z-10 hidden items-center justify-center pr-[10%] lg:col-start-1 lg:row-start-2 lg:flex">
      <div className="auth-hero-logo relative">
        <span aria-hidden="true" className="auth-knight-glow absolute -inset-x-[30%] -inset-y-[80%] opacity-60 dark:opacity-35" />
        <Link
          aria-label={`${brandName} home`}
          className="pointer-events-auto relative block rounded-control transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-login-gold"
          href="/"
        >
          <Logo size={192} />
        </Link>
      </div>
    </div>
  );
}

/**
 * The glowing chessboard along the foot of the page (desktop), with embers rising off it,
 * one transparent picture per theme (`apps/web/scripts/build-auth-board.mjs`). It starts
 * under the hero, so the hero's curve is where it ends on the left.
 */
function PageBoard() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 right-0 hidden aspect-[1600/1000] w-[calc(100%_-_var(--auth-hero-w)_*_0.7)] lg:block"
    >
      <Image alt="" className="object-contain dark:hidden" fill sizes="70vw" src="/auth/board-light.webp" />
      <Image alt="" className="hidden object-contain dark:block" fill sizes="70vw" src="/auth/board-dark.webp" />
    </div>
  );
}

/**
 * The form side's background: a soft champagne light, and below `lg` a faint
 * checkerboard (from `lg` the page's `PageBoard` runs under it instead).
 */
function FormSideDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="auth-sweep absolute inset-0" />
      <div className="auth-checker absolute bottom-0 right-0 h-2/5 w-3/4 lg:hidden" />
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
      {/* From `lg` the links sit on the glowing board, so they get a soft page-coloured backing. */}
      <nav aria-label="Legal and help" className="lg:rounded-full lg:bg-login-page/80 lg:px-4 lg:py-1.5 lg:backdrop-blur-sm">
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
 * a hero (headline, feature chips, the academy's logo) beside the page's card over a glowing
 * chessboard, champagne and ivory in light, navy in dark. Below `lg` the hero's top stacks over the card and the
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
      <div className="auth-frame relative min-h-dvh bg-login-page text-login-text">
        <style dangerouslySetInnerHTML={{ __html: loginFontVariablesCss }} />
        <PageBoard />
        <HeroBackdrop />

        <div className="relative flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,var(--auth-hero-w))_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
          <LoginHeroTop
            className="auth-hero-mobile relative z-10 px-4 pb-10 pt-4 sm:px-8 sm:pt-6 lg:col-start-1 lg:row-start-1 lg:px-12 lg:pb-0 lg:pr-[7%] lg:pt-10 xl:px-16"
            copy={HERO_COPY}
          />

          <div className="auth-form-side relative flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
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

          {/* `auth-trust`: hidden where the desktop hero has no room for it (auth-frame.css). */}
          <LoginHeroBottom className="auth-hero-mobile-bottom auth-trust relative z-10 px-4 pb-8 pt-10 sm:px-8 lg:col-start-1 lg:row-start-2 lg:px-12 lg:pb-8 lg:pr-[14%] lg:pt-12 xl:px-16" />
          <HeroLogo />
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
