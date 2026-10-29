"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Calendar,
  Play,
  Users,
  GraduationCap,
  ClipboardList,
  Trophy
} from "lucide-react";

// Update these if your filenames in `public/academy/` are different
const HERO_BG_LIGHT = "/academy/hero_light.webp";
const HERO_BG_DARK = "/academy/hero_dark.webp";

const heroStats = [
  { value: "5,000+", label: "Active Students", Icon: Users },
  { value: "100+", label: "Expert Coaches", Icon: GraduationCap },
  { value: "15,000+", label: "Classes Completed", Icon: ClipboardList },
  { value: "4,500+", label: "Tournaments Played", Icon: Trophy }
];

/**
 * Splits a stat like "5,000+" into prefix / number / suffix so only the
 * digits animate and the "+" (or any other text) stays in place.
 */
function parseStat(value: string) {
  const match = value.match(/^(\D*)([\d,]+)(.*)$/);
  if (!match) return { prefix: "", target: 0, suffix: value, valid: false };
  return {
    prefix: match[1],
    target: parseInt(match[2].replace(/,/g, ""), 10),
    suffix: match[3],
    valid: true
  };
}

/** Counts from 0 up to the stat's number the first time it scrolls into view. */
function CountUp({
  value,
  duration = 2200,
  delay = 0
}: {
  value: string;
  duration?: number;
  delay?: number;
}) {
  const { prefix, target, suffix, valid } = parseStat(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!valid) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) {
      setCurrent(target);
      return;
    }

    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let timeout = 0;

    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // easeOutExpo: fast start, long soft landing on the final number
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setCurrent(Math.round(target * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          timeout = window.setTimeout(run, delay);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay, valid]);

  if (!valid) return <>{value}</>;

  return (
    <span ref={ref} className="relative inline-block tabular-nums">
      {/* Invisible final value reserves the width so nothing shifts while counting */}
      <span className="invisible" aria-hidden="true">
        {value}
      </span>
      <span className="absolute left-0 top-0" aria-hidden="true">
        {prefix}
        {current.toLocaleString("en-US")}
        {suffix}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}

