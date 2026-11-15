"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Video,
  Puzzle,
  MessageSquare,
  Target,
  BarChart3,
  ArrowRight,
  type LucideIcon
} from "lucide-react";

const PORTAL_BG_LIGHT = "/session/01_golden_chess_portal_light.webp";
const PORTAL_BG_DARK = "/session/02_golden_chess_portal_dark.webp";

interface SessionElement {
  title: string;
  description: string;
  Icon: LucideIcon;
}

const sessionElements: SessionElement[] = [
  {
    title: "Interactive Live Class",
    description:
      "Two-way live video and interactive digital chessboard with your coach.",
    Icon: Video
  },
  {
    title: "Solve Puzzles & Play Games",
    description:
      "Tactical drills, rapid puzzle sprints, and practical sparring matches.",
    Icon: Puzzle
  },
  {
    title: "Discuss with Coach",
    description:
      "Immediate feedback on blunder patterns, positional blunders, and strategic plans.",
    Icon: MessageSquare
  },
  {
    title: "Practice & Apply in Real Life",
    description:
      "Direct homework challenges, opening repertoire reviews, and tournament readiness.",
    Icon: Target
  }
];

interface FeatureChip {
  label: string;
  Icon: LucideIcon;
}

const featureChips: FeatureChip[] = [
  { label: "Live Classes", Icon: Video },
  { label: "Practice", Icon: Puzzle },
  { label: "Progress Tracking", Icon: BarChart3 }
];

// Outlined Chess Piece SVGs for 12, 3, 6, and 9 o'clock positions
function KingDialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 2v3M10.5 3.5h3" />
      <path d="M8 9c0-2.2 1.8-4 4-4s4 1.8 4 4l-1 7H9L8 9Z" />
      <path d="M7 16h10v2.5H7zM6 21h12" />
    </svg>
  );
}

function QueenDialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="5" cy="6" r="1" />
      <circle cx="9.5" cy="4.5" r="1" />
      <circle cx="14.5" cy="4.5" r="1" />
      <circle cx="19" cy="6" r="1" />
      <path d="M5.5 7 8 15h8l2.5-8-3.5 3.5L12 5.5 9 10.5 5.5 7Z" />
      <path d="M7 15h10v2.5H7zM6 20h12" />
    </svg>
  );
}

function RookDialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 4v3h2V4h2v3h2V4h2v3h2V4" />
      <path d="M7 7h10l-1 9H8L7 7Z" />
      <path d="M6.5 16h11v2.5h-11zM5.5 21h13" />
    </svg>
  );
}

function KnightDialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15.5 4.5c-1.5 0-3 .8-4 2L8 10l1.5 2 2.5-1.2c.3 1.8-1 3.7-2.5 5.2H16c.8-3 1.2-6.5-.5-9.5V4.5Z" />
      <path d="M7 16h10v2.5H7zM6 21h12" />
    </svg>
  );
}

const TARGET_MINUTES = 55;
// 55 minutes on a 60-minute clock face = (55 / 60) * 360 = 330 degrees
const TARGET_ANGLE = (TARGET_MINUTES / 60) * 360;
const TICK_ANGLES = [30, 60, 120, 150, 210, 240, 300, 330];

