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
import { useTheme } from "@/providers/ThemeProvider";

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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

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
      className={`relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 ${isDark ? "bg-[#030D24] text-white" : "bg-[#F8FAFC] text-[#071B41]"
        }`}
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
          className={`object-cover object-[46%_bottom] dark:hidden`}
        />

        <Image
          src={PORTAL_BG_DARK}
          alt="Nexa Chess 55 Minute Session Portal Dark"
          fill
          sizes="65vw"
          className={`object-cover object-[46%_bottom] hidden dark:block`}
        />

        <div
          className={`absolute inset-x-0 top-0 h-36 ${isDark
              ? "bg-gradient-to-b from-[#030D24] via-[#030D24]/75 to-transparent"
              : "bg-gradient-to-b from-[#F8FAFC] via-[#F8FAFC]/75 to-transparent"
            }`}
        />

        <div
          className={`absolute inset-y-0 right-0 w-48 ${isDark
              ? "bg-gradient-to-l from-[#030D24] via-[#030D24]/85 to-transparent"
              : "bg-gradient-to-l from-[#F8FAFC] via-[#F8FAFC]/85 to-transparent"
            }`}
        />

        <div
          className={`absolute inset-x-0 bottom-0 h-12 ${isDark
              ? "bg-gradient-to-t from-[#030D24] to-transparent"
              : "bg-gradient-to-t from-[#F8FAFC] to-transparent"
            }`}
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 max-w-[1220px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md ${isDark
                ? "bg-[#081736]/85 border-white/15 text-white"
                : "bg-white/90 border-[#E2E8F0] text-[#071B41]"
              }`}
          >
            <span className="size-2 rounded-full bg-[#D49B35]" />
            <span>SESSION BLUEPRINT</span>
          </div>

          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.14] tracking-[-0.02em] mb-3">
            <span className={isDark ? "text-white" : "text-[#071B41]"}>
              Every Session:{" "}
            </span>
            <span className="block sm:inline">
              <span
                className={`text-[#C58927] dark:text-[#E2B355] ${isDark ? "sm:text-white" : "sm:text-[#071B41]"
                  }`}
              >
                45–55{" "}
              </span>
              <span className="text-[#C58927] dark:text-[#E2B355]">
                Minutes
              </span>
            </span>
          </h2>

          <p
            className={`text-sm sm:text-base lg:text-[17px] leading-relaxed ${isDark ? "text-[#C8CDD6]" : "text-[#3B4454]"
              }`}
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
                className={`object-cover object-center dark:hidden`}
              />
              <Image
                src={PORTAL_BG_DARK}
                alt=""
                fill
                sizes="100vw"
                className={`object-cover object-center hidden dark:block`}
              />
              <div
                className={`absolute inset-x-0 top-0 h-14 ${isDark
                    ? "bg-gradient-to-b from-[#030D24] to-transparent"
                    : "bg-gradient-to-b from-[#F8FAFC] to-transparent"
                  }`}
              />
              <div
                className={`absolute inset-x-0 bottom-0 h-16 ${isDark
                    ? "bg-gradient-to-t from-[#030D24] via-[#030D24]/80 to-transparent"
                    : "bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/80 to-transparent"
                  }`}
              />
            </div>

            {/* ================= CHESS CLOCK DIAL (MATCHES image_c63585.png) ================= */}
            <div
              ref={dialRef}
              className="relative z-10 flex items-center justify-center my-auto"
            >
              {/* Outer Brushed Clock Bezel */}
              <div
                className={`relative size-64 sm:size-72 lg:size-[300px] rounded-full flex items-center justify-center transition-all duration-300 backdrop-blur-md ${isDark
                    ? "bg-gradient-to-br from-[#102246]/95 via-[#091631]/95 to-[#050E22]/95 border-[2px] border-[#38507E]/60 shadow-[0_24px_60px_rgba(0,0,0,0.75),inset_0_2px_16px_rgba(255,255,255,0.06)]"
                    : "bg-gradient-to-br from-[#E9EEF5]/95 via-[#DDE5F0]/95 to-[#CFD9E6]/95 border-[2px] border-[#BCC8D8] shadow-[0_20px_50px_rgba(15,35,75,0.14),inset_0_2px_12px_rgba(255,255,255,0.85)]"
                  }`}
              >
                {/* Subtle Inner Bezel Hairline Ring */}
                <div
                  className={`pointer-events-none absolute inset-[6px] rounded-full border ${isDark ? "border-white/10" : "border-[#B4C2D4]/70"
                    }`}
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
                      className={`block mx-auto mt-[14px] sm:mt-[16px] w-[2px] h-3 sm:h-3.5 rounded-full ${isDark ? "bg-[#7E92B8]/60" : "bg-[#7F91A8]/80"
                        }`}
                    />
                  </div>
                ))}

                {/* 12 o'clock: King Icon */}
                <div
                  className={`pointer-events-none absolute top-3 sm:top-3.5 left-1/2 -translate-x-1/2 ${isDark ? "text-[#9FB2D6]" : "text-[#4D6480]"
                    }`}
                  aria-hidden="true"
                >
                  <KingDialIcon className="size-5 sm:size-6" />
                </div>

                {/* 3 o'clock: Queen Icon */}
                <div
                  className={`pointer-events-none absolute right-3 sm:right-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-[#9FB2D6]" : "text-[#4D6480]"
                    }`}
                  aria-hidden="true"
                >
                  <QueenDialIcon className="size-5 sm:size-6" />
                </div>

                {/* 6 o'clock: Rook Icon */}
                <div
                  className={`pointer-events-none absolute bottom-3 sm:bottom-3.5 left-1/2 -translate-x-1/2 ${isDark ? "text-[#9FB2D6]" : "text-[#4D6480]"
                    }`}
                  aria-hidden="true"
                >
                  <RookDialIcon className="size-5 sm:size-6" />
                </div>

                {/* 9 o'clock: Knight Icon */}
                <div
                  className={`pointer-events-none absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-[#9FB2D6]" : "text-[#4D6480]"
                    }`}
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
                    className={`mx-auto mt-[30px] sm:mt-[34px] w-[3.5px] sm:w-[4px] h-[38px] sm:h-[44px] rounded-full ${isDark
                        ? "bg-[#E2B355] shadow-[0_0_12px_rgba(226,179,85,0.65)]"
                        : "bg-[#6E829B] shadow-[0_1px_4px_rgba(7,27,65,0.25)]"
                      }`}
                  />
                </div>

                {/* ================= RAISED INNER DIAL CIRCLE ================= */}
                <div
                  className={`relative z-20 size-[60%] rounded-full flex flex-col items-center justify-center text-center px-4 transition-colors duration-300 ${isDark
                      ? "bg-gradient-to-b from-[#0D2149] to-[#071430] border border-white/15 shadow-[0_14px_34px_rgba(0,0,0,0.75)]"
                      : "bg-[#FFFFFF] border border-white shadow-[0_12px_28px_rgba(25,48,88,0.16)]"
                    }`}
                >
                  <span
                    className={`font-[family-name:var(--font-playfair)] font-bold text-5xl sm:text-6xl lg:text-[64px] leading-none tracking-tight tabular-nums ${isDark ? "text-[#E2B355]" : "text-[#2B6295]"
                      }`}
                  >
                    {minutes}
                  </span>
                  <span
                    className={`mt-2 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.26em] ${isDark ? "text-[#C1C4CC]" : "text-[#435870]"
                      }`}
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
                  className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-bold border backdrop-blur-md transition-transform duration-200 hover:-translate-y-0.5 ${isDark
                      ? "bg-[#06142E]/90 border-white/15 text-white shadow-[0_6px_18px_rgba(0,0,0,0.5)]"
                      : "bg-white/95 border-[#E2E8F0] text-[#071B41] shadow-[0_6px_18px_rgba(7,27,65,0.08)]"
                    }`}
                >
                  <Icon
                    className="size-3.5 text-[#C58927] dark:text-[#E2B355] shrink-0"
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
                  className={`group relative flex items-center justify-between gap-3.5 sm:gap-5 p-4 sm:p-5 rounded-[20px] border backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 ${isDark
                      ? "bg-[#06132D]/90 border-white/12 hover:border-[#E2B355]/50 shadow-[0_14px_34px_-10px_rgba(0,0,0,0.65)]"
                      : "bg-white/95 border-[#E5E9F0] hover:border-[#D49B35]/60 shadow-[0_10px_28px_-8px_rgba(7,27,65,0.07)]"
                    }`}
                >
                  {/* Left Icon Box + Center Text */}
                  <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
                    <div
                      className={`size-11 sm:size-12 rounded-2xl border flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105 ${isDark
                          ? "bg-[#0E2044] border-[#E2B355]/30 text-[#E2B355]"
                          : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
                        }`}
                    >
                      <Icon className="size-5 sm:size-[22px]" strokeWidth={2} />
                    </div>

                    <div className="min-w-0">
                      <h3
                        className={`font-[family-name:var(--font-playfair)] font-bold text-base sm:text-[19px] leading-snug mb-1 ${isDark ? "text-white" : "text-[#071B41]"
                          }`}
                      >
                        {elem.title}
                      </h3>
                      <p
                        className={`text-xs sm:text-[13.5px] leading-relaxed ${isDark ? "text-[#C1C4CC]" : "text-[#4A5568]"
                          }`}
                      >
                        {elem.description}
                      </p>
                    </div>
                  </div>

                  {/* Right Circular Arrow Button */}
                  <div
                    className={`size-8 sm:size-9 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 group-hover:translate-x-0.5 ${isDark
                        ? "bg-[#0B1D3F] border-white/15 text-white/80 group-hover:border-[#E2B355] group-hover:text-[#E2B355]"
                        : "bg-[#F8FAFC] border-[#E2E8F0] text-[#071B41] group-hover:border-[#C58927] group-hover:text-[#C58927]"
                      }`}
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