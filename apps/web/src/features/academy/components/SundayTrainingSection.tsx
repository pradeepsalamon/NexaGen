"use client";

import Image from "next/image";
import {
  Trophy,
  Users,
  Award,
  GraduationCap,
  ArrowRight,
  Check,
  type LucideIcon
} from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";

const COLOSSEUM_BG_LIGHT = "/sunday/01_day_chess_colosseum.webp";
const COLOSSEUM_BG_DARK = "/sunday/02_night_chess_colosseum.webp";

interface TournamentStat {
  value: string;
  label: string;
  Icon: LucideIcon;
}

const tournamentStats: TournamentStat[] = [
  { value: "50+", label: "Weekly Players", Icon: Users },
  { value: "75+", label: "Tournaments Hosted", Icon: Trophy },
  { value: "45+", label: "Expert Coaches", Icon: Award },
  { value: "100+", label: "Students Trained", Icon: GraduationCap }
];

// Desktop 2x2 order vs Mobile 1-column order (matches image_c6a5e5.png)
const desktopHighlights = [
  "Tournament Simulation",
  "Grandmaster Game Analysis",
  "Rapid Tactics Sparring",
  "Competitive Rating Prep"
];

const mobileHighlights = [
  "Tournament Simulation",
  "Rapid Tactics Sparring",
  "Grandmaster Game Analysis",
  "Competitive Rating Prep"
];

