"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Calendar,
  Play,
  Users,
  GraduationCap,
  ClipboardList,
  Trophy
} from "lucide-react";
import { HeroBackdrop, HeroStage } from "../hero3d/HeroStage";

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
        relative overflow-hidden bg-app-surface select-none
        pt-16 sm:pt-20 lg:pt-[72px] pb-5 sm:pb-7 lg:pb-6
        lg:h-[100dvh] lg:min-h-[600px] lg:max-h-[820px]
        flex flex-col justify-between
      "
    >
      {/* ================= BACKDROP: DRIFTING LIGHT + FAINT CHESSBOARD ================= */}
      <HeroBackdrop />

      {/* ================= MAIN HERO FOREGROUND ================= */}
      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex flex-col justify-between">
        {/* Top/Middle Area: Headline, CTAs & "Play Beyond Limits" */}
        <div className="relative grid lg:grid-cols-12 items-center my-auto py-3 sm:py-5 lg:py-2">
          {/* Left Column: Text & CTAs */}
          <div className="lg:col-span-7 text-left max-w-[560px] z-10">
            {/* Eyebrow: Gold Line + LEARN • COMPETE • GROW */}
            <div className="inline-flex items-center gap-3 mb-2.5 sm:mb-3.5">
              <span
                className="w-7 sm:w-8 h-[2px] rounded-full bg-accent"
                aria-hidden="true"
              />
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.28em] text-app-text">
                LEARN &bull; COMPETE &bull; GROW
              </span>
            </div>

            {/* Heading */}
            <h1 className="font-[family-name:var(--font-playfair)] font-bold text-[2.15rem] sm:text-5xl lg:text-[3.1rem] xl:text-[3.4rem] leading-[1.08] tracking-[-0.02em] text-app-text mb-3 sm:mb-4">
              NEXA Chess With
              <span className="block text-accent-ink mt-0.5">
                Expert Coaching
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[13px] sm:text-[15px] lg:text-base text-app-muted max-w-[480px] mb-5 sm:mb-6 leading-[1.55] font-normal">
              Join thousands of students and develop your chess skills with expert
              coaching, structured programs, live classes, and a global community.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3.5 max-w-[280px] sm:max-w-none">
              {/* Book a Free Class */}
              <a
                href="#demo"
                className="
                  inline-flex items-center justify-center gap-2.5
                  min-h-[42px] sm:min-h-[46px] px-4 sm:px-6 py-2 sm:py-2.5
                  rounded-[10px]
                  bg-gradient-to-r from-accent via-accent to-accent-hover
                  hover:from-accent hover:to-accent-hover
                  text-on-accent font-bold text-xs sm:text-sm
                  shadow-[0_6px_18px_rgb(var(--rgb-accent)/0.32)]
                  hover:shadow-[0_8px_22px_rgb(var(--rgb-accent)/0.45)]
                  transition-all duration-200 hover:-translate-y-0.5
                "
              >
                <Calendar className="size-4 stroke-[2.2] shrink-0 text-on-accent" />
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
                  border border-app-text/25
                  bg-app-surface/80 backdrop-blur-md
                  hover:border-accent
                  text-app-text font-bold text-xs sm:text-sm
                  transition-all duration-200 hover:-translate-y-0.5
                "
              >
                <Play className="size-3.5 stroke-[2.2] shrink-0" />
                <span>Explore Programs</span>
                <ArrowRight className="size-3.5 stroke-[2.2] shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>
          </div>

          {/* Right Column: the 3D board, with the "Play Beyond Limits" callout over its corner */}
          <div className="relative mt-6 lg:col-span-5 lg:mt-0">
            <HeroStage className="mx-auto max-w-[24rem] lg:max-w-[min(30rem,58dvh)]" />
          <div
            className="hidden lg:flex absolute right-0 top-0 items-start justify-end pointer-events-none"
            aria-hidden="true"
          >
            <div className="relative mt-2 mr-1 xl:mr-2 -rotate-[14deg] select-none text-right">
              <div
                className="text-accent-ink text-xl xl:text-[25px] leading-[1.08] tracking-wide drop-shadow-[0_2px_10px_rgb(var(--rgb-scrim)/0.45)]"
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
                className="w-20 xl:w-24 h-4 ml-auto -mt-0.5 text-accent-ink"
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
        </div>

        {/* ================= UNIFIED STATS BAR (ALWAYS IN VIEW) ================= */}
        <div className="mt-3 sm:mt-4 lg:mt-0">
          <div
            className="
              rounded-2xl
              bg-app-surface/95
              backdrop-blur-md
              border border-app-border
              shadow-[0_10px_30px_-6px_rgb(var(--rgb-brand-800)/0.12)]
              px-3.5 py-3 sm:px-6 sm:py-3.5 lg:px-7 lg:py-3.5
            "
          >
            <div className="grid grid-cols-2 lg:grid-cols-4">
              {heroStats.map((stat, idx) => {
                const Icon = stat.Icon;

                const dividerClasses =
                  idx === 0
                    ? "pb-3 lg:pb-0 pr-3 lg:pr-5 border-b lg:border-b-0 border-r border-app-border"
                    : idx === 1
                      ? "pb-3 lg:pb-0 pl-3 lg:px-5 border-b lg:border-b-0 lg:border-r border-app-border"
                      : idx === 2
                        ? "pt-3 lg:pt-0 pr-3 lg:px-5 border-r border-app-border"
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
                        bg-accent-soft
                        border border-accent/45
                        text-accent-ink
                      "
                    >
                      <Icon className="size-4 sm:size-5" strokeWidth={1.9} />
                    </div>

                    {/* Stat Value & Label */}
                    <div className="min-w-0 text-left">
                      <div className="font-[family-name:var(--font-playfair)] font-bold text-lg sm:text-xl lg:text-2xl leading-tight text-app-text">
                        <CountUp value={stat.value} delay={idx * 120} />
                      </div>
                      <div className="text-[11px] sm:text-xs font-medium text-app-muted truncate">
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