export function HeroSection() {

  return (
    <section
      id="home"
      className="
        relative overflow-hidden bg-[#FFFFFF] dark:bg-[#030D24] select-none
        pt-16 sm:pt-20 lg:pt-[72px] pb-5 sm:pb-7 lg:pb-6
        lg:h-[100dvh] lg:min-h-[600px] lg:max-h-[820px]
        flex flex-col justify-between
      "
    >
      {/* ================= FULL-BLEED BACKGROUND ARTWORK ================= */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        {/* Light Mode Background Image */}
        <Image
          src={HERO_BG_LIGHT}
          alt="NEXA Chess Golden Knight on Luxe Chessboard"
          fill
          priority
          sizes="100vw"
          className={`
            object-cover
            object-[74%_bottom] sm:object-[70%_bottom] lg:object-[center_bottom]
            dark:hidden
          `}
        />

        {/* Dark Mode Background Image */}
        <Image
          src={HERO_BG_DARK}
          alt="NEXA Chess Faceted Gold Knight in Midnight Chess"
          fill
          // Lazy + display:none in light mode = never fetched there; only the
          // light variant is preloaded.
          fetchPriority="high"
          sizes="100vw"
          className={`
            object-cover
            object-[74%_bottom] sm:object-[70%_bottom] lg:object-[center_bottom]
            hidden dark:block
          `}
        />

        {/* Subtle bottom edge blend */}
        <div
          className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white/80 dark:from-[#030D24]/80 to-transparent"
          aria-hidden="true"
        />
      </div>

      {/* ================= MAIN HERO FOREGROUND ================= */}
      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex flex-col justify-between">
        {/* Top/Middle Area: Headline, CTAs & "Play Beyond Limits" */}
        <div className="relative grid lg:grid-cols-12 items-center my-auto py-3 sm:py-5 lg:py-2">
          {/* Left Column: Text & CTAs */}
          <div className="lg:col-span-7 text-left max-w-[560px] z-10">
            {/* Eyebrow: Gold Line + LEARN • COMPETE • GROW */}
            <div className="inline-flex items-center gap-3 mb-2.5 sm:mb-3.5">
              <span
                className="w-7 sm:w-8 h-[2px] rounded-full bg-[#C88E2B] dark:bg-[#E2B355]"
                aria-hidden="true"
              />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.28em] text-[#071B41] dark:text-white/90">
                LEARN &bull; COMPETE &bull; GROW
              </span>
            </div>

            {/* Heading */}
            <h1 className="font-[family-name:var(--font-playfair)] font-bold text-[2.15rem] sm:text-5xl lg:text-[3.1rem] xl:text-[3.4rem] leading-[1.08] tracking-[-0.02em] text-[#071B41] dark:text-white mb-3 sm:mb-4">
              NEXA Chess With
              <span className="block text-[#C58927] dark:text-[#DF9F38] mt-0.5">
                Expert Coaching
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[13px] sm:text-[15px] lg:text-base text-[#2F3847] dark:text-[#C8CDD6] max-w-[235px] xs:max-w-[265px] sm:max-w-[480px] mb-5 sm:mb-6 leading-[1.55] font-normal">
              Join thousands of students and develop your chess skills with expert
              coaching, structured programs, live classes, and a global community.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3.5 max-w-[215px] xs:max-w-[235px] sm:max-w-none">
              {/* Book a Free Class */}
              <a
                href="#demo"
                className="
                  inline-flex items-center justify-center gap-2.5
                  min-h-[42px] sm:min-h-[46px] px-4 sm:px-6 py-2 sm:py-2.5
                  rounded-[10px]
                  bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C]
                  hover:from-[#EDC36E] hover:to-[#D89B32]
                  text-[#071B41] font-bold text-xs sm:text-sm
                  shadow-[0_6px_18px_rgba(204,146,44,0.32)]
                  hover:shadow-[0_8px_22px_rgba(204,146,44,0.45)]
                  transition-all duration-200 hover:-translate-y-0.5
                "
              >
                <Calendar className="size-4 stroke-[2.2] shrink-0 text-[#071B41]" />
                <span>Book a Free Class</span>
                <ArrowRight className="size-3.5 stroke-[2.4] shrink-0" />
              </a>

              {/* Explore Programs */}
              <a
                href="#programs"
                className="
                  group inline-flex items-center justify-center gap-2.5
                  min-h-[42px] sm:min-h-[46px] px-4 sm:px-6 py-2 sm:py-2.5
                  rounded-[10px]
                  border border-[#071B41]/25 dark:border-white/20
                  bg-white/80 dark:bg-[#08152E]/80 backdrop-blur-md
                  hover:border-[#C58927] dark:hover:border-[#E2B355]
                  text-[#071B41] dark:text-white font-bold text-xs sm:text-sm
                  transition-all duration-200 hover:-translate-y-0.5
                "
              >
                <Play className="size-3.5 stroke-[2.2] shrink-0" />
                <span>Explore Programs</span>
                <ArrowRight className="size-3.5 stroke-[2.2] shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>
          </div>

          {/* Right Column: "Play Beyond Limits" Callout Overlay */}
          <div
            className="hidden lg:flex lg:col-span-5 relative h-full min-h-[280px] items-start justify-end pointer-events-none"
            aria-hidden="true"
          >
            <div className="relative mt-2 mr-1 xl:mr-2 -rotate-[14deg] select-none text-right">
              <div
                className="text-[#D99B38] dark:text-[#E2B355] text-xl xl:text-[25px] leading-[1.08] tracking-wide drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
                style={{
                  fontFamily:
                    "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', var(--font-playfair), cursive",
                  fontStyle: "italic"
                }}
              >
                <span className="block pr-4">Play</span>
                <span className="block pr-1">Beyond</span>
                <span className="block pl-3">Limits</span>
              </div>
              {/* Signature Gold Underline Swish */}
              <svg
                viewBox="0 0 120 22"
                fill="none"
                className="w-20 xl:w-24 h-4 ml-auto -mt-0.5 text-[#D99B38] dark:text-[#E2B355]"
              >
                <path
                  d="M6 16C36 8 78 5 114 3M24 19C52 13 82 11 106 9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* ================= UNIFIED STATS BAR (ALWAYS IN VIEW) ================= */}
        <div className="mt-3 sm:mt-4 lg:mt-0">
          <div
            className="
              rounded-2xl
              bg-white/95 dark:bg-[#051026]/90
              backdrop-blur-md
              border border-[#E5E9F0] dark:border-white/10
              shadow-[0_10px_30px_-6px_rgba(7,27,65,0.12)] dark:shadow-[0_16px_36px_-6px_rgba(0,0,0,0.65)]
              px-3.5 py-3 sm:px-6 sm:py-3.5 lg:px-7 lg:py-3.5
            "
          >
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {heroStats.map((stat, idx) => {
                const Icon = stat.Icon;

                const dividerClasses =
                  idx === 0
                    ? "pb-3 lg:pb-0 pr-3 lg:pr-5 border-b lg:border-b-0 border-r border-[#E5E9F0] dark:border-white/10"
                    : idx === 1
                      ? "pb-3 lg:pb-0 pl-3 lg:px-5 border-b lg:border-b-0 lg:border-r border-[#E5E9F0] dark:border-white/10"
                      : idx === 2
                        ? "pt-3 lg:pt-0 pr-3 lg:px-5 border-r border-[#E5E9F0] dark:border-white/10"
                        : "pt-3 lg:pt-0 pl-3 lg:pl-5";

                return (
                  <div
                    key={stat.label}
                    className={`flex items-center gap-2.5 sm:gap-3.5 ${dividerClasses}`}
                  >
                    {/* Circular Gold Icon Badge */}
                    <div
                      className="
                        size-9 sm:size-11 rounded-full shrink-0
                        flex items-center justify-center
                        bg-[#FDF6E7] dark:bg-[#E2B355]/12
                        border border-[#F2DCB1] dark:border-[#E2B355]/30
                        text-[#C58927] dark:text-[#E2B355]
                      "
                    >
                      <Icon className="size-4 sm:size-5" strokeWidth={1.9} />
                    </div>

                    {/* Stat Value & Label */}
                    <div className="min-w-0 text-left">
                      <div className="font-[family-name:var(--font-playfair)] font-bold text-lg sm:text-xl lg:text-2xl leading-tight text-[#071B41] dark:text-white">
                        <CountUp value={stat.value} delay={idx * 120} />
                      </div>
                      <div className="text-[11px] sm:text-xs font-medium text-[#555C68] dark:text-[#C1C4CC] truncate">
                        {stat.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}