export function SundayTrainingSection() {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <section
      id="sunday-training"
      className={`relative flex flex-col lg:flex-row lg:items-center lg:min-h-[560px] lg:py-20 overflow-hidden select-none transition-colors duration-300 ${isDark ? "bg-[#030D24] text-white" : "bg-[#FFFFFF] text-[#071B41]"
        }`}
    >
      {/* ================= DESKTOP COLOSSEUM ARTWORK (FULL KING VISIBLE) ================= */}
      <div
        className="pointer-events-none hidden lg:block absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute inset-y-0 right-0 w-[75%] xl:w-[72%]">
          {/* Light Mode Colosseum */}
          <Image
            src={COLOSSEUM_BG_LIGHT}
            alt="Nexa Chess Sunday Tournament Colosseum Light"
            fill
            sizes="75vw"
            className={`object-cover object-[right_center] dark:hidden`}
          />

          {/* Dark Mode Colosseum */}
          <Image
            src={COLOSSEUM_BG_DARK}
            alt="Nexa Chess Sunday Tournament Colosseum Dark"
            fill
            sizes="75vw"
            className={`object-cover object-[right_center] hidden dark:block`}
          />

          {/* Smooth Left-to-Right Fade */}
          <div
            className={`absolute inset-y-0 left-0 w-[52%] ${isDark
                ? "bg-gradient-to-r from-[#030D24] via-[#030D24]/90 to-transparent"
                : "bg-gradient-to-r from-white via-white/92 to-transparent"
              }`}
          />
        </div>

        {/* Subtle Top & Bottom Feathering */}
        <div
          className={`absolute inset-x-0 top-0 h-10 ${isDark
              ? "bg-gradient-to-b from-[#030D24] to-transparent"
              : "bg-gradient-to-b from-white to-transparent"
            }`}
        />
        <div
          className={`absolute inset-x-0 bottom-0 h-10 ${isDark
              ? "bg-gradient-to-t from-[#030D24] to-transparent"
              : "bg-gradient-to-t from-white to-transparent"
            }`}
        />
      </div>

      {/* ================= MOBILE TOP COLOSSEUM BANNER ================= */}
      <div
        className="relative lg:hidden h-56 sm:h-64 w-full shrink-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Focused on the Golden King on the right side of your Colosseum image */}
        <Image
          src={COLOSSEUM_BG_LIGHT}
          alt="Sunday Tournament King Light"
          fill
          sizes="100vw"
          className={`object-cover object-[90%_top] sm:object-[86%_center] scale-110 dark:hidden`}
        />
        <Image
          src={COLOSSEUM_BG_DARK}
          alt="Sunday Tournament King Dark"
          fill
          sizes="100vw"
          className={`object-cover object-[90%_top] sm:object-[86%_center] scale-110 hidden dark:block`}
        />

        {/* Soft bottom gradient blending into the overlapping mobile card */}
        <div
          className={`absolute inset-x-0 bottom-0 h-14 ${isDark
              ? "bg-gradient-to-t from-[#041028] via-[#041028]/60 to-transparent"
              : "bg-gradient-to-t from-white via-white/60 to-transparent"
            }`}
        />
      </div>

      {/* ================= FOREGROUND CONTAINER ================= */}
      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-0 sm:px-6 lg:px-8 -mt-7 lg:mt-0">
        <div
          className={`rounded-t-[28px] lg:rounded-none px-5 pt-6 pb-10 sm:px-8 lg:p-0 shadow-[0_-12px_32px_rgba(0,0,0,0.08)] lg:shadow-none ${isDark
              ? "bg-[#041028] lg:bg-transparent border-t border-white/10 lg:border-none"
              : "bg-white lg:bg-transparent border-t border-[#E5E9F0] lg:border-none"
            }`}
        >
          {/* 12-Column Grid on Desktop / Stacked Single Column on Mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-6 items-center">
            {/* LEFT COLUMN (Cols 1-6): Eyebrow, Heading, Description, Features & Desktop CTA */}
            <div className="lg:col-span-6 text-center lg:text-left">
              {/* Pill Eyebrow: [• WEEKEND SPECIAL] */}
              <div
                className={`inline-flex items-center gap-2 px-3.5 py-1 sm:px-4 sm:py-1.5 rounded-full border text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] mb-3.5 shadow-2xs ${isDark
                    ? "bg-[#081736]/90 border-white/15 text-white"
                    : "bg-[#FDF8EE] border-[#F2DCB1] text-[#071B41]"
                  }`}
              >
                <span className="size-1.5 sm:size-2 rounded-full bg-[#D49B35]" />
                <span>WEEKEND SPECIAL</span>
              </div>

              {/* Two-Tone Serif Heading */}
              <h2 className="font-[family-name:var(--font-playfair)] font-bold text-[1.75rem] sm:text-4xl lg:text-[46px] xl:text-[50px] leading-[1.12] tracking-[-0.02em] mb-3 sm:mb-4">
                <span className={isDark ? "text-white" : "text-[#071B41]"}>
                  Sunday Tournament
                </span>
                <span className="block text-[#D49B35] dark:text-[#E2B355] mt-0.5">
                  Training
                </span>
              </h2>

              {/* Description */}
              <p
                className={`text-xs sm:text-[15px] leading-[1.6] max-w-[330px] sm:max-w-[490px] mx-auto lg:mx-0 mb-5 sm:mb-6 ${isDark ? "text-[#C8CDD6]" : "text-[#4A5568]"
                  }`}
              >
                Students practice tournament skills, analyze games and prepare
                for competitive play in live supervised arena battles and
                master-reviewed matches.
              </p>

              {/* MOBILE Checkmark Features (1-Column Left-Aligned, Exact Mobile Order) */}
              <div className="grid grid-cols-1 gap-2.5 sm:hidden max-w-[320px] mx-auto mb-1 text-left">
                {mobileHighlights.map((item) => (
                  <div
                    key={item}
                    className={`flex items-center gap-2.5 text-xs font-medium ${isDark ? "text-[#E2E8F0]" : "text-[#1E293B]"
                      }`}
                  >
                    <span className="size-4 rounded-full bg-gradient-to-b from-[#E5B85B] to-[#C88E2B] text-[#071B41] flex items-center justify-center shrink-0 shadow-2xs">
                      <Check className="size-2.5 stroke-[3.2]" />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* DESKTOP/TABLET Checkmark Features (2x2 Grid) */}
              <div className="hidden sm:grid sm:grid-cols-2 gap-x-4 gap-y-3 max-w-[490px] mx-auto lg:mx-0 mb-4 lg:mb-8 text-left">
                {desktopHighlights.map((item) => (
                  <div
                    key={item}
                    className={`flex items-center gap-2.5 text-[13.5px] font-semibold whitespace-nowrap ${isDark ? "text-[#E2E8F0]" : "text-[#1E293B]"
                      }`}
                  >
                    <span className="size-4 rounded-full bg-gradient-to-b from-[#E5B85B] to-[#C88E2B] text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Check className="size-2.5 stroke-[3.2]" />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              {/* Desktop CTA Button */}
              <div className="hidden lg:block">
                <a
                  href="#demo"
                  className="
                    inline-flex items-center justify-center gap-2.5
                    min-h-[48px] px-7 py-3 rounded-xl
                    bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C]
                    hover:from-[#EDC36E] hover:to-[#D89B32]
                    text-[#071B41] font-bold text-sm
                    shadow-[0_8px_24px_rgba(212,155,53,0.35)]
                    hover:shadow-[0_10px_28px_rgba(212,155,53,0.48)]
                    transition-all duration-200 hover:-translate-y-0.5
                  "
                >
                  <span>Join Sunday Training</span>
                  <ArrowRight className="size-4 stroke-[2.4]" />
                </a>
              </div>
            </div>

            {/* MIDDLE-RIGHT COLUMN (Cols 7-10): 2x2 Stat Cards + Mobile Bottom CTA */}
            <div className="lg:col-span-4 w-full">
              {/* Outer Tray on Mobile Light Mode to match the mockup */}
              <div
                className={`max-w-[390px] mx-auto lg:mx-0 rounded-[20px] p-2.5 sm:p-0 ${isDark
                    ? "bg-transparent"
                    : "bg-[#F6F8FC] sm:bg-transparent border border-[#ECF0F6] sm:border-none"
                  }`}
              >
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                  {tournamentStats.map((stat) => {
                    const Icon = stat.Icon;
                    return (
                      <div
                        key={stat.label}
                        className={`group rounded-[16px] sm:rounded-[20px] px-3 py-4 sm:px-5 sm:py-6 text-center border transition-all duration-300 lg:hover:-translate-y-1 ${isDark
                            ? "bg-[#08152E]/90 backdrop-blur-md border-[#E2B355]/30 hover:border-[#E2B355]/70 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.7)]"
                            : "bg-white lg:bg-[#FFFCF7]/95 border-[#EAEFF5] lg:border-[#F3E3C3] hover:border-[#D49B35] shadow-[0_4px_14px_rgba(7,27,65,0.04)] lg:shadow-[0_12px_32px_-8px_rgba(180,130,50,0.12)]"
                          }`}
                      >
                        {/* Circular Soft Gold Icon Badge */}
                        <div
                          className={`size-9 sm:size-11 rounded-full mx-auto mb-2 sm:mb-3 flex items-center justify-center border transition-transform duration-200 group-hover:scale-105 ${isDark
                              ? "bg-[#132347] border-[#E2B355]/30 text-[#E2B355]"
                              : "bg-[#FDF3DC] border-[#F3DFB6] text-[#C58927]"
                            }`}
                        >
                          <Icon className="size-4 sm:size-5" strokeWidth={2} />
                        </div>

                        {/* Stat Number */}
                        <div
                          className={`font-[family-name:var(--font-playfair)] font-bold text-xl sm:text-[28px] leading-tight mb-0.5 sm:mb-1 ${isDark ? "text-white" : "text-[#071B41]"
                            }`}
                        >
                          {stat.value}
                        </div>

                        {/* Stat Label */}
                        <div
                          className={`text-[11px] sm:text-xs font-medium sm:font-semibold ${isDark ? "text-[#C8CDD6]" : "text-[#555C68]"
                            }`}
                        >
                          {stat.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mobile Full-Width CTA Button */}
              <div className="mt-5 lg:hidden max-w-[390px] mx-auto">
                <a
                  href="#demo"
                  className="
                    w-full inline-flex items-center justify-center gap-2
                    min-h-[46px] px-6 py-3 rounded-xl
                    bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C]
                    active:scale-[0.99]
                    text-[#071B41] font-bold text-xs sm:text-sm
                    shadow-[0_8px_24px_rgba(212,155,53,0.35)]
                    transition-transform
                  "
                >
                  <span>Join Sunday Training</span>
                  <ArrowRight className="size-4 stroke-[2.4]" />
                </a>
              </div>
            </div>

            {/* FAR RIGHT SPACER COLUMN (Cols 11-12): Keeps the 3D Golden King completely unobstructed on Desktop */}
            <div className="hidden lg:block lg:col-span-2" aria-hidden="true" />
          </div>
        </div>
      </div>
    </section>
  );
}