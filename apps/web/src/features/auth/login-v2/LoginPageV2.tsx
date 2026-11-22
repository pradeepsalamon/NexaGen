"use client";

import "./login-v2.css";
import { MotionConfig } from "framer-motion";
import Image from "next/image";
import { declareFontVariables } from "@/app/fonts";
import { ACADEMY_FONT_FACES } from "@/features/academy/fonts.generated";
import { LoginAuthPanel } from "./LoginAuthPanel";
import { LoginHeroBottom, LoginHeroTop } from "./LoginHero";

// Playfair for the headings, loaded only on this page (as on the academy page).
const loginFontVariablesCss = declareFontVariables(".login-v2", ACADEMY_FONT_FACES);

/**
 * Desktop background of the hero: the panel with its curved right edge (clip-path), the
 * gold-knight scene along its foot and the gold line that traces the curve. The panel
 * follows the theme: navy with the knight-and-board picture in dark, champagne with the
 * knight in its rings over a checkerboard floor in light.
 */
function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 hidden w-[58%] lg:block">
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

/**
 * The login page (`/login`): a hero (headline, feature chips, the gold-knight scene)
 * beside the sign-in card, champagne and ivory in light, navy in dark. Every academy's
 * address gets this same page (its own logo and name, Nexa's gold). Below `lg` the hero's top stacks over the
 * card and the trust row follows it, so the form stays first on a phone. Sign-in itself is `useLoginFlow`.
 */
export function LoginPageV2() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="login-v2 relative min-h-dvh bg-login-page text-login-text">
        <style dangerouslySetInnerHTML={{ __html: loginFontVariablesCss }} />
        <HeroBackdrop />

        <div className="relative flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:grid-rows-[auto_minmax(0,1fr)]">
          <LoginHeroTop className="login-v2-hero-mobile relative z-10 px-4 pb-10 pt-4 sm:px-8 sm:pt-6 lg:col-start-1 lg:row-start-1 lg:px-12 lg:pb-0 lg:pr-[7%] lg:pt-10 xl:px-16" />

          <div className="login-v2-form-side relative flex flex-col lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <FormSideDecor />
            <LoginAuthPanel />
          </div>

          <LoginHeroBottom className="login-v2-hero-mobile-bottom relative z-10 px-4 pb-8 pt-10 sm:px-8 lg:col-start-1 lg:row-start-2 lg:px-12 lg:pb-8 lg:pr-[24%] lg:pt-12 xl:px-16" />
        </div>
      </div>
    </MotionConfig>
  );
}