export function SessionTimingSection() {

  const dialRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [needleAngle, setNeedleAngle] = useState(0);

  // Trigger count-up & needle sweep when dial scrolls into view
  useEffect(() => {
    const el = dialRef.current;
    if (!el || hasAnimated) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setHasAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasAnimated]);

  useEffect(() => {
    if (!hasAnimated) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMinutes(TARGET_MINUTES);
      setNeedleAngle(TARGET_ANGLE);
      return;
    }

    const duration = 2200; // ms
    const startTime = performance.now();
    let rafId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Smooth cubic ease-out
      const eased = 1 - Math.pow(1 - progress, 3);

      setMinutes(Math.round(eased * TARGET_MINUTES));
      setNeedleAngle(eased * TARGET_ANGLE);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [hasAnimated]);

  return (
    <section
      id="session-blueprint"
      className="relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 bg-app-background text-app-text"
    >
      {/* ================= DESKTOP LEFT-SIDE PORTAL ARTWORK LAYER ================= */}
      <div
        className="pointer-events-none hidden lg:block absolute inset-y-0 left-0 w-[64%] z-0 overflow-hidden"
        aria-hidden="true"
      >
        <Image
          src={PORTAL_BG_LIGHT}
          alt="Nexa Chess 55 Minute Session Portal Light"
          fill
          sizes="65vw"
          className="object-cover object-[46%_bottom] dark:hidden"
        />

        <Image
          src={PORTAL_BG_DARK}
          alt="Nexa Chess 55 Minute Session Portal Dark"
          fill
          sizes="65vw"
          className="object-cover object-[46%_bottom] hidden dark:block"
        />

        <div
          className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-app-background via-app-background/75 to-transparent"
        />

        <div
          className="absolute inset-y-0 right-0 w-48 bg-gradient-to-l from-app-background via-app-background/85 to-transparent"
        />

        <div
          className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-app-background to-transparent"
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md bg-app-surface/90 border-app-border text-app-text"
          >
            <span className="size-2 rounded-full bg-accent" />
            <span>SESSION BLUEPRINT</span>
          </div>

          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.14] tracking-[-0.02em] mb-3">
            <span className="text-app-text">
              Every Session:{" "}
            </span>
            <span className="block sm:inline">
              <span
                className="text-accent-ink sm:text-app-text"
              >
                45–55{" "}
              </span>
              <span className="text-accent-ink">
                Minutes
              </span>
            </span>
          </h2>

          <p
            className="text-sm sm:text-base lg:text-[17px] leading-relaxed text-app-muted"
          >
            Interactive, hands-on, and focused on real game results.
          </p>
        </div>

        {/* ================= MAIN 2-COLUMN CONTENT GRID ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-8 items-center">
          {/* LEFT COLUMN: ANIMATED 55-MINUTE CHESS CLOCK DIAL + 3 FEATURE CHIPS */}
          <div className="lg:col-span-5 relative flex flex-col items-center justify-center pt-4 pb-2 sm:py-6 lg:min-h-[440px]">
            {/* Mobile-Only Portal Artwork Backdrop */}
            <div
              className="pointer-events-none lg:hidden absolute inset-x-[-16px] -top-2 bottom-8 z-0 overflow-hidden"
              aria-hidden="true"
            >
              <Image
                src={PORTAL_BG_LIGHT}
                alt=""
                fill
                sizes="100vw"
                className="object-cover object-center dark:hidden"
              />
              <Image
                src={PORTAL_BG_DARK}
                alt=""
                fill
                sizes="100vw"
                className="object-cover object-center hidden dark:block"
              />
              <div
                className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-app-background to-transparent"
              />
              <div
                className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-app-background via-app-background/80 to-transparent"
              />
            </div>

            {/* ================= CHESS CLOCK DIAL (MATCHES image_c63585.png) ================= */}
            <div
              ref={dialRef}
              className="relative z-10 flex items-center justify-center my-auto"
            >
              {/* Outer Brushed Clock Bezel */}
              <div
                className="relative size-64 sm:size-72 lg:size-[300px] rounded-full flex items-center justify-center transition-all duration-300 backdrop-blur-md bg-gradient-to-br from-app-soft/95 via-app-border/95 to-app-line-strong/95 border-[2px] border-app-line-strong shadow-[0_20px_50px_rgb(var(--rgb-brand-800)/0.14),inset_0_2px_12px_rgb(var(--rgb-paper)/0.85)]"
              >
                {/* Subtle Inner Bezel Hairline Ring */}
                <div
                  className="pointer-events-none absolute inset-[6px] rounded-full border border-app-line-strong/70"
                  aria-hidden="true"
                />

                {/* 8 Intermediate Radial Tick Marks (30°, 60°, 120°, 150°, 210°, 240°, 300°, 330°) */}
                {TICK_ANGLES.map((deg) => (
                  <div
                    key={deg}
                    className="pointer-events-none absolute inset-0"
                    style={{ transform: `rotate(${deg}deg)` }}
                    aria-hidden="true"
                  >
                    <span
                      className="block mx-auto mt-[14px] sm:mt-[16px] w-[2px] h-3 sm:h-3.5 rounded-full bg-app-subtle/80"
                    />
                  </div>
                ))}

                {/* 12 o'clock: King Icon */}
                <div
                  className="pointer-events-none absolute top-3 sm:top-3.5 left-1/2 -translate-x-1/2 text-app-muted"
                  aria-hidden="true"
                >
                  <KingDialIcon className="size-5 sm:size-6" />
                </div>

                {/* 3 o'clock: Queen Icon */}
                <div
                  className="pointer-events-none absolute right-3 sm:right-3.5 top-1/2 -translate-y-1/2 text-app-muted"
                  aria-hidden="true"
                >
                  <QueenDialIcon className="size-5 sm:size-6" />
                </div>

                {/* 6 o'clock: Rook Icon */}
                <div
                  className="pointer-events-none absolute bottom-3 sm:bottom-3.5 left-1/2 -translate-x-1/2 text-app-muted"
                  aria-hidden="true"
                >
                  <RookDialIcon className="size-5 sm:size-6" />
                </div>

                {/* 9 o'clock: Knight Icon */}
                <div
                  className="pointer-events-none absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-app-muted"
                  aria-hidden="true"
                >
                  <KnightDialIcon className="size-5 sm:size-6" />
                </div>

                {/* ================= ROTATING NEEDLE (0° -> 330° / 55 MIN) ================= */}
                <div
                  className="pointer-events-none absolute inset-0 z-10"
                  style={{ transform: `rotate(${needleAngle}deg)` }}
                  aria-hidden="true"
                >
                  {/* Needle Arm extending from behind the inner white circle into the outer track */}
                  <div
                    className="mx-auto mt-[30px] sm:mt-[34px] w-[3.5px] sm:w-[4px] h-[38px] sm:h-[44px] rounded-full bg-app-subtle shadow-[0_1px_4px_rgb(var(--rgb-brand-800)/0.25)]"
                  />
                </div>

                {/* ================= RAISED INNER DIAL CIRCLE ================= */}
                <div
                  className="relative z-20 size-[60%] rounded-full flex flex-col items-center justify-center text-center px-4 transition-colors duration-300 bg-app-surface border border-app-surface shadow-[0_12px_28px_rgb(var(--rgb-brand-800)/0.16)]"
                >
                  <span
                    className="font-[family-name:var(--font-playfair)] font-bold text-5xl sm:text-6xl lg:text-[64px] leading-none tracking-tight tabular-nums text-primary-ink"
                  >
                    {minutes}
                  </span>
                  <span
                    className="mt-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.26em] text-app-muted"
                  >
                    MINUTES
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom 3 Feature Pills (Live Classes | Practice | Progress Tracking) */}
            <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 mt-6 sm:mt-8">
              {featureChips.map(({ label, Icon }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold border backdrop-blur-md transition-transform duration-200 hover:-translate-y-0.5 bg-app-surface/95 border-app-border text-app-text shadow-[0_6px_18px_rgb(var(--rgb-brand-800)/0.08)]"
                >
                  <Icon
                    className="size-3.5 text-accent-ink shrink-0"
                    strokeWidth={2.2}
                  />
                  <span>{label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: 4 SESSION ELEMENT CARDS */}
          <div className="lg:col-span-7 space-y-3.5 sm:space-y-4">
            {sessionElements.map((elem) => {
              const Icon = elem.Icon;
              return (
                <div
                  key={elem.title}
                  className="group relative flex items-center justify-between gap-3.5 sm:gap-5 p-4 sm:p-5 rounded-[20px] border backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 bg-app-surface/95 border-app-border hover:border-accent/60 shadow-[0_10px_28px_-8px_rgb(var(--rgb-brand-800)/0.07)]"
                >
                  {/* Left Icon Box + Center Text */}
                  <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
                    <div
                      className="size-11 sm:size-12 rounded-2xl border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 bg-accent-soft border-accent/45 text-accent-ink"
                    >
                      <Icon className="size-5 sm:size-[22px]" strokeWidth={2} />
                    </div>

                    <div className="min-w-0">
                      <h3
                        className="font-[family-name:var(--font-playfair)] font-bold text-base sm:text-[19px] leading-snug mb-1 text-app-text"
                      >
                        {elem.title}
                      </h3>
                      <p
                        className="text-xs sm:text-[13.5px] leading-relaxed text-app-muted"
                      >
                        {elem.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Circular Arrow Button */}
                  <div
                    className="size-8 sm:size-9 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 group-hover:translate-x-0.5 bg-app-background border-app-border text-app-text group-hover:border-accent group-hover:text-accent-ink"
                  >
                    <ArrowRight className="size-3.5 sm:size-4 stroke-[2.2]" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}